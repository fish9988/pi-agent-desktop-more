"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/hooks/useI18n";
import { searchableMessageText } from "@/lib/work-details";
import type { AgentMessage, ToolResultMessage } from "@/lib/types";

const HIGHLIGHT_ALL = "pi-chat-find";
const HIGHLIGHT_CURRENT = "pi-chat-find-current";
const MAX_HIGHLIGHT_RANGES = 3000;

interface FindMatch {
  entryId: string;
  count: number;
}

interface UseChatFindOptions {
  messages: readonly AgentMessage[];
  entryIds: readonly string[];
  toolResults: ReadonlyMap<string, ToolResultMessage>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

type HighlightRegistry = { set(name: string, value: unknown): void; delete(name: string): void };

function highlightRegistry(): HighlightRegistry | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  return css?.highlights ?? null;
}

// Injected at runtime: the build's CSS parser does not know ::highlight() yet
// and would warn about (or drop) the rule.
const HIGHLIGHT_STYLE_ID = "pi-chat-find-highlight-style";
function ensureHighlightStyle(): void {
  if (typeof document === "undefined" || document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `::highlight(${HIGHLIGHT_ALL}) { background-color: rgba(250, 204, 21, 0.38); color: inherit; }
::highlight(${HIGHLIGHT_CURRENT}) { background-color: rgba(249, 115, 22, 0.6); color: inherit; }`;
  document.head.appendChild(style);
}

function clearHighlights(): void {
  const registry = highlightRegistry();
  registry?.delete(HIGHLIGHT_ALL);
  registry?.delete(HIGHLIGHT_CURRENT);
}

/**
 * Plus: in-conversation find (Ctrl/Cmd+F).
 *
 * Matching runs on the session data, not the DOM, so text inside folded work
 * groups, collapsed reasoning and tool output is found too. Moving to a match
 * reveals the group that holds it (`revealEntryId`) and scrolls to it; visible
 * occurrences are painted with the CSS Custom Highlight API, which never
 * touches React's DOM. Works while the agent is running.
 */
export function useChatFind({ messages, entryIds, toolResults, scrollContainerRef }: UseChatFindOptions) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const matches = useMemo<FindMatch[]>(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!open || needle.length === 0) return [];
    const found: FindMatch[] = [];
    messages.forEach((message, messageIndex) => {
      const entryId = entryIds[messageIndex];
      if (!entryId || message.role === "toolResult") return;
      const haystack = searchableMessageText(message, toolResults).toLocaleLowerCase();
      let count = 0;
      for (let at = haystack.indexOf(needle); at !== -1 && count < 999; at = haystack.indexOf(needle, at + needle.length)) count += 1;
      if (count > 0) found.push({ entryId, count });
    });
    return found;
  }, [open, query, messages, entryIds, toolResults]);

  const total = matches.length;
  const current = total > 0 ? matches[Math.min(index, total - 1)] : null;
  const revealEntryId = open ? current?.entryId ?? null : null;

  useEffect(() => { setIndex(0); }, [query]);

  const next = useCallback(() => setIndex((value) => (total === 0 ? 0 : (value + 1) % total)), [total]);
  const prev = useCallback(() => setIndex((value) => (total === 0 ? 0 : (value - 1 + total) % total)), [total]);

  // Scroll to the current match once its group has had a chance to open.
  useEffect(() => {
    if (!revealEntryId) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        const element = container?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(revealEntryId)}"]`);
        if (!container || !element) return;
        const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 72;
        container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealEntryId, index, scrollContainerRef]);

  // Paint visible occurrences; repaint as streaming output changes the DOM.
  useEffect(() => {
    const registry = highlightRegistry();
    const container = scrollContainerRef.current;
    const needle = query.trim().toLocaleLowerCase();
    if (!open || !registry || !container || !needle) {
      clearHighlights();
      return;
    }
    const HighlightCtor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!HighlightCtor) return;
    ensureHighlightStyle();
    let timer: number | null = null;
    const paint = () => {
      timer = null;
      const all: Range[] = [];
      const currentRanges: Range[] = [];
      const currentElement = revealEntryId
        ? container.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(revealEntryId)}"]`)
        : null;
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => (node.parentElement?.closest(".chat-find-bar, script, style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      for (let node = walker.nextNode(); node && all.length < MAX_HIGHLIGHT_RANGES; node = walker.nextNode()) {
        const text = node.nodeValue?.toLocaleLowerCase() ?? "";
        for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + needle.length);
          all.push(range);
          if (currentElement?.contains(node)) currentRanges.push(range);
        }
      }
      registry.set(HIGHLIGHT_ALL, new HighlightCtor(...all));
      registry.set(HIGHLIGHT_CURRENT, new HighlightCtor(...currentRanges));
    };
    paint();
    const observer = new MutationObserver(() => {
      if (timer === null) timer = window.setTimeout(paint, 250);
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [open, query, revealEntryId, scrollContainerRef, messages]);

  useEffect(() => () => clearHighlights(), []);

  // Ctrl/Cmd+F opens the bar unless a terminal or code editor has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "f") return;
      const active = document.activeElement;
      if (active?.closest(".xterm, .cm-editor, .monaco-editor, [data-own-find]")) return;
      if (!scrollContainerRef.current?.isConnected) return;
      event.preventDefault();
      setOpen(true);
      window.setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(".chat-find-bar input");
        input?.focus();
        input?.select();
      }, 0);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [scrollContainerRef]);

  const close = useCallback(() => {
    setOpen(false);
    clearHighlights();
  }, []);

  return { open, setOpen, close, query, setQuery, total, index: total === 0 ? 0 : Math.min(index, total - 1), current, next, prev, revealEntryId };
}

export type ChatFindState = ReturnType<typeof useChatFind>;

export function ChatFindBar({ find }: { find: ChatFindState }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  if (!find.open) return null;
  const hasQuery = find.query.trim().length > 0;
  return (
    <div className="chat-find-bar" role="search">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        autoFocus
        value={find.query}
        placeholder={t("find.placeholder")}
        title={t("find.includeWork")}
        aria-label={t("find.placeholder")}
        onChange={(event) => find.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) find.prev();
            else find.next();
          } else if (event.key === "Escape") {
            event.preventDefault();
            find.close();
          }
        }}
      />
      <span className="chat-find-count" aria-live="polite">
        {hasQuery ? (find.total > 0 ? `${find.index + 1}/${find.total}` : t("find.noResults")) : ""}
      </span>
      <button type="button" onClick={find.prev} disabled={find.total === 0} title={t("find.prev")} aria-label={t("find.prev")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
      </button>
      <button type="button" onClick={find.next} disabled={find.total === 0} title={t("find.next")} aria-label={t("find.next")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      <button type="button" onClick={find.close} title={t("find.close")} aria-label={t("find.close")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}
