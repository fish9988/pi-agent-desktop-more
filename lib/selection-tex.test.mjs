import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { texSource, texClipboardPayload } = await createJiti(import.meta.url).import("./selection-tex.ts");

test("texSource wraps inline math in $...$ and display math in $$...$$", () => {
  assert.equal(texSource("E = mc^2", false), "$E = mc^2$");
  assert.equal(texSource("\\frac{a}{b}", true), "$$\n\\frac{a}{b}\n$$");
});

test("texSource widens fences when the formula contains literal dollars", () => {
  assert.equal(texSource("\\$5 + x", false), "$$\\$5 + x$$");
  assert.equal(texSource("$a$", false), "$$ $a$ $$");
  assert.equal(texSource("$$a$$", true), "$$$\n$$a$$\n$$$");
});

test("texClipboardPayload returns null when there is no selection or no math", () => {
  assert.equal(texClipboardPayload(null), null);
  assert.equal(texClipboardPayload({ rangeCount: 0, isCollapsed: true }), null);
});
