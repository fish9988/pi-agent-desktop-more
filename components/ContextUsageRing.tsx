import { useId } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { ContextUsage, SessionStatsInfo } from "@/lib/pi-types";

const PIE_SIZE = 16;
const RADIUS = PIE_SIZE / 2;
const CENTER = PIE_SIZE / 2;
const SLICE_GAP = 1.2;
const SLICE_LIFT = 2.6;
const EVEN_SPLIT = 50;
const LIFT_SPREAD = 35;
const CTX_WARN_PCT = 55;
const CTX_DANGER_PCT = 80;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function discPath(cx: number, cy: number, radius: number): string {
  const x = round2(cx);
  const top = round2(cy - radius);
  const bottom = round2(cy + radius);
  return `M ${x} ${top} A ${radius} ${radius} 0 1 1 ${x} ${bottom} A ${radius} ${radius} 0 1 1 ${x} ${top} Z`;
}

function sectorPath(cx: number, cy: number, radius: number, from: number, to: number): string {
  const x = round2(cx);
  const y = round2(cy);
  const x0 = round2(cx + radius * Math.sin(rad(from)));
  const y0 = round2(cy - radius * Math.cos(rad(from)));
  const x1 = round2(cx + radius * Math.sin(rad(to)));
  const y1 = round2(cy - radius * Math.cos(rad(to)));
  const large = to - from > 180 ? 1 : 0;
  return `M ${x} ${y} L ${x0} ${y0} A ${round2(radius)} ${round2(radius)} 0 ${large} 1 ${x1} ${y1} Z`;
}

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
 * Claude Code Desktop split-sector context pie (ported from dsh-claude-style
 * features/context-stats/context-meter-pie.ts) plus the percentage reading.
 *
 * The smaller share keeps the box's radius so the pushed-out slice reaches the
 * edge, and the larger one steps in by up to half the lift; two SVG masks cut
 * the seam along both radii, the outer arc and the apex.
 */
export function ContextUsageRing({ contextUsage, sessionStats, onOpenStats }: ContextUsageRingProps) {
  const { t } = useI18n();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const greyMaskId = `plus-pie-grey-${uid}`;
  const colorMaskId = `plus-pie-color-${uid}`;

  const rawPercent = contextUsage?.percent ?? (
    sessionStats && sessionStats.tokens.total > 0
      ? Math.min(100, ((sessionStats.tokens.input + sessionStats.tokens.output) / (contextUsage?.contextWindow || 200_000)) * 100)
      : 0
  );
  const hasUsage = contextUsage != null || (sessionStats != null && sessionStats.tokens.total > 0);
  const percent = rawPercent;
  const windowSize = contextUsage?.contextWindow ?? 200_000;
  const showTooltip = hasUsage && (percent !== null || windowSize > 0);
  const pct = Math.max(0, Math.min(100, percent));
  // Ensure a visible green slice when pct > 0 so small readings (1–8%) still show the split-sector pie clearly.
  const visualPct = pct > 0 ? Math.max(8, pct) : 0;

  const toneColor = percent === null
    ? "var(--text-dim)"
    : pct >= CTX_DANGER_PCT
      ? "var(--danger)"
      : pct >= CTX_WARN_PCT
        ? "var(--warning)"
        : "var(--success)";
  const restColor = "var(--plus-pie-rest)";

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

  const occupied = (visualPct / 100) * 360;
  const pull = (SLICE_LIFT / 2) * Math.min(1, Math.abs(visualPct - EVEN_SPLIT) / LIFT_SPREAD);
  const occupiedRadius = visualPct <= EVEN_SPLIT ? RADIUS : RADIUS - pull;
  const greyRadius = visualPct <= EVEN_SPLIT ? RADIUS - pull : RADIUS;
  const occupiedPath = visualPct > 0 && visualPct < 100 ? sectorPath(CENTER, CENTER, occupiedRadius, 0, occupied) : "";
  const greyPath = visualPct > 0 && visualPct < 100 ? sectorPath(CENTER, CENTER, greyRadius, occupied, 360) : "";
  const greyGap = (SLICE_GAP * (100 - visualPct)) / 100;
  const occupiedGap = SLICE_GAP - greyGap;

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
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
        minWidth: 32, height: 28, padding: percent !== null ? "0 6px" : 0, flexShrink: 0,
        color: "var(--text-muted)", fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums",
        background: "none", border: "none", borderRadius: 6,
        cursor: "pointer",
        transition: "background 0.12s, color 0.12s, opacity 0.12s",
        opacity: 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.color = "var(--text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "none";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      <svg width={PIE_SIZE} height={PIE_SIZE} viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`} aria-hidden="true">
        {visualPct <= 0 ? (
          <path d={discPath(CENTER, CENTER, RADIUS - 1)} fill={restColor} />
        ) : visualPct >= 99.95 ? (
          <path d={discPath(CENTER, CENTER, RADIUS - 0.5)} fill={toneColor} />
        ) : (
          <>
            <defs>
              <mask id={greyMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width={PIE_SIZE} height={PIE_SIZE}>
                <rect x="0" y="0" width={PIE_SIZE} height={PIE_SIZE} fill="white" />
                <path d={occupiedPath} fill="none" stroke="black" strokeWidth={round2(greyGap * 2)} strokeLinejoin="round" />
              </mask>
              <mask id={colorMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width={PIE_SIZE} height={PIE_SIZE}>
                <rect x="0" y="0" width={PIE_SIZE} height={PIE_SIZE} fill="white" />
                <path d={greyPath} fill="none" stroke="black" strokeWidth={round2(occupiedGap * 2)} strokeLinejoin="round" />
              </mask>
            </defs>
            {pct <= EVEN_SPLIT ? (
              <>
                <path d={greyPath} fill={restColor} mask={`url(#${greyMaskId})`} />
                <path d={occupiedPath} fill={toneColor} mask={`url(#${colorMaskId})`} />
              </>
            ) : (
              <>
                <path d={occupiedPath} fill={toneColor} mask={`url(#${colorMaskId})`} />
                <path d={greyPath} fill={restColor} mask={`url(#${greyMaskId})`} />
              </>
            )}
          </>
        )}
      </svg>
      {percent !== null && (
        <span style={{ color: pct >= CTX_DANGER_PCT ? "var(--danger)" : undefined }}>
          {Math.round(pct)}%
        </span>
      )}
    </button>
  );
}
