"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { copyText } from "@/lib/clipboard";
import type { TranslationParams } from "@/lib/i18n/types";
import {
  barWidthPercent,
  formatActiveDuration,
  formatCompactCount,
  formatExactCount,
  formatExactDuration,
  formatPercent,
  formatUsd,
  formatUsdExact,
  splitModelKey,
  truncateMiddle,
} from "@/lib/metrics-format";
import type { ContextUsage, SessionStatsInfo } from "@/lib/pi-types";
import type { CacheWarmingInfo } from "@/lib/types";
import { UNATTRIBUTED_USAGE_KEY, type UsageCostBreakdownEntry } from "@/lib/usage-breakdown";

export type SessionCopyField = "file" | "id" | "projectDir" | "gitBranch" | "gitWorktree";

/**
 * The slice of the selected session the panel prints. `SessionInfo` satisfies it
 * structurally, so the shell passes its own `selectedSession` (or `null` for a
 * chat workspace, which has no project rows).
 */
export interface SessionStatsSession {
  cwd: string;
  projectRoot?: string;
  branch?: string;
  isWorktree?: boolean;
}

interface SessionStatsPanelProps {
  sessionStats: SessionStatsInfo | null;
  contextUsage?: ContextUsage | null;
  /** Live cache-warming snapshot the shell polls; falls back to `sessionStats.cacheWarming`. */
  cacheWarming?: CacheWarmingInfo | null;
  /** Project/worktree facts of the selected session; `null` hides the project rows. */
  session?: SessionStatsSession | null;
  /** Narrow shells: headline numbers fold to two columns and model rows drop the provider tag. */
  isMobile?: boolean;
}

type Translate = (key: string, params?: TranslationParams) => string;

/** Model ids longer than this lose their middle; the full key stays in the title. */
const MODEL_NAME_BUDGET = 32;

const COPY_TITLE_KEYS: Record<SessionCopyField, string> = {
  file: "session.copyFile",
  id: "session.copyId",
  projectDir: "session.copyProjectDir",
  gitBranch: "session.copyGitBranch",
  gitWorktree: "session.copyGitWorktree",
};

/**
 * One human sentence for the cache-warming state. pi's own `reason` text names an
 * internal condition (it is not meant for readers), so it is never shown; the
 * reader gets enabled / stopped / warming / unavailable instead.
 */
function cacheSentence(info: CacheWarmingInfo | null, t: Translate): string | null {
  if (!info) return null;
  const status = info.status;
  if (!status) return t("plus.stats.cacheUnavailable");
  if (status.state === "refreshing") return t("plus.stats.cacheRefreshing");
  if (status.state === "inactive") {
    const economical = Boolean(status.extensionOverride) || Boolean(status.decision?.economicsAvailable);
    return economical ? t("plus.stats.cacheStopped") : t("plus.stats.cacheOff");
  }
  return info.mode === "idle" ? t("plus.stats.cacheIdle") : t("plus.stats.cacheRunning");
}

function StatsTile({ label, value, hint, title }: { label: string; value: string; hint?: string; title?: string }) {
  return (
    <div className="plus-stats-tile">
      <span className="plus-stats-tile-label">{label}</span>
      <span className="plus-stats-tile-value" title={title ?? value}>{value}</span>
      {hint ? <span className="plus-stats-tile-hint" title={hint}>{hint}</span> : null}
    </div>
  );
}

function StatsRow({ label, value, title, strong = false }: { label: string; value: string; title?: string; strong?: boolean }) {
  return (
    <div className={strong ? "plus-stats-row is-strong" : "plus-stats-row"}>
      <span className="plus-stats-row-label">{label}</span>
      <span className="plus-stats-row-value" title={title ?? value}>{value}</span>
    </div>
  );
}

function StatsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="plus-stats-section">
      <h3 className="plus-stats-section-title">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Presentational session-stats panel: four headline numbers, then
 * `Tokens & cost`, `Cost by model`, `Messages`, `Cache` and `Session & files`.
 *
 * Hierarchy — what the eye gets first vs. what it can open: totals are large and
 * formatted for scale (lib/metrics-format.ts); per-model spend is a ranked list
 * with a normalised bar; exact values, full paths, ids and counts sit in a
 * `title` (hover) or in the `<details>` behind "other models". Paths and ids are
 * the only monospace text. Nothing here fetches, polls or owns shell state: the
 * copy feedback is the panel's own.
 */
export function SessionStatsPanel({
  sessionStats,
  contextUsage,
  cacheWarming,
  session = null,
  isMobile = false,
}: SessionStatsPanelProps) {
  const { locale, t: translate } = useI18n();
  const [copiedField, setCopiedField] = useState<SessionCopyField | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const copyField = useCallback((field: SessionCopyField, value: string) => {
    void copyText(value).then(() => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopiedField(field);
      copyTimerRef.current = setTimeout(() => setCopiedField(null), 1400);
    });
  }, []);

  const panelClass = (...extra: string[]) => ["plus-stats", isMobile ? "is-mobile" : "", ...extra].filter(Boolean).join(" ");

  if (!sessionStats) {
    return (
      <div className={panelClass("is-empty")}>
        <p className="plus-stats-empty">{translate("session.load")}</p>
      </div>
    );
  }

  const exactCount = (value: number) => formatExactCount(value, locale);
  const tokens = sessionStats.tokens;
  const ctx = contextUsage ?? sessionStats.contextUsage;
  const activeMs = sessionStats.totalActiveMs ?? 0;
  const cacheInfo = cacheWarming ?? sessionStats.cacheWarming ?? null;

  // ── Cost by model: billed rows first, largest first, free rows folded away ──
  const breakdown = [...(sessionStats.costBreakdown ?? [])].sort((a, b) => b.cost - a.cost);
  const billed = breakdown.filter((entry) => entry.cost > 0);
  const free = breakdown.filter((entry) => entry.cost <= 0);
  const maxCost = billed[0]?.cost ?? 0;

  // Cache hit rate = cache reads over every input-class token, as the old panel
  // computed it — only the formatting changed.
  const cacheInputTokens = tokens.cacheRead + tokens.cacheWrite + tokens.input;
  const hitPercent = tokens.cacheRead + tokens.cacheWrite > 0 && cacheInputTokens > 0
    ? (tokens.cacheRead / cacheInputTokens) * 100
    : null;
  const cacheLine = cacheSentence(cacheInfo, translate);
  const cacheDecision = cacheInfo?.status?.decision;
  const expectedSavings = cacheDecision?.economicsAvailable && cacheInfo?.status?.state !== "inactive"
    ? cacheDecision.expectedSavings
    : null;
  const showCacheSection = Boolean(cacheLine) || hitPercent !== null;
  const averageReplyMs = sessionStats.assistantMessages > 0 && activeMs > 0
    ? activeMs / sessionStats.assistantMessages
    : null;

  const projectDir = session ? session.projectRoot ?? session.cwd : null;
  const gitBranch = session?.branch ?? null;
  const worktreePath = session?.isWorktree ? session.cwd : null;

  const copyButton = (field: SessionCopyField, value: string) => {
    const copied = copiedField === field;
    const title = copied ? translate("session.copied") : translate(COPY_TITLE_KEYS[field]);
    return (
      <button
        type="button"
        className={copied ? "plus-stats-copy is-copied" : "plus-stats-copy"}
        title={title}
        aria-label={title}
        onClick={() => copyField(field, value)}
      >
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    );
  };

  /** A monospace value with a copy button; paths ellipsize at the front, where the least specific part is. */
  const copyRow = (label: string, value: string, field: SessionCopyField, startEllipsis = false) => (
    <div className="plus-stats-copy-row" key={field}>
      <span className="plus-stats-copy-label">{label}</span>
      <span className={startEllipsis ? "plus-stats-copy-value is-start-ellipsis" : "plus-stats-copy-value"} title={value}>
        {startEllipsis ? <bdi>{value}</bdi> : value}
      </span>
      {copyButton(field, value)}
    </div>
  );

  const modelRow = (entry: UsageCostBreakdownEntry, width: number) => {
    const unattributed = entry.key === UNATTRIBUTED_USAGE_KEY;
    const { provider, model } = splitModelKey(entry.key);
    return (
      <div className="plus-stats-model" key={entry.key}>
        <div className="plus-stats-model-line">
          {provider && !unattributed ? <span className="plus-stats-model-provider" title={entry.key}>{provider}</span> : null}
          <span className="plus-stats-model-name" title={entry.key}>
            {unattributed ? translate("session.unattributedUsage") : truncateMiddle(model, MODEL_NAME_BUDGET)}
          </span>
          <span className="plus-stats-model-cost" title={formatUsdExact(entry.cost)}>{formatUsd(entry.cost)}</span>
          <span className="plus-stats-model-tokens" title={exactCount(entry.tokens)}>{formatCompactCount(entry.tokens)}</span>
        </div>
        {width > 0 ? (
          <div className="plus-stats-model-track" aria-hidden="true">
            <span className="plus-stats-model-bar" style={{ width: `${width}%` }} />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={panelClass()}>
      <div className="plus-stats-overview">
        <StatsTile
          label={translate("plus.stats.totalTokens")}
          value={formatCompactCount(tokens.total)}
          title={exactCount(tokens.total)}
          hint={translate("plus.stats.tokensHint", {
            input: formatCompactCount(tokens.input),
            output: formatCompactCount(tokens.output),
          })}
        />
        <StatsTile
          label={translate("plus.stats.totalCost")}
          value={formatUsd(sessionStats.cost)}
          title={formatUsdExact(sessionStats.cost)}
          hint={billed.length > 1 ? translate("plus.stats.costHint", { count: billed.length }) : undefined}
        />
        <StatsTile
          label={translate("plus.stats.activeTime")}
          value={activeMs > 0 ? formatActiveDuration(activeMs) : "—"}
          title={formatExactDuration(activeMs)}
          hint={averageReplyMs !== null
            ? translate("plus.stats.avgPerReply", { duration: formatActiveDuration(averageReplyMs) })
            : undefined}
        />
        <StatsTile
          label={translate("session.messages")}
          value={exactCount(sessionStats.totalMessages)}
          title={exactCount(sessionStats.totalMessages)}
          hint={translate("plus.stats.messagesHint", {
            user: exactCount(sessionStats.userMessages),
            assistant: exactCount(sessionStats.assistantMessages),
          })}
        />
      </div>

      <StatsSection title={translate("plus.stats.tokensAndCost")}>
        <div className="plus-stats-rows">
          <StatsRow label={translate("session.input")} value={formatCompactCount(tokens.input)} title={exactCount(tokens.input)} />
          <StatsRow label={translate("session.output")} value={formatCompactCount(tokens.output)} title={exactCount(tokens.output)} />
          {tokens.cacheRead > 0 ? (
            <StatsRow label={translate("session.cacheRead")} value={formatCompactCount(tokens.cacheRead)} title={exactCount(tokens.cacheRead)} />
          ) : null}
          {tokens.cacheWrite > 0 ? (
            <StatsRow label={translate("session.cacheWrite")} value={formatCompactCount(tokens.cacheWrite)} title={exactCount(tokens.cacheWrite)} />
          ) : null}
          {ctx?.contextWindow ? (
            <StatsRow
              label={translate("session.context")}
              value={`${formatPercent(ctx.percent)} / ${formatCompactCount(ctx.contextWindow)}`}
              title={`${formatPercent(ctx.percent)} / ${exactCount(ctx.contextWindow)}`}
            />
          ) : null}
          <StatsRow label={translate("session.total")} value={formatCompactCount(tokens.total)} title={exactCount(tokens.total)} strong />
        </div>
      </StatsSection>

      <StatsSection title={translate("session.costByModel")}>
        {breakdown.length === 0 ? (
          <p className="plus-stats-note is-dim">{translate("plus.stats.noModels")}</p>
        ) : (
          <div className="plus-stats-models">
            {billed.map((entry) => modelRow(entry, barWidthPercent(entry.cost, maxCost)))}
            {free.length > 0 ? (
              <details className="plus-stats-more">
                <summary className="plus-stats-more-summary">
                  {billed.length > 0
                    ? translate("plus.stats.otherModels", { count: free.length })
                    : translate("plus.stats.freeModels", { count: free.length })}
                </summary>
                <div className="plus-stats-more-body">
                  {free.map((entry) => modelRow(entry, 0))}
                </div>
              </details>
            ) : null}
          </div>
        )}
      </StatsSection>

      <StatsSection title={translate("session.messages")}>
        <div className="plus-stats-rows">
          <StatsRow label={translate("session.user")} value={exactCount(sessionStats.userMessages)} />
          <StatsRow label={translate("session.assistant")} value={exactCount(sessionStats.assistantMessages)} />
          <StatsRow label={translate("session.toolCalls")} value={exactCount(sessionStats.toolCalls)} />
          <StatsRow label={translate("session.toolResults")} value={exactCount(sessionStats.toolResults)} />
          <StatsRow label={translate("session.total")} value={exactCount(sessionStats.totalMessages)} strong />
        </div>
      </StatsSection>

      {showCacheSection ? (
        <StatsSection title={translate("plus.stats.cache")}>
          {cacheLine ? <p className="plus-stats-note">{cacheLine}</p> : null}
          {hitPercent !== null ? (
            <p className="plus-stats-note is-dim">
              {translate("plus.stats.cacheHit", { percent: formatPercent(hitPercent) })}
            </p>
          ) : null}
          {expectedSavings !== null ? (
            <p className="plus-stats-note is-dim" title={formatUsdExact(expectedSavings)}>
              {translate("session.cacheWarmingSavings")} · {formatUsd(expectedSavings)}
            </p>
          ) : null}
        </StatsSection>
      ) : null}

      <StatsSection title={translate("plus.stats.sessionAndFiles")}>
        <div className="plus-stats-copy-rows">
          {sessionStats.sessionName ? (
            <div className="plus-stats-name-row">
              <span className="plus-stats-copy-label">{translate("session.name")}</span>
              <span className="plus-stats-name" title={sessionStats.sessionName}>{sessionStats.sessionName}</span>
            </div>
          ) : null}
          {sessionStats.sessionFile
            ? copyRow(translate("session.file"), sessionStats.sessionFile, "file", true)
            : (
              <div className="plus-stats-rows">
                <StatsRow label={translate("session.file")} value={translate("session.inMemory")} />
              </div>
            )}
          {copyRow(translate("session.id"), sessionStats.sessionId, "id")}
          {projectDir ? copyRow(translate("session.projectDir"), projectDir, "projectDir", true) : null}
          {gitBranch ? (
            <div className="plus-stats-branch-row">
              <span className="plus-stats-copy-label">{translate("session.gitBranch")}</span>
              <span className="plus-stats-branch">
                <span className="plus-stats-branch-chip" title={gitBranch}>{gitBranch}</span>
              </span>
              {copyButton("gitBranch", gitBranch)}
            </div>
          ) : null}
          {worktreePath ? copyRow(translate("session.gitWorktree"), worktreePath, "gitWorktree", true) : null}
        </div>
      </StatsSection>
    </div>
  );
}
