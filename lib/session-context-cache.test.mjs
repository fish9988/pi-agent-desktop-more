import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

// This suite is the one that exercises the persisted layer, so it opts in: the
// cache is off under node:test by default, to keep parallel route suites from
// sharing (and pruning) the same directory in the user's home.
process.env.PI_WEB_SESSION_CONTEXT_DISK_CACHE = "1";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const {
  SESSION_CONTEXT_CACHE_LIMITS,
  SESSION_CONTEXT_DISK_CACHE_LIMITS,
  cacheSessionContextBody,
  clearSessionContextCacheForTests,
  clearSessionContextDiskCacheForTests,
  flushSessionContextDiskWritesForTests,
  getCachedSessionContextBody,
  getSessionContextCacheStatsForTests,
  getSessionContextDiskCacheStatsForTests,
  isSessionContextDiskCacheEnabled,
  loadSessionContextBody,
  sessionContextDiskCacheDir,
  setSessionContextDiskCacheEnabledForTests,
  storeSessionContextBody,
  sessionContextCacheKey,
} = await jiti.import("./session-context-cache.ts");

function key(overrides = {}) {
  return sessionContextCacheKey({
    filePath: "C:\\sessions\\project\\s.jsonl",
    fingerprint: "100:200",
    sessionId: "s1",
    leafId: "e50",
    before: undefined,
    tail: 50,
    deferThinking: true,
    deferToolResultImages: true,
    excludeLeaf: false,
    wholeTurns: true,
    ...overrides,
  });
}

test("the key changes with the file fingerprint and every window option", () => {
  const base = key();
  assert.ok(base);
  assert.notEqual(key({ fingerprint: "101:200" }), base);
  assert.notEqual(key({ leafId: "e51" }), base);
  assert.notEqual(key({ before: "e1" }), base);
  assert.notEqual(key({ tail: 100 }), base);
  assert.notEqual(key({ deferThinking: false }), base);
  assert.notEqual(key({ deferToolResultImages: false }), base);
  assert.notEqual(key({ excludeLeaf: true }), base);
  assert.notEqual(key({ wholeTurns: false }), base);
  assert.equal(key({ filePath: "C:\\SESSIONS\\project\\s.jsonl" }), base, "paths compare case-insensitively on Windows");
  assert.equal(key({ fingerprint: null }), null, "an unknown fingerprint is never cached");
});

test("stores serialized bodies, touches LRU, and evicts by entry count", (t) => {
  clearSessionContextCacheForTests();
  const original = { ...SESSION_CONTEXT_CACHE_LIMITS };
  t.after(() => {
    Object.assign(SESSION_CONTEXT_CACHE_LIMITS, original);
    clearSessionContextCacheForTests();
  });
  SESSION_CONTEXT_CACHE_LIMITS.maxEntries = 2;

  assert.equal(cacheSessionContextBody(key({ tail: 1 }), "{\"a\":1}"), true);
  assert.equal(cacheSessionContextBody(key({ tail: 2 }), "{\"a\":2}"), true);
  assert.equal(cacheSessionContextBody(key({ tail: 3 }), "{\"a\":3}"), true);
  assert.equal(getCachedSessionContextBody(key({ tail: 1 })), null, "oldest body was evicted");
  assert.equal(getCachedSessionContextBody(key({ tail: 3 })), "{\"a\":3}");

  assert.equal(cacheSessionContextBody(key({ tail: 2 }), "{\"a\":2b}"), true);
  assert.equal(getCachedSessionContextBody(key({ tail: 2 })), "{\"a\":2b}", "rewriting a key replaces its body");
  assert.deepEqual(getSessionContextCacheStatsForTests().entries, 2);
});

test("bounds total bytes and refuses a single oversize body", (t) => {
  clearSessionContextCacheForTests();
  const original = { ...SESSION_CONTEXT_CACHE_LIMITS };
  t.after(() => {
    Object.assign(SESSION_CONTEXT_CACHE_LIMITS, original);
    clearSessionContextCacheForTests();
  });
  SESSION_CONTEXT_CACHE_LIMITS.maxEntries = 10;
  SESSION_CONTEXT_CACHE_LIMITS.maxTotalBytes = 9;
  SESSION_CONTEXT_CACHE_LIMITS.maxBodyBytes = 8;

  assert.equal(cacheSessionContextBody(key({ tail: 1 }), "12345"), true);
  assert.equal(cacheSessionContextBody(key({ tail: 2 }), "12345"), true);
  assert.equal(cacheSessionContextBody(key({ tail: 3 }), "123456789"), false, "oversize body is refused");

  // Adding the second body exceeded the byte budget, so the first one went.
  assert.equal(getCachedSessionContextBody(key({ tail: 1 })), null);
  assert.equal(getCachedSessionContextBody(key({ tail: 2 })), "12345");
  assert.deepEqual(getSessionContextCacheStatsForTests(), { entries: 1, bytes: 5 });
});

// ---------------------------------------------------------------------------
// Persisted layer: windows survive a process restart, inside a size budget.
// ---------------------------------------------------------------------------

function useTempAgentDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "pi-web-context-disk-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  setSessionContextDiskCacheEnabledForTests(true);
  clearSessionContextCacheForTests();
  t.after(async () => {
    await flushSessionContextDiskWritesForTests();
    await clearSessionContextDiskCacheForTests();
    setSessionContextDiskCacheEnabledForTests(true);
    clearSessionContextCacheForTests();
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test("a stored window is reusable from disk after the in-memory layer is gone", async (t) => {
  useTempAgentDir(t);
  const cacheKey = key({ tail: 7 });
  const body = JSON.stringify({ context: { messages: [{ role: "user", content: "restored" }] } });
  assert.equal(storeSessionContextBody(cacheKey, body), true);
  await flushSessionContextDiskWritesForTests();
  assert.deepEqual(await getSessionContextDiskCacheStatsForTests(), { files: 1, bytes: Buffer.byteLength(body) + String(Buffer.byteLength(body)).length + 1 });

  // Simulate a process restart: memory gone, disk kept.
  clearSessionContextCacheForTests();
  assert.deepEqual(getSessionContextCacheStatsForTests(), { entries: 0, bytes: 0 });
  assert.equal(await loadSessionContextBody(cacheKey), body);
  // A disk hit is promoted into memory.
  assert.deepEqual(getSessionContextCacheStatsForTests().entries, 1);
  assert.equal(await loadSessionContextBody(cacheKey), body);
});

test("nothing is persisted when the layer is disabled", async (t) => {
  const dir = useTempAgentDir(t);
  setSessionContextDiskCacheEnabledForTests(false);
  assert.equal(isSessionContextDiskCacheEnabled(), false);
  const key0 = key({ tail: 8 });
  assert.equal(storeSessionContextBody(key0, "{\"a\":1}"), true);
  assert.equal(getCachedSessionContextBody(key0), "{\"a\":1}", "memory still works");
  await flushSessionContextDiskWritesForTests();
  assert.equal(await loadSessionContextBody(key0), "{\"a\":1}", "served from memory");
  clearSessionContextCacheForTests();
  assert.equal(await loadSessionContextBody(key0), null);
  rmSync(join(dir, "cache"), { recursive: true, force: true });
});

test("a truncated or foreign cache file is rejected instead of served", async (t) => {
  useTempAgentDir(t);
  const fileKey = key({ tail: 9 });
  const file = join(sessionContextDiskCacheDir(), `${createHash("sha1").update(fileKey).digest("hex")}.json`);
  // Declared length does not match the payload: refuse it.
  mkdirSync(sessionContextDiskCacheDir(), { recursive: true });
  writeFileSync(file, "999\n{\"a\":1}");
  assert.equal(await loadSessionContextBody(fileKey), null);
  // No length prefix at all: refuse it.
  writeFileSync(file, "{\"a\":1}");
  assert.equal(await loadSessionContextBody(fileKey), null);
});

test("the persisted layer is pruned to its file budget, oldest first", async (t) => {
  useTempAgentDir(t);
  const original = { ...SESSION_CONTEXT_DISK_CACHE_LIMITS };
  t.after(() => Object.assign(SESSION_CONTEXT_DISK_CACHE_LIMITS, original));
  SESSION_CONTEXT_DISK_CACHE_LIMITS.maxFiles = 2;
  SESSION_CONTEXT_DISK_CACHE_LIMITS.pruneIntervalMs = 0;

  for (const tail of [1, 2, 3, 4]) {
    storeSessionContextBody(key({ tail }), `{"n":${tail}}`);
    await flushSessionContextDiskWritesForTests();
  }
  const stats = await getSessionContextDiskCacheStatsForTests();
  assert.equal(stats.files, 2, "only the newest windows are kept");
  const kept = readdirSync(sessionContextDiskCacheDir()).filter((name) => name.endsWith(".json"));
  assert.equal(kept.length, 2);
  assert.equal(await loadSessionContextBody(key({ tail: 4 })), "{\"n\":4}");
});
