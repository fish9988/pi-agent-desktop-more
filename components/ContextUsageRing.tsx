import { useI18n } from "@/hooks/useI18n";
import type { ContextUsage, SessionStatsInfo } from "@/lib/pi-types";

const RING_SIZE = 14;
const PIE_RADIUS = 6;
/** High-risk red threshold (fixed, Claude-convention). Single accent below it. */
const CTX_DANGER_PCT = 90;

function fmtWindow(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

interface ContextUsageRingProps {
  contextUsage?: ContextUsage | null;
  sessionStats?: SessionStatsInfo | null;
  /** Open the existing top-bar session-stats panel (AppShell openSessionStatsPanel). */
  onOpenStats?: () => void;
}

/**
 * Plus 1.7: a small pie plus the percentage (the redesign mockup). A thin
 * accent arc with no number read as a loading spinner. The pie is the
 * neutral text colour; it turns red at the high-risk threshold.
 *
 * Originally a text-free usage ring next to the model selector (C1). The arc shows live
 * context-window fullness in a single accent color; it turns red when usage
 * reaches the high-risk threshold (≥90%). Hover shows the session token and
 * context summary; click opens the top-bar session-stats panel.
 *
 * When there is no context usage yet (no session, or nothing has run), the ring
 * renders dimmed and inert, and no title is set — no dead "Context usage"
 * tooltip. Data only appears once the agent reports a context window.
 */
export function ContextUsageRing({ contextUsage, sessionStats, onOpenStats }: ContextUsageRingProps) {
  const { t } = useI18n();

  const hasUsage = contextUsage != null;
  const percent = contextUsage?.percent ?? null;
  const windowSize = contextUsage?.contextWindow ?? 0;
  // A context window object always carries the denominator; percent may be
  // unknown (null) right after a compaction until the next LLM response.
  const showTooltip = hasUsage && (percent !== null || windowSize > 0);
  const pct = percent !== null ? Math.max(0, Math.min(100, percent)) : 0;
  const color = percent === null
    ? "var(--text-dim)"
    : pct >= CTX_DANGER_PCT
      ? "var(--danger)"
      : "var(--text-muted)";
  // Wedge from 12 o'clock clockwise; a full circle once it is (nearly) full.
  const c = RING_SIZE / 2;
  const angle = (pct / 100) * 2 * Math.PI;
  const wedge = pct >= 99.95
    ? null
    : `M${c} ${c} L${c} ${c - PIE_RADIUS} A${PIE_RADIUS} ${PIE_RADIUS} 0 ${pct > 50 ? 1 : 0} 1 ${(c + PIE_RADIUS * Math.sin(angle)).toFixed(2)} ${(c - PIE_RADIUS * Math.cos(angle)).toFixed(2)} Z`;

  const tooltipParts: string[] = [];
  if (showTooltip) {
    tooltipParts.push(percent !== null ? `${percent.toFixed(1)}% ctx` : `— / ${fmtWindow(windowSize)}`);
    if (sessionStats && sessionStats.tokens.total > 0) {
      tooltipParts.push(`${fmtWindow(sessionStats.tokens.total)} tok`);
    } else if (percent !== null && windowSize > 0) {
      tooltipParts[0] += ` / ${fmtWindow(windowSize)}`;
    }
    if (sessionStats && sessionStats.cost > 0) {
      tooltipParts.push(`$${sessionStats.cost.toFixed(3)}`);
    }
  }
  const title = tooltipParts.length > 0 ? tooltipParts.join(" · ") : t("chat.ctxUsage");

  // Nothing to report yet (new or dormant session): an empty grey ring read
  // as a loading spinner, so leave the slot empty until usage arrives.
  if (!hasUsage) return null;

  return (
    <button
      type="button"
      aria-label={title}
      title={showTooltip ? title : undefined}
      aria-haspopup="dialog"
      aria-disabled={!hasUsage}
      className="context-usage-ring"
      onClick={() => {
        if (hasUsage) onOpenStats?.();
      }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        minWidth: 32, height: 32, padding: percent !== null ? "0 6px" : 0, flexShrink: 0,
        color: "var(--text-dim)", fontSize: 12, fontVariantNumeric: "tabular-nums",
        background: "none", border: "none", borderRadius: 9,
        cursor: hasUsage ? "pointer" : "default",
        transition: "background 0.12s, opacity 0.12s",
        opacity: hasUsage ? 1 : 0.5,
      }}
      onMouseEnter={(e) => {
        if (!hasUsage) return;
        e.currentTarget.style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "none";
      }}
    >
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
        <circle cx={c} cy={c} r={PIE_RADIUS} fill="none" stroke={color} strokeWidth={1.2} opacity={percent === null ? 0.35 : 0.7} />
        {percent !== null && pct > 0 && (wedge
          ? <path d={wedge} fill={color} />
          : <circle cx={c} cy={c} r={PIE_RADIUS} fill={color} />)}
      </svg>
      {percent !== null && <span style={{ color: pct >= CTX_DANGER_PCT ? "var(--danger)" : undefined }}>{Math.round(pct)}%</span>}
    </button>
  );
}
