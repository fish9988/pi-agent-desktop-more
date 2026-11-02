import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-level guard for the 1.19.0 item "find bar locates matches through the
// message index, not by re-measuring the DOM". The real DOM behaviour is
// covered by `lib/message-index.test.mjs` (pure geometry) and the Playwright
// timing run recorded in docs/agents/plus-status.md; this pins the wiring so a
// later refactor cannot quietly go back to per-match DOM scans.

const source = readFileSync(new URL("./ChatFindBar.tsx", import.meta.url), "utf8");

test("find bar jumps through lib/message-index", () => {
  assert.match(source, /from "@\/lib\/message-index"/);
  assert.match(source, /scrollToEntry\(container, revealEntryId/);
  assert.match(source, /elementForEntry\(container, revealEntryId\)/);
});

test("find bar keeps its index fresh only while it is open", () => {
  assert.match(source, /if \(!open\) return;/);
  const watch = source.indexOf("watchMessageIndex(container)");
  const dispose = source.indexOf("watch.dispose()");
  assert.ok(watch > 0, "the bar must watch the index while open");
  assert.ok(dispose > watch, "the watcher must be disposed");
});

test("find bar no longer scans the transcript for matches", () => {
  assert.doesNotMatch(source, /querySelectorAll\s*[<(]/);
  assert.doesNotMatch(source, /getBoundingClientRect/);
});

test("find bar behaviour is unchanged: highlights, count, keys, debounce", () => {
  // highlight names + the injected ::highlight() style (the CSS parser drops it)
  assert.match(source, /const HIGHLIGHT_ALL = "pi-chat-find"/);
  assert.match(source, /const HIGHLIGHT_CURRENT = "pi-chat-find-current"/);
  assert.match(source, /::highlight\(\$\{HIGHLIGHT_ALL\}\)/);
  assert.match(source, /new HighlightCtor\(\.\.\.all\)/);
  // match counting over session data, tool output included
  assert.match(source, /searchableMessageText\(message, toolResults\)/);
  assert.match(source, /message\.role === "toolResult"/);
  assert.match(source, /aria-live="polite"/);
  // keyboard: Enter / Shift+Enter / Escape
  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /find\.prev\(\)/);
  assert.match(source, /find\.next\(\)/);
  assert.match(source, /event\.key === "Escape"/);
  // streaming repaint is debounced instead of running per mutation
  assert.match(source, /window\.setTimeout\(paint, 250\)/);
  assert.match(source, /observer\.observe\(container, \{ childList: true, subtree: true, characterData: true \}\)/);
});
