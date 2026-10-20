import type { AgentMessage, AssistantContentBlock, AssistantMessage, ToolCallContent, ToolResultMessage } from "./types";

/**
 * Plus: how much of an agent turn's work (reasoning + tool calls) the chat
 * shows. Modelled on DeepSeek Harness's "Work details" setting: four levels
 * map onto a small policy table, and rendering reads only the policy flags.
 */
export type WorkDetailsLevel = "compact" | "standard" | "detailed" | "verbose";
/** When a finished turn's work folds away. */
export type WorkCollapseTiming = "completion" | "next-input";

export const WORK_DETAILS_LEVELS: readonly WorkDetailsLevel[] = ["compact", "standard", "detailed", "verbose"];
export const DEFAULT_WORK_DETAILS_LEVEL: WorkDetailsLevel = "standard";
export const DEFAULT_WORK_COLLAPSE_TIMING: WorkCollapseTiming = "completion";

export interface WorkDetailsPolicy {
  /** A finished turn's work sits behind one summary row. */
  foldCompletedTurns: boolean;
  /** While a turn runs, its work is grouped behind one live row. */
  groupLiveWork: boolean;
  /** The live row names the current target (command, path, query…). */
  liveDetail: boolean;
  /** Steps inside a group drop per-step model labels and usage lines. */
  compactSteps: boolean;
}

export const WORK_DETAILS_POLICY: Record<WorkDetailsLevel, WorkDetailsPolicy> = {
  compact: { foldCompletedTurns: true, groupLiveWork: true, liveDetail: false, compactSteps: true },
  standard: { foldCompletedTurns: true, groupLiveWork: true, liveDetail: true, compactSteps: true },
  detailed: { foldCompletedTurns: true, groupLiveWork: false, liveDetail: true, compactSteps: false },
  verbose: { foldCompletedTurns: false, groupLiveWork: false, liveDetail: true, compactSteps: false },
};

export function normalizeWorkDetailsLevel(value: unknown): WorkDetailsLevel {
  return WORK_DETAILS_LEVELS.includes(value as WorkDetailsLevel) ? value as WorkDetailsLevel : DEFAULT_WORK_DETAILS_LEVEL;
}

export function normalizeWorkCollapseTiming(value: unknown): WorkCollapseTiming {
  return value === "next-input" ? "next-input" : DEFAULT_WORK_COLLAPSE_TIMING;
}

export type WorkActivityKind = "read" | "search" | "edit" | "command" | "web" | "subagent" | "plan" | "question" | "think" | "tool";

const ACTIVITY_BY_TOOL: Array<[RegExp, WorkActivityKind]> = [
  [/^(read|read_file|view|cat|open_file|read_image)$/i, "read"],
  [/^(grep|find|ls|glob|search|list|list_dir|codesearch|rg)$/i, "search"],
  [/^(edit|write|multiedit|apply_patch|patch|str_replace|create_file|notebook_edit)$/i, "edit"],
  [/^(bash|shell|powershell|pwsh|exec|run|terminal|command)$/i, "command"],
  [/(web|fetch|browse|url|http)/i, "web"],
  [/(subagent|agent|task|delegate)/i, "subagent"],
  [/(todo|plan)/i, "plan"],
  [/(question|ask_user|askuser|ask)/i, "question"],
];

export function activityKindForTool(toolName: string): WorkActivityKind {
  const name = toolName.replace(/^mcp__[^_]+__/, "");
  for (const [pattern, kind] of ACTIVITY_BY_TOOL) {
    if (pattern.test(name)) return kind;
  }
  return "tool";
}

// Argument keys that name what a call is about, in preference order.
const DETAIL_KEYS = [
  "description", "title", "command", "cmd", "path", "file_path", "filePath", "file",
  "pattern", "query", "queries", "url", "urls", "prompt", "task", "name",
];

function clipDetail(value: string, max = 120): string {
  const flat = value.replace(/\s+/g, " ").trim();
  const characters = Array.from(flat);
  return characters.length > max ? `${characters.slice(0, max).join("")}…` : flat;
}

/** The first useful argument of a tool call, flattened to one short line. */
export function toolCallDetail(block: ToolCallContent): string | null {
  const input = block.input ?? {};
  for (const key of DETAIL_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return clipDetail(value);
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return clipDetail(value[0]);
  }
  if (block.rawInput) {
    const match = /"(?:command|path|file_path|pattern|query|url|description)"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(block.rawInput);
    if (match?.[1]) return clipDetail(match[1].replace(/\\n/g, " ").replace(/\\"/g, "\""));
  }
  return null;
}

export interface WorkActivity {
  kind: WorkActivityKind;
  /** Tool name, when the activity is a tool call. */
  toolName?: string;
  detail: string | null;
  /** True while the tool's arguments are still streaming. */
  preparing?: boolean;
}

function lastThinkingLine(text: string): string | null {
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const last = paragraphs.at(-1);
  if (!last) return null;
  const firstLine = last.split(/\r?\n/)[0]?.replace(/^[#*>\-\s]+/, "") ?? "";
  return firstLine ? clipDetail(firstLine) : null;
}

/**
 * What the agent is doing right now: the newest tool call without a result
 * (or still streaming its arguments), otherwise the newest reasoning.
 */
export function currentWorkActivity(
  messages: readonly AgentMessage[],
  streaming: AssistantMessage | null,
  toolResults: ReadonlyMap<string, ToolResultMessage>,
): WorkActivity | null {
  const candidates: AssistantContentBlock[] = [];
  for (const message of messages) {
    if (message.role === "assistant") candidates.push(...((message as AssistantMessage).content ?? []));
  }
  if (streaming) candidates.push(...(streaming.content ?? []));
  for (let i = candidates.length - 1; i >= 0; i--) {
    const block = candidates[i];
    if (block.type === "toolCall") {
      if (toolResults.has(block.toolCallId) && !(streaming?.content ?? []).includes(block)) break;
      return {
        kind: activityKindForTool(block.toolName),
        toolName: block.toolName,
        detail: toolCallDetail(block),
        preparing: block.rawInput !== undefined,
      };
    }
    if (block.type === "thinking" && block.thinking.trim()) {
      return { kind: "think", detail: lastThinkingLine(block.thinking) };
    }
    if (block.type === "text" && block.text.trim()) break;
  }
  return null;
}

/** Up to three activity kinds of a finished turn, most frequent first. */
export function summarizeWorkActivities(messages: readonly AgentMessage[]): WorkActivityKind[] {
  const counts = new Map<WorkActivityKind, number>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const block of (message as AssistantMessage).content ?? []) {
      if (block.type !== "toolCall") continue;
      const kind = activityKindForTool(block.toolName);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kind]) => kind);
}

/** "1分05秒"-style duration, localised by the caller's unit labels. */
export function formatWorkDuration(ms: number, units: { h: string; m: string; s: string }): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}${units.h}${String(m).padStart(2, "0")}${units.m}`;
  if (m > 0) return `${m}${units.m}${String(s).padStart(2, "0")}${units.s}`;
  return `${s}${units.s}`;
}

/** Message timestamp in ms, when the message carries one. */
export function messageTime(message: AgentMessage | undefined): number | null {
  const value = (message as { timestamp?: unknown } | undefined)?.timestamp;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Plain text of a message, for in-conversation search. */
export function searchableMessageText(message: AgentMessage, toolResults: ReadonlyMap<string, ToolResultMessage>): string {
  const parts: string[] = [];
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") parts.push(content);
  if (Array.isArray(content)) {
    for (const block of content as Array<Record<string, unknown>>) {
      if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
      else if (block.type === "thinking" && typeof block.thinking === "string") parts.push(block.thinking);
      else if (block.type === "toolCall") {
        parts.push(String(block.toolName ?? ""));
        try { parts.push(JSON.stringify(block.input ?? {})); } catch { /* ignore */ }
        const result = toolResults.get(String(block.toolCallId));
        if (result) {
          for (const item of result.content ?? []) {
            if (item.type === "text") parts.push(item.text);
          }
        }
      }
    }
  }
  if (message.role === "bashExecution") {
    const bash = message as unknown as { command?: string; output?: string };
    parts.push(bash.command ?? "", bash.output ?? "");
  }
  return parts.join("\n");
}
