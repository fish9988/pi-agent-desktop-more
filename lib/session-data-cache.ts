import type { AgentMessage, SessionTreeNode } from "@/lib/types";
import { getSessionViewSnapshot, setSessionViewSnapshot } from "./session-view-cache";

export interface CachedSessionData {
  sessionId: string;
  filePath: string;
  snapshotRevision?: string | null;
  tree: SessionTreeNode[];
  leafId: string | null;
  stats?: unknown;
  totalActiveMs?: number;
  context: {
    messages: AgentMessage[];
    entryIds: string[];
    oldestEntryId?: string | null;
    hasMore?: boolean;
    thinkingLevel: string;
    model: { provider: string; modelId: string } | null;
  };
}

const CACHE_TTL_MS = 30_000;
const sessionDataCache = new Map<string, { data: CachedSessionData; cachedAt: number }>();
const prefetches = new Map<string, Promise<CachedSessionData | null>>();

export function getCachedSessionData(sessionId: string): CachedSessionData | null {
  const cached = sessionDataCache.get(sessionId);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
    sessionDataCache.delete(sessionId);
    return null;
  }
  return cached.data;
}

export function cacheSessionData(sessionId: string, data: CachedSessionData): void {
  sessionDataCache.set(sessionId, { data, cachedAt: Date.now() });
}

/**
 * Warm a session while its sidebar row is hovered, using `tree=summary&wholeTurns=1`
 * and writing directly into `session-view-cache` so clicking the row renders in 0ms.
 */
export function prefetchSessionData(sessionId: string): Promise<CachedSessionData | null> {
  if (getSessionViewSnapshot(sessionId)) return Promise.resolve(getCachedSessionData(sessionId));
  const cached = getCachedSessionData(sessionId);
  if (cached) return Promise.resolve(cached);
  const pending = prefetches.get(sessionId);
  if (pending) return pending;

  const params = new URLSearchParams({
    deferThinking: "1",
    deferMedia: "1",
    tree: "summary",
    wholeTurns: "1",
  });
  const request = fetch(`/api/sessions/${encodeURIComponent(sessionId)}?${params}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json() as CachedSessionData;
      cacheSessionData(sessionId, data);
      if (data.snapshotRevision && data.context) {
        setSessionViewSnapshot({
          sessionId,
          revision: data.snapshotRevision,
          messages: data.context.messages ?? [],
          entryIds: data.context.entryIds ?? [],
          leafId: data.leafId ?? null,
          oldestEntryId: data.context.oldestEntryId ?? (data.context.entryIds?.[0] ?? null),
          hasMore: Boolean(data.context.hasMore),
          summaryTree: data.tree,
          thinkingLevel: data.context.thinkingLevel ?? "off",
          model: data.context.model ?? null,
          stats: data.stats,
          totalActiveMs: data.totalActiveMs,
          loadedEntryIds: [],
        });
      }
      return data;
    })
    .catch(() => null)
    .finally(() => prefetches.delete(sessionId));

  prefetches.set(sessionId, request);
  return request;
}
