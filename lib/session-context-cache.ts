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
// Two layers:
//
//   memory  globalThis keeps the cache across Next.js hot reloads (this was the
//           whole cache before 1.19.x). Process-local: an app restart threw it
//           away, so re-opening a large session paid the JSONL parse again just
//           to rebuild a window the server had already serialized.
//
//   disk    The same serialized bodies are also written to
//           <agent dir>/cache/session-context/<sha1(key)>.json. The key already
//           contains the file fingerprint, so a hit *is* the freshness check:
//           there is no index to keep in sync and no stale-body window beyond
//           what the in-memory layer already accepts. Bounded by file count and
//           summed bytes, pruned oldest-first when a write overruns the budget.
//           Only serialized windows go to disk — never parsed entries (that
//           would duplicate the session file at several times its size).

import { createHash } from "crypto";
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
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

// ---------------------------------------------------------------------------
// Persisted layer (survives an app restart).
// ---------------------------------------------------------------------------

/** Budget for the on-disk window cache. Bounded because it is user data on disk. */
export const SESSION_CONTEXT_DISK_CACHE_LIMITS = {
  maxFiles: 128,
  maxTotalBytes: 64 * 1024 * 1024,
  /** Prune at most this often (a write storm must not re-scan the directory). */
  pruneIntervalMs: 30_000,
};

let diskCacheDisabledForTests = false;
let lastPruneAt = 0;
const pendingDiskWrites = new Set<Promise<void>>();

/** `<agent dir>/cache/session-context`; same tree the session files live in. */
export function sessionContextDiskCacheDir(): string {
  return join(getAgentDir(), "cache", "session-context");
}

/** Set `PI_WEB_SESSION_CONTEXT_DISK_CACHE=0` (or the test seam) to disable it. */
export function isSessionContextDiskCacheEnabled(): boolean {
  // Off under node:test so parallel suites cannot share (or pollute) the real
  // cache directory in the user's home; a test that wants it sets the seam.
  if (process.env.NODE_TEST_CONTEXT !== undefined && process.env.PI_WEB_SESSION_CONTEXT_DISK_CACHE === undefined) {
    return false;
  }
  return !diskCacheDisabledForTests && process.env.PI_WEB_SESSION_CONTEXT_DISK_CACHE !== "0";
}

/** Test seam: turn persistence off without touching the environment. */
export function setSessionContextDiskCacheEnabledForTests(enabled: boolean): void {
  diskCacheDisabledForTests = !enabled;
  lastPruneAt = 0;
}

function diskFileFor(key: string): string {
  return join(sessionContextDiskCacheDir(), `${createHash("sha1").update(key).digest("hex")}.json`);
}

/**
 * Body for this exact window from memory, else from the persisted layer (a hit
 * is promoted into memory). Null means "rebuild it".
 */
export async function loadSessionContextBody(key: string | null): Promise<string | null> {
  const cached = getCachedSessionContextBody(key);
  if (cached !== null || !key || !isSessionContextDiskCacheEnabled()) return cached;
  try {
    const raw = await readFile(diskFileFor(key));
    const newline = raw.indexOf(0x0a);
    if (newline <= 0 || newline > 24) return null;
    const declared = Number(raw.subarray(0, newline).toString("utf8"));
    const payload = raw.subarray(newline + 1);
    // A truncated or foreign file must never be served as a window body.
    if (!Number.isSafeInteger(declared) || declared !== payload.length) return null;
    if (payload.length === 0 || payload.length > SESSION_CONTEXT_CACHE_LIMITS.maxBodyBytes) return null;
    const body = payload.toString("utf8");
    cacheSessionContextBody(key, body);
    return body;
  } catch {
    // Missing / unreadable cache file: fall through to a rebuild.
    return null;
  }
}

/**
 * Memory first, disk in the background. The response never waits for the write:
 * a failed persist costs nothing but a cache miss next launch.
 */
export function storeSessionContextBody(key: string | null, body: string): boolean {
  const stored = cacheSessionContextBody(key, body);
  if (!stored || !key || !isSessionContextDiskCacheEnabled()) return stored;
  const write = persistSessionContextBody(key, body).catch(() => undefined);
  pendingDiskWrites.add(write);
  void write.finally(() => pendingDiskWrites.delete(write));
  return stored;
}

/** Test seam: wait for background writes (a test that removes its agent dir). */
export async function flushSessionContextDiskWritesForTests(): Promise<void> {
  await Promise.all([...pendingDiskWrites]);
}

/** Write one body (temp file + rename, so a partial write is never served). */
async function persistSessionContextBody(key: string, body: string): Promise<void> {
  const file = diskFileFor(key);
  const bytes = Buffer.byteLength(body);
  // `<byte length>\n<body>`: the length prefix lets a reader reject a truncated
  // or foreign file without hashing megabytes on every hit.
  const record = `${bytes}\n${body}`;
  try {
    const existing = await stat(file);
    if (existing.size === Buffer.byteLength(record)) return; // already stored
  } catch { /* not stored yet */ }
  const dir = sessionContextDiskCacheDir();
  await mkdir(dir, { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, record, "utf8");
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
  await pruneSessionContextDiskCache();
}

/**
 * Drop the oldest windows until both the file-count and byte budgets hold.
 * Throttled: pruning on every write would re-read the whole directory.
 */
async function pruneSessionContextDiskCache(): Promise<void> {
  const now = Date.now();
  if (now - lastPruneAt < SESSION_CONTEXT_DISK_CACHE_LIMITS.pruneIntervalMs) return;
  lastPruneAt = now;
  const dir = sessionContextDiskCacheDir();
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  } catch {
    return;
  }
  if (names.length === 0) return;

  const files: Array<{ path: string; bytes: number; mtimeMs: number }> = [];
  for (const name of names) {
    const file = join(dir, name);
    try {
      const stats = await stat(file);
      files.push({ path: file, bytes: stats.size, mtimeMs: stats.mtimeMs });
    } catch { /* vanished */ }
  }
  let totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  let count = files.length;
  if (count <= SESSION_CONTEXT_DISK_CACHE_LIMITS.maxFiles && totalBytes <= SESSION_CONTEXT_DISK_CACHE_LIMITS.maxTotalBytes) return;

  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const file of files) {
    if (count <= SESSION_CONTEXT_DISK_CACHE_LIMITS.maxFiles && totalBytes <= SESSION_CONTEXT_DISK_CACHE_LIMITS.maxTotalBytes) break;
    try {
      await unlink(file.path);
      count -= 1;
      totalBytes -= file.bytes;
    } catch { /* already gone */ }
  }
}

/** Test seam: number of persisted windows and their summed bytes. */
export async function getSessionContextDiskCacheStatsForTests(): Promise<{ files: number; bytes: number }> {
  const dir = sessionContextDiskCacheDir();
  let files = 0;
  let bytes = 0;
  try {
    for (const name of await readdir(dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const stats = await stat(join(dir, name));
        files += 1;
        bytes += stats.size;
      } catch { /* vanished */ }
    }
  } catch { /* no cache dir yet */ }
  return { files, bytes };
}

/** Test seam: remove every persisted window. */
export async function clearSessionContextDiskCacheForTests(): Promise<void> {
  lastPruneAt = 0;
  await rm(sessionContextDiskCacheDir(), { recursive: true, force: true });
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
