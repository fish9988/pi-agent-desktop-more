// Server-side cache for an already-serialized paginated context response.
//
// The expensive part of GET /api/sessions/[id]/context is not only parsing the
// JSONL (that is shared through lib/session-reader's manager cache) but also
// rebuilding and JSON.stringify-ing the same window on every request — React
// Strict Mode double loads, prefetch followed by a click, and re-opening a
// session all ask for bytes the server just produced.
//
// Key: session file + disk fingerprint (size:mtimeMs) + every query option that
// changes the window. A file append changes the fingerprint, so stale bodies
// are never served. Values are LRU-bounded by count and serialized byte size.
//
// globalThis keeps the cache across Next.js hot reloads; it is process-local
// and never persisted.

import { sessionPathKey } from "./session-path";

export interface SessionContextCacheKeyParts {
  filePath: string;
  /** `size:mtimeMs`; null/undefined means "do not cache". */
  fingerprint: string | null | undefined;
  sessionId: string;
  leafId?: string | null;
  before?: string | null;
  tail: number;
  deferThinking: boolean;
  deferToolResultImages: boolean;
  excludeLeaf: boolean;
  wholeTurns: boolean;
}

interface ContextPayloadEntry {
  body: string;
  bytes: number;
}

declare global {
  var __piSessionContextPayloadCache: Map<string, ContextPayloadEntry> | undefined;
}

export const SESSION_CONTEXT_CACHE_LIMITS = {
  maxEntries: 24,
  maxTotalBytes: 16 * 1024 * 1024,
  /** A single window larger than this is returned fresh, uncached. */
  maxBodyBytes: 4 * 1024 * 1024,
};

function cache(): Map<string, ContextPayloadEntry> {
  if (!globalThis.__piSessionContextPayloadCache) {
    globalThis.__piSessionContextPayloadCache = new Map();
  }
  return globalThis.__piSessionContextPayloadCache;
}

function byteLength(body: string): number {
  return Buffer.byteLength(body);
}

function evictToFit(): void {
  const store = cache();
  let total = 0;
  for (const entry of store.values()) total += entry.bytes;
  while (store.size > SESSION_CONTEXT_CACHE_LIMITS.maxEntries || total > SESSION_CONTEXT_CACHE_LIMITS.maxTotalBytes) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    total -= store.get(oldestKey)?.bytes ?? 0;
    store.delete(oldestKey);
  }
}

/** Stable key for one serialized context window. Null when the fingerprint is unknown. */
export function sessionContextCacheKey(parts: SessionContextCacheKeyParts): string | null {
  if (!parts.filePath || !parts.fingerprint) return null;
  return [
    "v1",
    sessionPathKey(parts.filePath),
    parts.fingerprint,
    parts.sessionId,
    parts.leafId ?? "",
    parts.before ?? "",
    String(parts.tail),
    parts.deferThinking ? "t1" : "t0",
    parts.deferToolResultImages ? "m1" : "m0",
    parts.excludeLeaf ? "x1" : "x0",
    parts.wholeTurns ? "w1" : "w0",
  ].join("|");
}

/** Serialized body for this exact window, or null on a miss. Touches LRU order. */
export function getCachedSessionContextBody(key: string | null): string | null {
  if (!key) return null;
  const store = cache();
  const entry = store.get(key);
  if (!entry) return null;
  store.delete(key);
  store.set(key, entry);
  return entry.body;
}

/** Store a serialized body. Oversize bodies are refused, not truncated. */
export function cacheSessionContextBody(key: string | null, body: string): boolean {
  if (!key || !body) return false;
  const bytes = byteLength(body);
  if (bytes > SESSION_CONTEXT_CACHE_LIMITS.maxBodyBytes) return false;

  const store = cache();
  store.delete(key);
  store.set(key, { body, bytes });
  evictToFit();
  return store.has(key);
}

export function deleteCachedSessionContextBody(key: string | null): void {
  if (key) cache().delete(key);
}

export function clearSessionContextCacheForTests(): void {
  globalThis.__piSessionContextPayloadCache = undefined;
}

/** Test seam: entry count and summed serialized bytes. */
export function getSessionContextCacheStatsForTests(): { entries: number; bytes: number } {
  let bytes = 0;
  for (const entry of cache().values()) bytes += entry.bytes;
  return { entries: cache().size, bytes };
}
