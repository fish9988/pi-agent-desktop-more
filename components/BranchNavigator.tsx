"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { LeafChangeOptions, SessionEntry, SessionTreeNode } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import {
  buildActivePath,
  chainHasConversation,
  compressChain,
  hasNavigableBranches,
  hasSessionBranches,
  isMessageEntry,
  selectTopLevelBranches,
} from "@/lib/branch-decisions";

// The tree helpers moved to lib/branch-decisions.ts so the per-answer footer
// pager and this panel read the same shape. Their tests import them from here.
export {
  buildActivePath,
  chainHasConversation,
  compressChain,
  hasNavigableBranches,
  hasSessionBranches,
  selectTopLevelBranches,
};

function getLabel(entry: SessionEntry): string {
  if (entry.type === "message" && isMessageEntry(entry)) {
    const msg = entry.message as { role: string; content: unknown };
    const content = msg.content;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join(" ");
    }
    if (text.length > 40) text = text.slice(0, 40) + "…";
    if (text) return text;
    if (msg.role === "assistant") return "[assistant]";
  }
  return entry.type;
}

interface Props {
  tree: SessionTreeNode[];
  activeLeafId: string | null;
  onLeafChange: (leafId: string | null, options?: LeafChangeOptions) => void;
  /** When true, renders as a compact inline button for embedding in a top bar */
  inline?: boolean;
  /** When inline, use this ref's bounding rect to size/position the dropdown */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Controlled open state for inline mode */
  open?: boolean;
  /** Called when the button is clicked in inline mode */
  onToggle?: () => void;
  /** Whether a session is currently active (used to show appropriate empty reason) */
  hasSession?: boolean;
  /** When inline, render icon-only (no text label) to save horizontal space */
  compact?: boolean;
  /** Horizontal px to keep clear on the dropdown's left (e.g. an open sidebar
   *  that paints above the top bar's stacking context) */
  /** Horizontal px to keep clear on the dropdown's right (e.g. the wide-desktop
   *  file panel in split layout). The dropdown's left edge comes from the
   *  anchor's own rect, which already excludes the sidebar. */
  reserveRight?: number;
  /** Keep the inline dropdown mounted while another control supplies its trigger */
  hideInlineButton?: boolean;
  /** The session is running: the tree stays readable but branches cannot be switched */
  locked?: boolean;
}

interface TreeNodeProps {
  node: SessionTreeNode;
  activePathIds: Set<string>;
  depth: number;
  isLast: boolean;
  parentLines: boolean[]; // whether ancestor at each depth has more siblings after
  /** Absent while switching is locked */
  onSelect?: (id: string) => void;
  /** Absent while switching is locked */
  summary?: BranchSummaryControls;
}

/**
 * pi can summarize the branch being left onto the one entered ("Summarize branch?" in the
 * TUI's /tree). A plain click stays a plain switch, since rows are also how branches are
 * browsed; rows of other branches offer the summarized switch as a separate action.
 */
interface BranchSummaryControls {
  targetId: string | null;
  open: (id: string) => void;
  confirm: (id: string, customInstructions: string) => void;
  cancel: () => void;
}

function BranchSummaryForm({ onConfirm, onCancel }: { onConfirm: (customInstructions: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [instructions, setInstructions] = useState("");
  return (
    <form
      className="branch-summary-form"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(instructions);
      }}
    >
      <input
        autoFocus
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.stopPropagation();
            onCancel();
          }
        }}
        placeholder={t("i18n.branchSummaryInstructionsPlaceholder")}
        aria-label={t("i18n.branchSummaryInstructionsPlaceholder")}
      />
      <button type="submit" className="branch-summary-confirm">{t("i18n.branchSummarizeAction")}</button>
      <button type="button" onClick={onCancel}>{t("chat.cancel")}</button>
    </form>
  );
}

function TreeNodeView({ node, activePathIds, depth, isLast, parentLines, onSelect, summary }: TreeNodeProps) {
  const { t } = useI18n();
  const { node: rep, skipped, branchPreview, labelEntry } = compressChain(node);
  const isActive = activePathIds.has(rep.entry.id);
  const isOnPath = activePathIds.has(node.entry.id) || activePathIds.has(rep.entry.id);
  const label = branchPreview?.text ?? getLabel(labelEntry);
  const role = branchPreview
    ? branchPreview.role ?? null
    : isMessageEntry(labelEntry)
      ? (labelEntry as { message: { role: string } }).message.role
      : null;

  return (
    <div>
      {/* This node row */}
      <div
        className="branch-tree-row"
        style={{
          display: "flex",
          alignItems: "center",
          height: 24,
          cursor: onSelect ? "pointer" : "default",
        }}
        onClick={onSelect ? () => onSelect(rep.entry.id) : undefined}
      >
        {/* Indent guide lines */}
        {parentLines.map((hasLine, i) => (
          <div key={i} style={{ width: 16, flexShrink: 0, position: "relative", height: "100%", alignSelf: "stretch" }}>
            {hasLine && (
              <div style={{
                position: "absolute",
                left: 7,
                top: 0,
                bottom: 0,
                width: 1,
                background: "var(--border)",
              }} />
            )}
          </div>
        ))}

        {/* Branch connector */}
        <div style={{ width: 16, flexShrink: 0, position: "relative", height: "100%", alignSelf: "stretch" }}>
          {/* vertical line up (to parent) */}
          <div style={{
            position: "absolute",
            left: 7,
            top: 0,
            bottom: isLast ? "50%" : 0,
            width: 1,
            background: "var(--border)",
          }} />
          {/* horizontal line to node */}
          <div style={{
            position: "absolute",
            left: 7,
            top: "50%",
            width: 9,
            height: 1,
            background: "var(--border)",
          }} />
        </div>

        {/* Node dot */}
        <div style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          flexShrink: 0,
          background: isActive ? "var(--accent)" : isOnPath ? "var(--text-muted)" : "var(--border)",
          border: isActive ? "none" : "1px solid var(--text-dim)",
          marginRight: 6,
          transition: "background 0.12s",
        }} />

        {/* Role badge */}
        {role && (
          <span style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: role === "user" ? "var(--accent)" : "var(--text-dim)",
            background: role === "user" ? "var(--accent-soft, var(--user-bg))" : "var(--bg-hover)",
            border: `1px solid ${role === "user" ? "var(--accent-border, var(--border))" : "var(--border)"}`,
            borderRadius: 3,
            padding: "0 4px",
            marginRight: 5,
            flexShrink: 0,
            lineHeight: "16px",
          }}>
            {role === "user" ? "U" : "A"}
          </span>
        )}

        {/* Skipped indicator */}
        {skipped > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-dim)", marginRight: 5, flexShrink: 0 }}>
            +{skipped}
          </span>
        )}

        {/* Current-branch badge */}
        {isActive && (
          <span className="branch-current-badge">{t("i18n.branchCurrent")}</span>
        )}

        {/* Label */}
        <span style={{
          fontSize: 12,
          color: isActive ? "var(--text)" : isOnPath ? "var(--text-muted)" : "var(--text-dim)",
          fontWeight: isActive ? 500 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}>
          {label}
        </span>
        {summary && !isOnPath && summary.targetId !== rep.entry.id && (
          <button
            type="button"
            className="branch-summary-action"
            title={t("i18n.branchSummarizeHint")}
            onClick={(event) => {
              event.stopPropagation();
              summary.open(rep.entry.id);
            }}
          >
            {t("i18n.branchSummarizeAction")}
          </button>
        )}
      </div>
      {summary?.targetId === rep.entry.id && (
        <BranchSummaryForm
          onConfirm={(instructions) => summary.confirm(rep.entry.id, instructions)}
          onCancel={summary.cancel}
        />
      )}

      {/* Children */}
      {rep.children.map((child, idx) => (
        <TreeNodeView
          key={child.entry.id}
          node={child}
          activePathIds={activePathIds}
          depth={depth + 1}
          isLast={idx === rep.children.length - 1}
          parentLines={[...parentLines, !isLast]}
          onSelect={onSelect}
          summary={summary}
        />
      ))}
    </div>
  );
}

export function BranchNavigator({ tree, activeLeafId, onLeafChange, inline, containerRef, open: openProp, onToggle, hasSession, compact, hideInlineButton, reserveRight = 0, locked = false }: Props) {
  const { t } = useI18n();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp !== undefined ? openProp : openInternal;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open || !inline) return;
    const anchor = containerRef?.current ?? btnRef.current;
    if (!anchor) return;
    const update = () => {
      const rect = (hideInlineButton ? anchor : btnRef.current)?.getBoundingClientRect() ?? anchor.getBoundingClientRect();
      // Anchored to the control itself: anchoring to the top bar made the panel
      // as wide as the window, which read as a full-page overlay.
      const width = Math.min(420, Math.max(280, window.innerWidth - reserveRight - 24));
      setDropdownPos({
        top: rect.bottom,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        width,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(anchor);
    return () => ro.disconnect();
  }, [open, inline, containerRef, reserveRight]);

  const activePathIds = useMemo(
    () => buildActivePath(tree, activeLeafId),
    [tree, activeLeafId]
  );

  const handleSelect = useCallback((id: string) => {
    onLeafChange(id);
  }, [onLeafChange]);
  const selectBranch = locked ? undefined : handleSelect;
  const [summaryTargetId, setSummaryTargetId] = useState<string | null>(null);
  const summaryControls = useMemo<BranchSummaryControls | undefined>(() => locked ? undefined : {
    targetId: summaryTargetId,
    open: setSummaryTargetId,
    confirm: (id, customInstructions) => {
      setSummaryTargetId(null);
      onLeafChange(id, { summarize: true, customInstructions: customInstructions.trim() || undefined });
    },
    cancel: () => setSummaryTargetId(null),
  }, [locked, onLeafChange, summaryTargetId]);

  const lockedNotice = locked && (
    <div style={{ padding: "2px 0 4px", fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>
      {t("i18n.branchesLockedWhileRunning")}
    </div>
  );

  const noBranchReason = !hasSession
    ? t("i18n.noActiveSession")
    : !hasSessionBranches(tree)
      ? t("i18n.noBranches")
      : null;

  const topLevel = selectTopLevelBranches(tree);
  const hasContent = !noBranchReason && topLevel.length > 0;
  // A split the panel cannot list still has to say something: otherwise opening
  // the control showed an empty box.
  const emptyReason = noBranchReason ?? t("i18n.noBranches");

  const branchIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: hasContent ? "var(--accent)" : "var(--text-dim)", flexShrink: 0 }}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );

  const chevron = (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--text-dim)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
      <polyline points="2 3.5 5 6.5 8 3.5" />
    </svg>
  );


  if (inline) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "stretch" }}>
        <button
          className="native-toolbar-button"
          ref={btnRef}
          onClick={() => onToggle ? onToggle() : setOpenInternal((v) => !v)}
          style={{
            display: hideInlineButton ? "none" : "flex",
            alignItems: "center",
            gap: 6,
            height: "100%",
            padding: "0 12px",
            background: open ? "var(--bg-selected)" : "none",
            border: "none",
            cursor: "pointer",
            color: open ? "var(--text)" : "var(--text-muted)",
            fontSize: 12,
            whiteSpace: "nowrap",
            transition: "color 0.1s, background 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = open ? "var(--text)" : "var(--text-muted)"; }}
           title={t("i18n.branches")}
           aria-label={t("i18n.branches")}
          aria-pressed={open}
        >
          {branchIcon}
           {!compact && <span>{t("i18n.branches")}</span>}
        </button>
        {open && dropdownPos && (
          <div className="native-popover app-menu branch-menu" style={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            background: "var(--bg-panel)",
            borderBottom: "var(--hairline) solid var(--border)",
            zIndex: 500,
          }}>
            {hasContent ? (
              <div style={{ padding: "4px 12px 8px 12px", maxHeight: 260, overflowY: "auto" }}>
                {lockedNotice}
                {topLevel.map((child, idx) => (
                  <TreeNodeView
                    key={child.entry.id}
                    node={child}
                    activePathIds={activePathIds}
                    depth={0}
                    isLast={idx === topLevel.length - 1}
                    parentLines={[]}
                    onSelect={selectBranch}
                    summary={summaryControls}
                  />
                ))}
              </div>
            ) : (
              <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                {emptyReason}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ borderBottom: "var(--hairline) solid var(--border)", background: "var(--bg)", flexShrink: 0, position: "relative" }}>
      {/* Header toggle */}
      <button
        onClick={() => setOpenInternal((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "5px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: 12,
          textAlign: "left",
        }}
      >
        {branchIcon}
         <span style={{ color: "var(--text-muted)" }}>{t("i18n.branches")}</span>
        {chevron}
      </button>

      {/* Tree panel - overlay */}
      {open && (
        <div className="native-popover app-menu branch-menu" style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          background: "var(--bg)",
          borderBottom: "var(--hairline) solid var(--border)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          zIndex: 100,
        }}>
          {hasContent ? (
            <div className="branch-menu-body">
              <div className="branch-menu-hint">{t("i18n.branchesHint")}</div>
              {lockedNotice}
              {topLevel.map((child, idx) => (
                <TreeNodeView
                  key={child.entry.id}
                  node={child}
                  activePathIds={activePathIds}
                  depth={0}
                  isLast={idx === topLevel.length - 1}
                  parentLines={[]}
                  onSelect={selectBranch}
                  summary={summaryControls}
                />
              ))}
            </div>
          ) : (
            <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              {noBranchReason ?? t("i18n.noBranches")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
