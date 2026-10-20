"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { useWorkDetails } from "@/hooks/useWorkDetails";
import {
  formatWorkDuration,
  WORK_DETAILS_LEVELS,
  type WorkActivity,
  type WorkActivityKind,
} from "@/lib/work-details";

type Translate = (key: string, params?: Record<string, string | number>) => string;

function durationText(ms: number, t: Translate): string {
  return formatWorkDuration(ms, { h: t("work.unit.h"), m: t("work.unit.m"), s: t("work.unit.s") });
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg className="work-group-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? "rotate(90deg)" : "none" }}>
      <polyline points="4 2.5 7.5 6 4 9.5" />
    </svg>
  );
}

/** Follow a "expand all / collapse all" request once per generation. */
function useBulkExpansion(setExpanded: (value: boolean) => void) {
  const { bulk } = useWorkDetails();
  const seenRef = useRef(bulk.generation);
  useEffect(() => {
    if (bulk.generation === seenRef.current) return;
    seenRef.current = bulk.generation;
    setExpanded(bulk.expanded);
  }, [bulk.generation, bulk.expanded, setExpanded]);
}

/**
 * Level picker shown on work group headers, so the detail level can change
 * while a turn is still running. Rendered as a small popover menu.
 */
export function WorkDetailsMenu({ className }: { className?: string }) {
  const { t } = useI18n();
  const { level, setLevel, collapseTiming, setCollapseTiming, setAllExpanded } = useWorkDetails();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 220;
    setPosition({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`work-details-menu-trigger${className ? ` ${className}` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("work.hint")}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="9" y2="18" />
        </svg>
        <span>{t(`work.level.${level}`)}</span>
      </button>
      {open && position && createPortal(
        <div
          ref={menuRef}
          className="native-popover app-menu work-details-menu"
          role="menu"
          aria-label={t("work.title")}
          style={{ position: "fixed", top: position.top, left: position.left, zIndex: 720, width: 220 }}
        >
          <div className="work-details-menu-heading">{t("work.title")}</div>
          {WORK_DETAILS_LEVELS.map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={level === value}
              className={`work-details-menu-item${level === value ? " is-active" : ""}`}
              onClick={() => { setLevel(value); setOpen(false); }}
            >
              <span className="work-details-menu-check" aria-hidden="true">{level === value ? "✓" : ""}</span>
              <span className="work-details-menu-text">
                <span>{t(`work.level.${value}`)}</span>
                <span className="work-details-menu-hint">{t(`work.levelHint.${value}`)}</span>
              </span>
            </button>
          ))}
          <div className="work-details-menu-separator" role="separator" />
          <div className="work-details-menu-heading">{t("work.collapseTiming")}</div>
          {(["completion", "next-input"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={collapseTiming === value}
              className={`work-details-menu-item${collapseTiming === value ? " is-active" : ""}`}
              onClick={() => { setCollapseTiming(value); setOpen(false); }}
            >
              <span className="work-details-menu-check" aria-hidden="true">{collapseTiming === value ? "✓" : ""}</span>
              <span className="work-details-menu-text">{t(value === "completion" ? "work.collapse.completion" : "work.collapse.nextInput")}</span>
            </button>
          ))}
          <div className="work-details-menu-separator" role="separator" />
          <div className="work-details-menu-row">
            <button type="button" role="menuitem" className="work-details-menu-chip" onClick={() => { setAllExpanded(true); setOpen(false); }}>
              {t("work.expandAll")}
            </button>
            <button type="button" role="menuitem" className="work-details-menu-chip" onClick={() => { setAllExpanded(false); setOpen(false); }}>
              {t("work.collapseAll")}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function activitySummary(kinds: WorkActivityKind[], t: Translate): string | null {
  if (kinds.length === 0) return null;
  return kinds.map((kind) => t(`work.activity.${kind}`)).join(" · ");
}

interface FinishedWorkGroupProps {
  messageCount: number;
  toolCallCount: number;
  durationMs: number | null;
  activities: WorkActivityKind[];
  answered: boolean;
  defaultExpanded?: boolean;
  /** Search or find wants this group's content visible. */
  reveal?: boolean;
  children: ReactNode;
}

/** A finished turn's work behind one summary row (Plus). */
export function FinishedWorkGroup({ messageCount, toolCallCount, durationMs, activities, answered, defaultExpanded = false, reveal = false, children }: FinishedWorkGroupProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(defaultExpanded);
  useBulkExpansion(setExpanded);
  useLayoutEffect(() => {
    if (reveal) setExpanded(true);
  }, [reveal]);
  const open = expanded || reveal;
  const status = !answered
    ? t("work.unanswered")
    : durationMs != null && durationMs >= 1000
      ? t("work.completedIn", { duration: durationText(durationMs, t) })
      : t("work.completed");
  const parts = [status];
  if (toolCallCount > 0) parts.push(t("work.toolCalls", { count: toolCallCount }));
  else parts.push(`${messageCount} ${t(messageCount === 1 ? "chat.message" : "chat.messages")}`);
  const summary = activitySummary(activities, t);

  return (
    <div className={`process-details work-group is-finished${open ? " is-open" : ""}`}>
      <div className="work-group-header">
        <button
          className="process-details-trigger work-group-trigger"
          type="button"
          aria-expanded={open}
          onClick={() => setExpanded((value) => !value)}
          title={open ? t("chat.collapseProcess") : t("chat.expandProcess")}
        >
          <Chevron expanded={open} />
          <span className="work-group-title">{parts.join(" · ")}</span>
          {summary && <span className="work-group-summary">{summary}</span>}
        </button>
        <WorkDetailsMenu className="is-hover-only" />
      </div>
      {open && <div className="work-group-body">{children}</div>}
    </div>
  );
}

interface LiveWorkGroupProps {
  activity: WorkActivity | null;
  /** Shown when no tool is running, e.g. "Waiting for model…". */
  idleLabel?: string | null;
  showDetail: boolean;
  stepCount: number;
  toolCallCount: number;
  startedAt: number | null;
  reveal?: boolean;
  children: ReactNode;
}

/**
 * The running turn's work behind one live row (Plus). The row names what the
 * agent is doing right now; it can be opened and closed at any time while the
 * turn runs. An open body is height-capped and follows new output until the
 * user scrolls inside it.
 */
export function LiveWorkGroup({ activity, idleLabel, showDetail, stepCount, toolCallCount, startedAt, reveal = false, children }: LiveWorkGroupProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  useBulkExpansion(setExpanded);
  useLayoutEffect(() => {
    if (reveal) setExpanded(true);
  }, [reveal]);
  const open = expanded || reveal;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Keep a title on screen briefly so fast tool runs do not flicker.
  const label = activity
    ? (activity.preparing
      ? t("work.preparing", { activity: t(`work.activity.${activity.kind}`) })
      : t(`work.activity.${activity.kind}`))
    : (idleLabel || t("work.running"));
  const detail = showDetail && activity?.detail ? activity.detail : null;
  const [shown, setShown] = useState({ label, detail });
  const shownAtRef = useRef(0);
  useEffect(() => {
    if (shown.label === label && shown.detail === detail) return;
    const wait = Math.max(0, 150 - (Date.now() - shownAtRef.current));
    const id = window.setTimeout(() => {
      shownAtRef.current = Date.now();
      setShown({ label, detail });
    }, wait);
    return () => window.clearTimeout(id);
  }, [label, detail, shown.label, shown.detail]);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  useEffect(() => {
    const body = bodyRef.current;
    if (!open || !body) return;
    followRef.current = true;
    body.scrollTop = body.scrollHeight;
    const observer = new ResizeObserver(() => {
      if (followRef.current) body.scrollTop = body.scrollHeight;
    });
    for (const child of Array.from(body.children)) observer.observe(child);
    observer.observe(body);
    const mutation = new MutationObserver(() => {
      for (const child of Array.from(body.children)) observer.observe(child);
      if (followRef.current) body.scrollTop = body.scrollHeight;
    });
    mutation.observe(body, { childList: true });
    return () => {
      observer.disconnect();
      mutation.disconnect();
    };
  }, [open]);

  const meta: string[] = [];
  if (stepCount > 0) meta.push(t("work.steps", { count: stepCount }));
  if (toolCallCount > 0) meta.push(t("work.toolCalls", { count: toolCallCount }));
  if (startedAt != null) meta.push(durationText(now - startedAt, t));

  return (
    <div className={`process-details work-group is-live${open ? " is-open" : ""}`}>
      <div className="work-group-header">
        <button
          className="process-details-trigger work-group-trigger"
          type="button"
          aria-expanded={open}
          onClick={() => setExpanded((value) => !value)}
          title={open ? t("chat.collapseProcess") : t("chat.expandProcess")}
        >
          <Chevron expanded={open} />
          <span className="work-group-title work-shimmer" aria-live="polite">
            {shown.label}
            {shown.detail && <span className="work-group-detail"> · {shown.detail}</span>}
          </span>
          {meta.length > 0 && <span className="work-group-summary">{meta.join(" · ")}</span>}
        </button>
        <WorkDetailsMenu />
      </div>
      {open && (
        <div
          ref={bodyRef}
          className="work-group-body is-live-body"
          onScroll={(event) => {
            const body = event.currentTarget;
            followRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 24;
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
