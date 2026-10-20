"use client";

import { memo, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useI18n } from "@/hooks/useI18n";
import { getThinkingPreview } from "@/lib/message-display";
import { isThinkingExpandedByDefault } from "@/lib/thinking-expansion-preference";
import { isToolCallExpanded, setToolCallExpanded } from "@/lib/tool-call-expansion";
import { mcpToolLabel } from "@/lib/mcp-tool-display";
import type { ToolResultMessage } from "@/lib/types";
import {
  buildTimeline,
  type GroupEntry,
  type ThinkingEntry,
  type TimelineInput,
  type TimelineStepInput,
  type TimelineVerb,
  type ToolEntry,
} from "@/lib/work-timeline";
import { isSubagentToolDetails, SafeMarkdownBody, ThinkingBlock, ToolCallBlock } from "./MessageView";
import type { StreamingStore } from "@/lib/streaming-message";
import { useLiveSplit } from "./LiveStream";

export type WorkTimelineItem =
  | { type: "step"; step: TimelineStepInput }
  | { type: "node"; key: string; node: ReactNode };

interface Shared {
  toolResults?: Map<string, ToolResultMessage>;
  cwd?: string;
  sessionId?: string;
  onOpenFile?: (filePath: string, page?: number) => void;
  onOpenSession?: (sessionId: string) => void;
}

interface Props extends Shared {
  items: readonly WorkTimelineItem[];
  /** The turn is still running: a tool without a result is in progress, not cancelled. */
  live: boolean;
  /** The reply streaming now: its reasoning/tool calls join the end of the timeline. */
  streamingStore?: StreamingStore;
  /** Runs after each streamed chunk is in the DOM. */
  onStreamCommit?: () => void;
}

const ICON_PATHS: Record<TimelineVerb | "explore", ReactNode> = {
  read: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  explore: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2M8.5 11h5" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  write: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14h6" /></>,
  command: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></>,
  web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  subagent: <><rect x="5" y="7" width="14" height="11" rx="2" /><path d="M9 11h.01M15 11h.01M9 15h6M12 7V4" /></>,
  plan: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01" /></>,
  think: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></>,
  tool: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></>,
};

function Icon({ name }: { name: TimelineVerb | "explore" }) {
  return (
    <span className="work-tl-icon" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICON_PATHS[name] ?? ICON_PATHS.tool}
      </svg>
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className="work-tl-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none" }}>
      <polyline points="4 2.5 7.5 6 4 9.5" />
    </svg>
  );
}

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) ?? path;
}

const ThinkingLine = memo(function ThinkingLine({ entry, sessionId }: { entry: ThinkingEntry; sessionId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => entry.searchTarget || isThinkingExpandedByDefault());
  const preview = getThinkingPreview(entry.block.thinking);
  if (open) {
    return (
      <div className="work-tl-item" data-entry-id={entry.first ? entry.step.entryId : undefined} data-search-target={entry.searchTarget || undefined}>
        <div className="work-tl-detail is-thinking">
          <ThinkingBlock
            block={entry.block}
            duration={entry.durationSec}
            sessionId={sessionId}
            entryId={entry.step.entryId}
            blockIndex={entry.blockIndex}
            initialExpanded
            onCollapse={() => setOpen(false)}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="work-tl-item" data-entry-id={entry.first ? entry.step.entryId : undefined}>
      <button type="button" className={`work-tl-row is-thinking${entry.active ? " is-active" : ""}`} onClick={() => setOpen(true)} title={t("i18n.thinking")}>
        <Icon name="think" />
        <span className={`work-tl-target${entry.active ? " work-shimmer" : ""}`}>
          {preview ? <ReactMarkdown allowedElements={[]} unwrapDisallowed skipHtml>{preview}</ReactMarkdown> : t("i18n.thinking")}
        </span>
        {entry.durationSec !== undefined && <span className="work-tl-meta">{entry.durationSec}s</span>}
      </button>
    </div>
  );
});

const ToolLine = memo(function ToolLine({ entry, onOpenSession }: { entry: ToolEntry; onOpenSession?: (sessionId: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => entry.searchTarget || isToolCallExpanded(entry.block.toolCallId));
  const toggle = () => {
    const next = !open;
    setToolCallExpanded(entry.block.toolCallId, next);
    setOpen(next);
  };
  const mcp = entry.kind === "tool" ? mcpToolLabel(entry.block.toolName, entry.result?.details) : null;
  const verbLabel = entry.kind === "tool"
    ? (mcp ? `${mcp.server}/${mcp.tool}` : entry.block.toolName)
    : t(`work.verb.${entry.verb}`);
  const subagent = isSubagentToolDetails(entry.result?.details) ? entry.result.details : null;
  const statusClass = entry.status === "ok" ? "" : ` is-${entry.status}`;

  return (
    <div className="work-tl-item" data-entry-id={entry.first ? entry.step.entryId : undefined} data-search-target={entry.searchTarget || undefined}>
      <div className={`work-tl-row is-tool${statusClass}${open ? " is-open" : ""}`}>
        <button type="button" className="work-tl-row-main" aria-expanded={open} onClick={toggle} title={entry.block.toolName}>
          <Icon name={entry.verb} />
          <span className="work-tl-verb">{verbLabel}</span>
          {entry.status === "preparing"
            ? <span className="work-tl-target is-dim">{t("chat.generatingToolInput")}</span>
            : entry.detail && <span className="work-tl-target">{entry.detail}</span>}
          <span className="work-tl-meta">
            {entry.stats && (entry.stats.added > 0 || entry.stats.removed > 0) && (
              <span className="work-tl-stats">
                {entry.stats.added > 0 && <span className="is-added">+{entry.stats.added}</span>}
                {entry.stats.removed > 0 && <span className="is-removed">−{entry.stats.removed}</span>}
              </span>
            )}
            {entry.status === "running" && <span className="work-tl-spinner" aria-label={t("work.status.running")} />}
            {entry.status === "aborted" && <span className="work-tl-badge">{t("chat.toolCancelled")}</span>}
            {entry.status === "error" && <span className="work-tl-dot" title={t("work.status.failed")} aria-label={t("work.status.failed")} />}
            {entry.durationSec !== undefined && <span>{entry.durationSec}s</span>}
            <Chevron open={open} />
          </span>
        </button>
        {subagent && onOpenSession && (
          <button type="button" className="work-tl-open" title={t("subagent.open")} aria-label={t("subagent.open")} onClick={() => onOpenSession(subagent.sessionId)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
          </button>
        )}
      </div>
      {open && (
        <div className="work-tl-detail">
          <ToolCallBlock
            block={entry.block}
            result={entry.result}
            duration={entry.durationSec}
            aborted={entry.status === "aborted"}
            onOpenSession={onOpenSession}
            bare
          />
        </div>
      )}
    </div>
  );
});

function GroupLine({ entry, shared }: { entry: GroupEntry; shared: Shared }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => entry.children.some((child) => child.searchTarget));
  const parts: string[] = [];
  if (entry.reads > 0) parts.push(t("work.group.reads", { count: entry.reads }));
  if (entry.searches > 0) parts.push(t("work.group.searches", { count: entry.searches }));
  const names = entry.children
    .filter((child): child is ToolEntry => child.type === "tool" && child.kind === "read" && Boolean(child.detail))
    .map((child) => basename(child.detail ?? ""));
  const unique = [...new Set(names)];
  const preview = unique.slice(0, 3).join(", ") + (unique.length > 3 ? ` +${unique.length - 3}` : "");
  const first = entry.children.find((child) => child.first);

  return (
    <div className="work-tl-item" data-entry-id={first?.step.entryId}>
      <div className={`work-tl-row is-group${entry.failed ? " is-error" : ""}${open ? " is-open" : ""}`}>
        <button type="button" className="work-tl-row-main" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <Icon name={entry.reads > 0 && entry.searches === 0 ? "read" : "explore"} />
          <span className="work-tl-verb">{parts.join(t("work.group.separator"))}</span>
          {preview && <span className="work-tl-target">{preview}</span>}
          <span className="work-tl-meta">
            {entry.failed && <span className="work-tl-dot" title={t("work.status.failed")} />}
            <Chevron open={open} />
          </span>
        </button>
      </div>
      {open && (
        <div className="work-tl-children">
          {entry.children.map((child) => child.type === "tool"
            ? <ToolLine key={child.key} entry={child} onOpenSession={shared.onOpenSession} />
            : <ThinkingLine key={child.key} entry={child} sessionId={shared.sessionId} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Plus: a turn's work as one line per step. Used inside the work groups at
 * the compact and standard detail levels; the detailed levels keep the full
 * cards.
 */
export function WorkTimeline({ items, live, toolResults, cwd, sessionId, onOpenFile, onOpenSession, streamingStore, onStreamCommit }: Props) {
  const { process: streamingProcess } = useLiveSplit(streamingStore, true);
  useLayoutEffect(() => { onStreamCommit?.(); }, [streamingProcess, onStreamCommit]);
  const allItems = useMemo<readonly WorkTimelineItem[]>(() => (
    streamingProcess
      ? [...items, { type: "step", step: { key: "live-stream", message: streamingProcess, isStreaming: true } }]
      : items
  ), [items, streamingProcess]);
  const inputs = useMemo<TimelineInput[]>(() => allItems.map((item) => (
    item.type === "step" ? { type: "step", step: item.step } : { type: "node", key: item.key }
  )), [allItems]);
  const entries = useMemo(() => buildTimeline(inputs, toolResults, { live, cwd }), [inputs, toolResults, live, cwd]);
  const shared: Shared = { toolResults, cwd, sessionId, onOpenFile, onOpenSession };

  return (
    <div className="work-timeline">
      {entries.map((entry) => {
        if (entry.type === "node") {
          const item = allItems[entry.index];
          return item?.type === "node" ? <div key={entry.key} className="work-tl-node">{item.node}</div> : null;
        }
        if (entry.type === "group") return <GroupLine key={entry.key} entry={entry} shared={shared} />;
        if (entry.type === "tool") return <ToolLine key={entry.key} entry={entry} onOpenSession={onOpenSession} />;
        if (entry.type === "thinking") return <ThinkingLine key={entry.key} entry={entry} sessionId={sessionId} />;
        return (
          <div
            key={entry.key}
            className="work-tl-item work-tl-text"
            data-entry-id={entry.first ? entry.step.entryId : undefined}
            data-search-target={entry.searchTarget || undefined}
            data-message-text
          >
            <SafeMarkdownBody isStreaming={entry.step.isStreaming} cwd={cwd} onOpenFile={onOpenFile} artifacts>{entry.block.text}</SafeMarkdownBody>
          </div>
        );
      })}
    </div>
  );
}
