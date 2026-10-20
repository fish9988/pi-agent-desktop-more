import type { AssistantContentBlock, AssistantMessage, TextContent, ThinkingContent, ToolCallContent, ToolResultMessage } from "./types";
import { activityKindForTool, toolCallDetail, type WorkActivityKind } from "./work-details";
import { isApplyPatchToolName, isWriteToolName } from "./tool-names";
import { applyPatchResultHasFailures } from "./apply-patch";
import { toolCallLineStats } from "./turn-written-files";

/**
 * Plus: a turn's work as a compact timeline — one line per step ("Run ·
 * npx tsc", "Read · ChatInput.tsx"), thinking as a faint line, and runs of
 * reads/searches folded into one "Read 6 files" line. Pure: the component
 * (components/WorkTimeline.tsx) renders what this returns.
 */

export type TimelineVerb = WorkActivityKind | "write";
export type ToolStatus = "ok" | "error" | "running" | "preparing" | "aborted";

export interface TimelineStepInput {
  key: string;
  entryId?: string;
  message: AssistantMessage;
  isStreaming?: boolean;
  /** Timestamp of the message before this one, for the thinking duration. */
  prevTimestamp?: number;
  /** Block a session search pointed at; its line opens. */
  searchBlock?: AssistantContentBlock;
}

export type TimelineInput =
  | { type: "step"; step: TimelineStepInput }
  | { type: "node"; key: string };

interface EntryBase {
  key: string;
  step: TimelineStepInput;
  blockIndex: number;
  /** First line of its step: carries the step's entry id for find/scroll. */
  first: boolean;
  searchTarget: boolean;
}

export interface TextEntry extends EntryBase { type: "text"; block: TextContent }
export interface ThinkingEntry extends EntryBase { type: "thinking"; block: ThinkingContent; durationSec?: number; active: boolean }
export interface ToolEntry extends EntryBase {
  type: "tool";
  block: ToolCallContent;
  result?: ToolResultMessage;
  kind: WorkActivityKind;
  verb: TimelineVerb;
  detail: string | null;
  status: ToolStatus;
  durationSec?: number;
  stats?: { added: number; removed: number };
}
export interface GroupEntry {
  type: "group";
  key: string;
  /** Tools and the thinking between them, in order. */
  children: Array<ToolEntry | ThinkingEntry>;
  reads: number;
  searches: number;
  failed: boolean;
}
export interface NodeEntry { type: "node"; key: string; index: number }

export type TimelineEntry = TextEntry | ThinkingEntry | ToolEntry | GroupEntry | NodeEntry;

const CD_PREFIX = /^\s*(?:cd|Set-Location|sl|pushd|chdir)(?:\s+\/d)?\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:;|&&|\r?\n)\s*/i;
const ENV_PREFIX = /^\s*(?:\$env:[A-Za-z_][\w]*\s*\+?=\s*(?:"[^"]*"|'[^']*'|[^\s;]+)|export\s+[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|[^\s;&]+)|set\s+[A-Za-z_]\w*=[^&\r\n]*)\s*(?:;|&&|\r?\n)\s*/i;

/** A command without the `cd <dir>;` / `$env:X = …;` set-up most agent commands start with. */
export function stripCommandNoise(command: string): string {
  let text = command;
  for (let i = 0; i < 6; i++) {
    const next = text.replace(CD_PREFIX, "").replace(ENV_PREFIX, "");
    if (next === text) break;
    text = next;
  }
  const trimmed = text.trim();
  return trimmed || command.trim();
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** A path relative to the working directory when it is inside it. */
export function displayPath(filePath: string, cwd?: string): string {
  if (!cwd) return filePath;
  const path = normalizeSlashes(filePath);
  const root = normalizeSlashes(cwd);
  const caseless = /^[a-z]:\//i.test(root);
  const pathKey = caseless ? path.toLowerCase() : path;
  const rootKey = caseless ? root.toLowerCase() : root;
  if (pathKey === rootKey) return ".";
  if (pathKey.startsWith(`${rootKey}/`)) return path.slice(root.length + 1);
  return filePath;
}

function firstLine(text: string, max = 160): string {
  const line = text.split(/\r?\n/).find((part) => part.trim()) ?? "";
  const characters = Array.from(line.trim());
  return characters.length > max ? `${characters.slice(0, max).join("")}…` : line.trim();
}

function stringInput(input: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/** The object of a tool line: the command, a path, a pattern… */
export function toolTarget(block: ToolCallContent, kind: WorkActivityKind, cwd?: string): string | null {
  const input = (block.input ?? {}) as Record<string, unknown>;
  if (kind === "command") {
    const command = stringInput(input, "command", "cmd", "script");
    if (command) return firstLine(stripCommandNoise(command));
  }
  if (kind === "read" || kind === "edit") {
    const path = stringInput(input, "path", "file_path", "filePath", "file");
    if (path) return displayPath(path, cwd);
  }
  if (kind === "search") {
    const pattern = stringInput(input, "pattern", "query", "glob", "regex");
    const path = stringInput(input, "path", "directory", "dir", "cwd");
    if (pattern && path) return `${pattern} · ${displayPath(path, cwd)}`;
    if (pattern) return pattern;
    if (path) return displayPath(path, cwd);
  }
  const detail = toolCallDetail(block);
  return detail ? firstLine(kind === "command" ? stripCommandNoise(detail) : detail) : null;
}

function toolStatus(block: ToolCallContent, result: ToolResultMessage | undefined, live: boolean, streaming: boolean): ToolStatus {
  if (!result) {
    if (streaming && block.rawInput !== undefined) return "preparing";
    return live ? "running" : "aborted";
  }
  if (result.isError) return "error";
  if (isApplyPatchToolName(block.toolName) && applyPatchResultHasFailures(result.details)) return "error";
  return "ok";
}

function isExploring(entry: TimelineEntry): entry is ToolEntry {
  return entry.type === "tool" && (entry.kind === "read" || entry.kind === "search") && (entry.status === "ok" || entry.status === "error");
}

/**
 * Fold runs of finished reads/searches (with the thinking between them) into
 * one group line. A run needs at least two tools; a text block or any other
 * tool ends it.
 */
export function foldExploration(entries: TimelineEntry[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let i = 0;
  while (i < entries.length) {
    if (!isExploring(entries[i])) {
      out.push(entries[i]);
      i += 1;
      continue;
    }
    let j = i;
    let lastTool = i;
    while (j < entries.length && (isExploring(entries[j]) || entries[j].type === "thinking")) {
      if (isExploring(entries[j])) lastTool = j;
      j += 1;
    }
    const run = entries.slice(i, lastTool + 1) as Array<ToolEntry | ThinkingEntry>;
    const tools = run.filter((entry): entry is ToolEntry => entry.type === "tool");
    if (tools.length < 2) {
      out.push(entries[i]);
      i += 1;
      continue;
    }
    out.push({
      type: "group",
      key: `group-${run[0].key}`,
      children: run,
      reads: tools.filter((tool) => tool.kind === "read").length,
      searches: tools.filter((tool) => tool.kind === "search").length,
      failed: tools.some((tool) => tool.status === "error"),
    });
    i = lastTool + 1;
  }
  return out;
}

export function buildTimeline(
  inputs: readonly TimelineInput[],
  toolResults: ReadonlyMap<string, ToolResultMessage> | undefined,
  options: { live: boolean; cwd?: string },
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  inputs.forEach((input, index) => {
    if (input.type === "node") {
      entries.push({ type: "node", key: input.key, index });
      return;
    }
    const { step } = input;
    const blocks = step.message.content ?? [];
    let first = true;
    let thinkingDurationUsed = false;
    blocks.forEach((block: AssistantContentBlock, blockIndex) => {
      const key = `${step.key}-${blockIndex}`;
      const searchTarget = block === step.searchBlock;
      const base = { key, step, blockIndex, first, searchTarget };
      if (block.type === "text") {
        if (!block.text.trim()) return;
        entries.push({ ...base, type: "text", block });
      } else if (block.type === "thinking") {
        if (!block.thinking.trim() && !block.deferred && !(step.isStreaming && blockIndex === blocks.length - 1)) return;
        let durationSec: number | undefined;
        if (!thinkingDurationUsed && step.prevTimestamp && step.message.timestamp && !step.isStreaming) {
          const secs = Math.round((step.message.timestamp - step.prevTimestamp) / 1000);
          if (secs > 0) durationSec = secs;
          thinkingDurationUsed = true;
        }
        entries.push({ ...base, type: "thinking", block, durationSec, active: Boolean(step.isStreaming && blockIndex === blocks.length - 1) });
      } else if (block.type === "toolCall") {
        const result = toolResults?.get(block.toolCallId);
        const kind = activityKindForTool(block.toolName);
        const verb: TimelineVerb = kind === "edit" && isWriteToolName(block.toolName) ? "write" : kind;
        const status = toolStatus(block, result, options.live, Boolean(step.isStreaming));
        let durationSec: number | undefined;
        if (result?.timestamp && step.message.timestamp) {
          const secs = Math.round((result.timestamp - step.message.timestamp) / 1000);
          if (secs > 0) durationSec = secs;
        }
        const stats = result && kind === "edit" ? toolCallLineStats(block.toolName, block.input as Record<string, unknown> | undefined, result) ?? undefined : undefined;
        entries.push({
          ...base,
          type: "tool",
          block,
          result,
          kind,
          verb,
          detail: toolTarget(block, kind, options.cwd),
          status,
          durationSec,
          stats,
        });
      } else {
        return;
      }
      first = false;
    });
  });
  return foldExploration(entries);
}
