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
  formatDuration,
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

function StatsCard({ icon, title, total, totalTitle, children }: {
  icon: CardIcon;
  title: string;
  total?: string;
  totalTitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="plus-stats-card">
      <div className="plus-stats-card-head">
        <span className="plus-stats-card-icon" aria-hidden="true">{CARD_ICONS[icon]}</span>
        <h3 className="plus-stats-card-title">{title}</h3>
        {total ? <span className="plus-stats-card-total" title={totalTitle ?? total}>{total}</span> : null}
      </div>
      <div className="plus-stats-card-rows">{children}</div>
    </section>
  );
}

function StatsKv({ label, value, title, strong = false }: { label: string; value: string; title?: string; strong?: boolean }) {
  return (
    <div className={strong ? "plus-stats-kv is-strong" : "plus-stats-kv"}>
      <span className="plus-stats-kv-label">{label}</span>
      <span className="plus-stats-kv-value" title={title ?? value}>{value}</span>
    </div>
  );
}

type CardIcon = "token" | "session" | "cost" | "cache" | "files";

const CARD_ICONS: Record<CardIcon, ReactNode> = {
  token: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  ),
  session: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  cost: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.2a2.6 2.6 0 0 0-2.5-1.4c-1.4 0-2.4.8-2.4 2 0 2.7 5 1.3 5 4 0 1.2-1 2-2.6 2a2.6 2.6 0 0 1-2.5-1.5" />
      <path d="M12 6.3v1.5M12 15.6v1.6" />
    </svg>
  ),
  cache: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </svg>
  ),
  files: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17z" />
    </svg>
  ),
};

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
  const count = (value: number) => `${exactCount(value)} tok`;
  const duration = (ms: number) => formatDuration(ms, locale);
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
      <StatsCard
        icon="token"
        title={translate("plus.stats.cardTokens")}
        total={count(tokens.total)}
        totalTitle={exactCount(tokens.total)}
      >
        <StatsKv
          label={translate("plus.stats.cacheHitRate")}
          value={hitPercent !== null ? formatPercent(hitPercent, 0) : "—"}
          title={hitPercent !== null ? translate("plus.stats.cacheHit", { percent: formatPercent(hitPercent) }) : undefined}
        />
        <StatsKv label={translate("plus.stats.uncachedInput")} value={count(tokens.input)} />
        <StatsKv label={translate("session.cacheRead")} value={count(tokens.cacheRead)} />
        {tokens.cacheWrite > 0 ? (
          <StatsKv label={translate("session.cacheWrite")} value={count(tokens.cacheWrite)} />
        ) : null}
        <StatsKv label={translate("session.output")} value={count(tokens.output)} />
        {ctx?.contextWindow ? (
          <StatsKv
            label={translate("session.context")}
            value={`${formatPercent(ctx.percent, 0)} · ${formatCompactCount(ctx.contextWindow)}`}
            title={`${formatPercent(ctx.percent)} / ${exactCount(ctx.contextWindow)}`}
          />
        ) : null}
      </StatsCard>

      <StatsCard icon="session" title={translate("plus.stats.cardSession")}>
        <StatsKv
          label={translate("plus.stats.activeTime")}
          value={activeMs > 0 ? duration(activeMs) : "—"}
          title={formatExactDuration(activeMs)}
        />
        <StatsKv
          label={translate("plus.stats.avgPerReplyLabel")}
          value={averageReplyMs !== null ? duration(averageReplyMs) : "—"}
          title={translate("plus.stats.avgPerReply", { duration: formatExactDuration(averageReplyMs ?? 0) })}
        />
        <StatsKv
          label={translate("session.messages")}
          value={exactCount(sessionStats.totalMessages)}
          title={translate("plus.stats.messagesHint", {
            user: exactCount(sessionStats.userMessages),
            assistant: exactCount(sessionStats.assistantMessages),
          })}
        />
        <StatsKv
          label={translate("session.toolCalls")}
          value={exactCount(sessionStats.toolCalls)}
          title={`${translate("session.toolResults")}: ${exactCount(sessionStats.toolResults)}`}
        />
      </StatsCard>

      <StatsCard
        icon="cost"
        title={translate("plus.stats.cardCost")}
        total={formatUsd(sessionStats.cost)}
        totalTitle={formatUsdExact(sessionStats.cost)}
      >
        {breakdown.length === 0 ? (
          <p className="plus-stats-card-note">{translate("plus.stats.noModels")}</p>
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
      </StatsCard>

      {showCacheSection ? (
        <StatsCard icon="cache" title={translate("plus.stats.cache")}>
          {cacheLine ? <p className="plus-stats-card-note">{cacheLine}</p> : null}
          {expectedSavings !== null ? (
            <StatsKv
              label={translate("session.cacheWarmingSavings")}
              value={formatUsd(expectedSavings)}
              title={formatUsdExact(expectedSavings)}
            />
          ) : null}
        </StatsCard>
      ) : null}

      <StatsCard icon="files" title={translate("plus.stats.sessionAndFiles")}>
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
              <div className="plus-stats-copy-row">
                <span className="plus-stats-copy-label">{translate("session.file")}</span>
                <span className="plus-stats-copy-value">{translate("session.inMemory")}</span>
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
      </StatsCard>
    </div>
  );
}
