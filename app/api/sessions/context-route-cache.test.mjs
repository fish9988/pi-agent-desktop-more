// Integration coverage for the server-side serialized context cache: two
// identical context requests must reuse the body, and an external append must
// move the disk fingerprint so a fresh window is produced.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET: getContext } = await jiti.import("./[id]/context/route.ts");
const { SessionManager } = await jiti.import("@earendil-works/pi-coding-agent");
const {
  getSessionFileFingerprint,
  invalidateSessionListCache,
  invalidateSessionManagerCache,
  invalidateSessionPathCache,
} = await jiti.import("../../../lib/session-reader.ts");
const {
  clearSessionContextCacheForTests,
  getCachedSessionContextBody,
  sessionContextCacheKey,
  clearSessionContextDiskCacheForTests,
  flushSessionContextDiskWritesForTests,
} = await jiti.import("../../../lib/session-context-cache.ts");

test("the context route caches the serialized window and misses after an append", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-context-payload-cache-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  invalidateSessionListCache();
  clearSessionContextCacheForTests();

  const manager = SessionManager.create(dir);
  manager.appendMessage({ role: "user", content: "first question", timestamp: Date.now() });
  manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "first answer" }], timestamp: Date.now() });
  const sessionId = manager.getSessionId();
  const filePath = manager.getSessionFile();

  t.after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    invalidateSessionPathCache(sessionId);
    invalidateSessionManagerCache(filePath);
    invalidateSessionListCache();
    clearSessionContextCacheForTests();
    // The persisted window layer writes in the background; let it finish before
    // the agent dir goes away (the cache dir lives inside it).
    await flushSessionContextDiskWritesForTests();
    await clearSessionContextDiskCacheForTests();
    await rm(dir, { recursive: true, force: true });
  });

  const context = { params: Promise.resolve({ id: sessionId }) };
  const url = `http://localhost/api/sessions/${sessionId}/context?tail=2&wholeTurns=1&deferThinking=1`;
  const firstResponse = await getContext(new Request(url), context);
  assert.equal(firstResponse.status, 200);
  const firstBody = await firstResponse.text();
  const firstPayload = JSON.parse(firstBody);
  assert.equal(firstPayload.context.entryIds.length, 2);

  const key = sessionContextCacheKey({
    filePath,
    fingerprint: getSessionFileFingerprint(filePath)?.fingerprint,
    sessionId,
    leafId: null,
    before: null,
    tail: 2,
    deferThinking: true,
    deferToolResultImages: false,
    excludeLeaf: false,
    wholeTurns: true,
  });
  assert.equal(getCachedSessionContextBody(key), firstBody, "the route stores its serialized body");

  const secondResponse = await getContext(new Request(url), context);
  assert.equal(await secondResponse.text(), firstBody, "a repeat request serves the cached body");

  manager.appendMessage({ role: "user", content: "follow-up question", timestamp: Date.now() });
  const thirdResponse = await getContext(new Request(url), context);
  const thirdBody = await thirdResponse.text();
  assert.notEqual(thirdBody, firstBody, "an append changes the fingerprint and bypasses the old body");
  const thirdPayload = JSON.parse(thirdBody);
  assert.equal(thirdPayload.context.messages.at(-1).content, "follow-up question");
  assert.ok(thirdPayload.context.entryIds.includes(firstPayload.context.entryIds.at(-1)));
});
