import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { customPanelTitle } = await jiti.import("./custom-panel-title.ts");

test("custom panel title: the first line without its frame and colours", () => {
  assert.equal(customPanelTitle(["", "╭ Smart Compact ─────────────╮", "│ Context 39% │"]), "Smart Compact");
  assert.equal(customPanelTitle(["\x1b[1m\x1b[36m┌─ Todo list ─┐\x1b[0m"]), "Todo list");
  assert.equal(customPanelTitle(["  Pick a model  "]), "Pick a model");
});

test("custom panel title: falls back when the first line is not a label", () => {
  assert.equal(customPanelTitle([]), null);
  assert.equal(customPanelTitle(["", "   "]), null);
  assert.equal(customPanelTitle(["────────────────"]), null, "a bare rule has no label");
  assert.equal(customPanelTitle(["x".repeat(41)]), null, "a long first line is content, not a title");
  assert.equal(customPanelTitle(["███▒▒▒ 39%"]), null, "a progress bar has no letters");
});
