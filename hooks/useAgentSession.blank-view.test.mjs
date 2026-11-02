// Switching sessions used to leave an empty transcript, with only the "load
// earlier" row on screen: the freshness fast path kept "the messages we already
// had" — which a session switch had just emptied — and then wrote that empty
// window into the view cache. These pin the guards that stop it coming back.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hook = (await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const chat = (await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("the freshness fast path only keeps a window that belongs to this session", () => {
  const guard = hook.slice(hook.indexOf("const viewHoldsThisSession"), hook.indexOf("const persistedMessages"));
  assert.match(guard, /sessionIdRef\.current === sid/);
  assert.match(guard, /dataRef\.current\?\.sessionId === sid/);
  assert.match(guard, /messagesRef\.current\.length > 0/);
  // And it is part of the condition, not a separate branch that can be skipped.
  assert.match(guard, /const revisionUnchanged = Boolean\(\n\s*viewHoldsThisSession/);
});

test("an empty window is never written to the view cache", () => {
  assert.match(hook, /if \(d\.treeFormat === "summary" && d\.snapshotRevision && persistedMessages\.length > 0\) \{/);
});

test("an empty snapshot is treated as no snapshot at all", () => {
  assert.match(hook, /const cached = cachedSnapshot && cachedSnapshot\.messages\.length > 0 \? cachedSnapshot : null;/);
  assert.match(hook, /if \(cachedSnapshot && !cached\) deleteSessionViewSnapshot\(session\.id\);/);
});

test("the load-earlier row recovers when there is more history but no cursor", () => {
  const request = chat.slice(chat.indexOf("const requestOlderPage"), chat.indexOf("// The sentinel row also carries"));
  assert.match(request, /if \(!oldestId\) \{/);
  assert.match(request, /retryLoad\(\);/);
  assert.match(request, /\[activeLeafId, hasEarlierMessages, historyCursor, loadContext, retryLoad, scrollContainerRef, session\?\.id\]/);
});

test("a real session never renders as a blank pane", () => {
  // A visible recovery state (plus one automatic retry) instead of nothing.
  assert.match(chat, /messages\.length === 0 && session && !error && !isEmptyNew \? \(/);
  assert.match(chat, /className="chat-empty-recovery" role="status"/);
  assert.match(chat, /onClick=\{\(\) => retryLoad\(\)\}/);
  const retry = chat.slice(chat.indexOf("const emptyRetrySessionRef"), chat.indexOf("useScrollbarVisibility("));
  assert.match(retry, /if \(emptyRetrySessionRef\.current === sid\) return;/);
  assert.match(retry, /emptyRetrySessionRef\.current = sid;\n\s*retryLoad\(\);/);
});

test("a stuck scroll restore cannot hide the transcript forever", () => {
  assert.match(chat, /const timer = setTimeout\(\(\) => setPendingScrollRestore\(null\), 2500\);/);
});

test("a transcript too short to scroll still fills itself", () => {
  // No scrollable range means no scroll event, so the top-of-transcript trigger
  // can never fire. Fill the viewport one page at a time once intent is known.
  const effect = chat.slice(chat.indexOf("// A transcript shorter than the viewport cannot be scrolled"), chat.indexOf("// Keep the rendered window at least as large"));
  assert.match(effect, /if \(!userScrollIntentRef\.current\) return;/);
  assert.match(effect, /if \(container\.scrollHeight > container\.clientHeight \+ 8\) return;/);
  assert.match(effect, /requestOlderPage\(\);/);
});
