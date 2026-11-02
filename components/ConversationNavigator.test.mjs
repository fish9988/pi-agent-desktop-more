import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-level guard for the 1.19.0 item "the navigator's active turn comes from
// the message index instead of measuring every anchor per scroll frame".
// Geometry itself is tested in `lib/message-index.test.mjs`.

const source = readFileSync(new URL("./ConversationNavigator.tsx", import.meta.url), "utf8");

test("navigator resolves the active turn through lib/message-index", () => {
  assert.match(source, /from "\.\.\/lib\/message-index"/);
  assert.match(source, /turnIndexAtOffset\(container, container\.scrollTop \+ ACTIVE_TURN_PROBE\)/);
  assert.match(source, /watchMessageIndex\(container, updateActive\)/);
  assert.match(source, /watch\.dispose\(\)/);
});

test("navigator keeps the old 28px probe offset", () => {
  const indexSource = readFileSync(new URL("../lib/message-index.ts", import.meta.url), "utf8");
  assert.match(indexSource, /export const ACTIVE_TURN_PROBE = 28/);
  assert.match(source, /ACTIVE_TURN_PROBE/);
});

test("navigator no longer scans anchors", () => {
  assert.doesNotMatch(source, /querySelectorAll\s*[<(]/);
  // The only remaining rect read measures the rail itself (pointer → turn).
  const rects = source.match(/getBoundingClientRect/g) ?? [];
  assert.equal(rects.length, 1);
  assert.match(source, /const rect = event\.currentTarget\.getBoundingClientRect\(\)/);
});

test("navigator behaviour is unchanged: rail, drag, list, preview, keyboard", () => {
  assert.match(source, /setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /if \(draggingRef\.current && index !== activeIndex\)/);
  assert.match(source, /role="slider"/);
  assert.match(source, /event\.key !== "ArrowUp" && event\.key !== "ArrowDown"/);
  assert.match(source, /if \(Date\.now\(\) - hoverOpenedAtRef\.current < 400\) return;/);
  assert.match(source, /setListOpen\(\(open\) => !open\)/);
  assert.match(source, /conversation-navigator-preview/);
  // Plus: when hasMore is true, keep the navigator visible so earlier history can be loaded.
  assert.match(source, /if \(!hasMore && turns\.length < 2\) return null;/);
  assert.match(source, /conversation-navigator-load-more/);
});
