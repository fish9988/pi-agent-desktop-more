import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const {
  SESSION_CONTEXT_CACHE_LIMITS,
  cacheSessionContextBody,
  clearSessionContextCacheForTests,
  getCachedSessionContextBody,
  getSessionContextCacheStatsForTests,
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
