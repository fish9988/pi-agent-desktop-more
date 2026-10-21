import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const chatWindow = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const chatInput = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
// Plus: chat width and size moved to Settings › Appearance.
const settingsPanel = await readFile(new URL("./AppearanceSettingsPage.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const chatAppearanceHook = await readFile(new URL("../hooks/useChatAppearance.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const { clampChatContentWidth, clampChatContentWidthPercent, chatContentMaxWidthValue, clampChatContentFontSize, terminalFontSize } = await jiti.import("../hooks/useChatAppearance.ts");

const widthVariable = /var\(--chat-content-max-width, 820px\)/g;

test("chat content keeps the existing 820px default behind one shared variable", () => {
  assert.equal((chatWindow.match(widthVariable) ?? []).length, 2);
  assert.equal((chatInput.match(widthVariable) ?? []).length, 1);
  assert.match(globals, /--chat-content-max-width: 820px;/);
  assert.doesNotMatch(chatWindow, /max-w-\[820px\]|maxWidth: 820/);
  assert.doesNotMatch(chatInput, /maxWidth: 820/);
});

test("Appearance settings own the chat width preference", () => {
  assert.match(chatInput, /useChatAppearance\(\)/);
  assert.match(settingsPanel, /useChatAppearance\(\)/);
  assert.match(settingsPanel, /type="range"/);
  assert.match(settingsPanel, /CHAT_CONTENT_WIDTH_PERCENT_MIN : CHAT_CONTENT_WIDTH_MIN/);
  assert.match(settingsPanel, /CHAT_CONTENT_WIDTH_PERCENT_MAX : CHAT_CONTENT_WIDTH_MAX/);
  assert.match(settingsPanel, /step=\{chatWidthIsPercent \? 1 : 10\}/);
  assert.match(chatAppearanceHook, /pi-chat-content-width/);
  assert.match(chatAppearanceHook, /localStorage\.setItem/);
});

test("chat width validation preserves the default and supported range", () => {
  assert.equal(clampChatContentWidth(undefined), 820);
  assert.equal(clampChatContentWidth("invalid"), 820);
  assert.equal(clampChatContentWidth(null), 820);
  assert.equal(clampChatContentWidth(300), 480);
  assert.equal(clampChatContentWidth(700), 700);
  assert.equal(clampChatContentWidth(1104), 1104);
  assert.equal(clampChatContentWidth(3000), 2400);
});

test("Plus: chat width can be a percentage of the chat column", () => {
  assert.equal(clampChatContentWidthPercent(undefined), 80);
  assert.equal(clampChatContentWidthPercent(10), 30);
  assert.equal(clampChatContentWidthPercent(64.4), 64);
  assert.equal(clampChatContentWidthPercent(140), 100);
  assert.equal(chatContentMaxWidthValue({ width: 900, widthPercent: 70, widthUnit: "percent" }), "70%");
  assert.equal(chatContentMaxWidthValue({ width: 900, widthPercent: 70, widthUnit: "px" }), "900px");
});

test("chat font size preserves the default and bounds stored or supplied values", () => {
  for (const value of [undefined, null, "invalid", Infinity, NaN]) {
    assert.equal(clampChatContentFontSize(value), 14);
  }
  assert.equal(clampChatContentFontSize(8), 12);
  assert.equal(clampChatContentFontSize("18"), 18);
  assert.equal(clampChatContentFontSize(18.7), 19);
  assert.equal(clampChatContentFontSize(30), 24);
});

// Plus: ported pi-web 35af7102 (#1329) — the terminal follows the chat size.
test("the terminal keeps 13px at the default chat size and moves with the slider", () => {
  for (const value of [undefined, null, "invalid", 14]) assert.equal(terminalFontSize(value), 13);
  assert.equal(terminalFontSize(12), 11);
  assert.equal(terminalFontSize(18), 17);
  assert.equal(terminalFontSize(24), 23);
  // Plus's slider stops at 24, so the terminal follows to 23.
  assert.equal(terminalFontSize(30), 23);
});

test("the terminal panel applies the derived size and refits on a change", async () => {
  const terminalPanel = await readFile(new URL("./TerminalPanel.tsx", import.meta.url), "utf8");
  assert.match(terminalPanel, /const fontSize = terminalFontSize\(useChatAppearance\(\)\.fontSize\)/);
  assert.match(terminalPanel, /fontSize: fontSizeRef\.current/);
  assert.doesNotMatch(terminalPanel, /fontSize: 13,/);
  assert.match(terminalPanel, /terminal\.options\.fontSize = fontSize;/);
  assert.match(terminalPanel, /refitRef\.current\(\);/);
});
