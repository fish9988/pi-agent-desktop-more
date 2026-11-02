// Static + behavior coverage for the session detail API's tail bound (the #509/#555
// transfer fix). Mirrors runtime-route.test.mjs: source assertions confirm the route
// parses ?tail (default 50, NaN-safe, capped at 1000) and feeds only the sliced chain
// to buildSessionContextAsync. The data-slicing behavior itself is covered end-to-end in
// lib/session-reader.pagination.test.mjs (sliceActiveBranch + buildSessionContext).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const routeSrc = await readFileSync(new URL("./[id]/route.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { buildSessionContext, invalidateSessionDerivationCache } = await jiti.import("@/lib/session-reader");

test("detail route parses ?tail: default 50, NaN-safe, capped at 1000", () => {
  assert.match(routeSrc, /const rawTail = Number\(searchParams\.get\("tail"\)\)/);
  assert.match(routeSrc, /Math\.min\(rawTail, 1000\)/);
  assert.match(routeSrc, /Number\.isFinite\(rawTail\) && rawTail > 0 \? Math\.min\(rawTail, 1000\) : 50/);
  assert.match(routeSrc, /buildSessionContextAsync\(entries as never, leafId, \{[^}]*tail,[^}]*sessionId: id[^}]*\}\)/);
  assert.match(routeSrc, /computeSessionStats\(entries as unknown as SessionEntry\[\]\)/);
  assert.match(routeSrc, /messageCount: stats\.totalMessages/);
  assert.match(routeSrc, /stats,/);
  // The derivation (tree + stats) is revision-keyed and sliced with yields, so no
  // single synchronous stretch in this route touches the whole entry list at once.
  assert.match(routeSrc, /getSessionDerivationAsync\(\{/);
  assert.match(routeSrc, /await yieldToEventLoop\(\)/);
  assert.match(routeSrc, /key: snapshotRevision \?/);
});

test("detail route bounds history to the tail window (default 50 over 5000 entries)", () => {
  const entries = [];
  for (let i = 0; i < 5000; i++) {
    entries.push({
      id: `e${i}`,
      parentId: i === 0 ? null : `e${i - 1}`,
      type: "message",
      timestamp: new Date(1000 + i * 1000).toISOString(),
      message: { role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` },
    });
  }
  const ctx = buildSessionContext(entries, "e4999", { tail: 50 });
  assert.equal(ctx.messages.length, 50);
  // The transferred window is the tail, not the full 5000-entry forest.
  assert.equal(ctx.entryIds[0], "e4950");
  assert.equal(ctx.entryIds[ctx.entryIds.length - 1], "e4999");
});

test("detail route with an out-of-range tail still caps at 1000", () => {
  const entries = [];
  for (let i = 0; i < 5000; i++) {
    entries.push({ id: `e${i}`, parentId: i === 0 ? null : `e${i - 1}`, type: "message", timestamp: new Date(1000 + i * 1000).toISOString(), message: { role: "user", content: `m${i}` } });
  }
  const ctx = buildSessionContext(entries, "e4999", { tail: 5000 });
  assert.equal(ctx.messages.length, 5000);
});

test("the derived view is cached per session, not per entry shape", async (t) => {
  // Regression: `snapshotRevision` hashes the on-disk *fingerprint*, and an
  // unflushed live session has no file (fingerprint "missing"), so two sessions
  // whose only entries share ids and counts hash identically. Without the
  // session id in the cache key, the second session was served the first one's
  // tree/stats/firstMessage.
  const { GET: getSessionDetail } = await jiti.import("./[id]/route.ts");
  const previousRegistry = globalThis.__piSessions;
  const ids = ["detail-derived-a", "detail-derived-b"];
  const makeWrapper = (id, text) => {
    const entry = {
      type: "message",
      id: "u1",
      parentId: null,
      timestamp: "2026-09-05T00:00:00.000Z",
      message: { role: "user", content: text },
    };
    const sessionManager = {
      getHeader: () => ({ type: "session", id, cwd: "/tmp", timestamp: "2026-09-05T00:00:00.000Z" }),
      getEntries: () => [entry],
      getLeafId: () => entry.id,
      getTree: () => [],
      getSessionName: () => undefined,
      getSessionFile: () => `/tmp/pi-web-detail-derived-never-written-${process.pid}.jsonl`,
    };
    return {
      isAlive: () => true,
      isRunning: () => false,
      inner: { sessionManager },
      sessionFile: sessionManager.getSessionFile(),
      sessionId: id,
      cwd: "/tmp",
    };
  };
  globalThis.__piSessions = new Map([
    [ids[0], makeWrapper(ids[0], "first session body")],
    [ids[1], makeWrapper(ids[1], "second session body")],
  ]);
  invalidateSessionDerivationCache();
  t.after(() => {
    globalThis.__piSessions = previousRegistry;
    invalidateSessionDerivationCache();
  });

  const detail = async (id) => {
    const response = await getSessionDetail(new Request(`http://localhost/api/sessions/${id}`), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const first = await detail(ids[0]);
  assert.equal(first.info.firstMessage, "first session body");
  const second = await detail(ids[1]);
  assert.equal(second.info.firstMessage, "second session body", "the second session must not reuse the first one's derived view");
  // The cache still serves a repeat of the same session from the same key.
  const again = await detail(ids[0]);
  assert.equal(again.info.firstMessage, "first session body");
  // These two stubs also show *why* the key needs the id: with no session file
  // on disk and no inner session id, their revisions collide.
  assert.equal(first.snapshotRevision, second.snapshotRevision);
});
