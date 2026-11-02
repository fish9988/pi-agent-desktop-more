// Settings page search: the pure index/scoring behind the search box.
// The DOM side (which rows are collected, how a hit is revealed) lives in
// components/SettingsPanel.tsx; these cases pin the matching contract:
// case-insensitive, Chinese substring, every word must match, label above hint.
import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const search = await jiti.import("./settings-search.ts");

const items = [
  { sectionId: "general", itemId: "general.thinking", label: "默认展开思考过程", hint: "Thinking blocks stay open", keywords: "reasoning" },
  { sectionId: "general", itemId: "general.powershell", label: "使用 PowerShell", hint: "Windows shell tool", keywords: "shell bash" },
  { sectionId: "general", itemId: "general.sound", label: "完成提示音", hint: "Plays a chime when a reply ends", keywords: "sound audio" },
  { sectionId: "appearance", itemId: "appearance.theme", label: "外观模式", hint: "浅色、深色或跟随系统", keywords: "theme dark light color" },
  { sectionId: "appearance", itemId: "appearance.font", label: "界面字体", hint: "字体用于整个界面", keywords: "font family" },
  { sectionId: "models", itemId: "models.provider", label: "API Key", hint: "服务商的密钥", keywords: "token" },
];
const index = search.buildSettingsIndex(items);
const searchIds = (query, limit) => search.searchSettings(index, query, limit).map((result) => result.itemId);

test("Settings search: an empty or blank query returns nothing", () => {
  assert.deepEqual(search.searchSettings(index, ""), []);
  assert.deepEqual(search.searchSettings(index, "   \n\t "), []);
  assert.deepEqual(search.searchWords("  Smart   Case  "), ["smart", "case"]);
});

test("Settings search: matching ignores case", () => {
  assert.deepEqual(searchIds("POWERSHELL"), ["general.powershell"]);
  assert.deepEqual(searchIds("powershell"), ["general.powershell"]);
  assert.deepEqual(searchIds("api key"), ["models.provider"]);
});

test("Settings search: a Chinese substring matches anywhere in the label", () => {
  assert.deepEqual(searchIds("思考"), ["general.thinking"]);
  assert.deepEqual(searchIds("提示"), ["general.sound"]);
  // Hints are searchable too, so a Chinese description finds its row.
  assert.deepEqual(searchIds("浅色"), ["appearance.theme"]);
});

test("Settings search: every word must match (AND), across label, hint and keywords", () => {
  assert.deepEqual(searchIds("界面 字体"), ["appearance.font"]);
  assert.deepEqual(searchIds("windows shell"), ["general.powershell"]);
  // One word in the label, the other in the keywords.
  assert.deepEqual(searchIds("完成 audio"), ["general.sound"]);
  assert.deepEqual(searchIds("字体 powershell"), []);
  assert.deepEqual(searchIds("nothing-here"), []);
});

test("Settings search: a label hit sorts above a hint-only hit", () => {
  const both = search.buildSettingsIndex([
    { sectionId: "general", itemId: "hint-hit", label: "完成通知", hint: "Plays a chime when a reply ends — 提示音" },
    { sectionId: "general", itemId: "label-hit", label: "提示音音量", hint: "Volume" },
  ]);
  const results = search.searchSettings(both, "提示音");
  assert.deepEqual(results.map((result) => result.itemId), ["label-hit", "hint-hit"]);
  assert.ok(results[0].score > results[1].score);
  // An exact label and a label prefix both beat a label substring.
  const exact = search.buildSettingsIndex([
    { sectionId: "x", itemId: "contains", label: "全局搜索设置" },
    { sectionId: "x", itemId: "prefix", label: "搜索设置" },
    { sectionId: "x", itemId: "exact", label: "搜索" },
  ]);
  assert.deepEqual(search.searchSettings(exact, "搜索").map((result) => result.itemId), ["exact", "prefix", "contains"]);
});

test("Settings search: equal scores keep the page order", () => {
  const ordered = search.buildSettingsIndex([
    { sectionId: "general", itemId: "first", label: "提示音" },
    { sectionId: "general", itemId: "second", label: "提示音" },
  ]);
  assert.deepEqual(search.searchSettings(ordered, "提示音").map((result) => result.itemId), ["first", "second"]);
});

test("Settings search: results keep the original label and hint, and honour the limit", () => {
  const [first] = search.searchSettings(index, "默认 思考");
  assert.equal(first.label, "默认展开思考过程");
  assert.equal(first.hint, "Thinking blocks stay open");
  assert.equal(first.sectionId, "general");
  const limited = search.buildSettingsIndex([
    { sectionId: "x", itemId: "a", label: "设置提示音" },
    { sectionId: "x", itemId: "b", label: "提示音音量" },
  ]);
  assert.equal(search.searchSettings(limited, "提示音").length, 2);
  assert.equal(search.searchSettings(limited, "提示音", 1).length, 1);
  assert.deepEqual(search.searchSettings(limited, "提示音", 0), []);
});

test("Settings search: matched runs are split for the highlight", () => {
  assert.deepEqual(search.splitMatchSegments("API Key", "api"), [
    { text: "API", matched: true },
    { text: " Key", matched: false },
  ]);
  assert.deepEqual(search.splitMatchSegments("外观模式", "模式"), [
    { text: "外观", matched: false },
    { text: "模式", matched: true },
  ]);
  // Two words, in either order, and no duplicate marks where they touch.
  assert.deepEqual(search.splitMatchSegments("浅色、深色", "深色 浅色"), [
    { text: "浅色", matched: true },
    { text: "、", matched: false },
    { text: "深色", matched: true },
  ]);
  assert.deepEqual(search.splitMatchSegments("Plain label", "zzz"), [{ text: "Plain label", matched: false }]);
  assert.deepEqual(search.splitMatchSegments("Plain label", ""), [{ text: "Plain label", matched: false }]);
  assert.deepEqual(search.splitMatchSegments("", "x"), [{ text: "", matched: false }]);
});

test("Settings search: row selectors prefer the innermost existing row", () => {
  // The list is data, not logic, but it must not lose the row containers the
  // panels actually render (a rename there would silently drop search hits).
  for (const selector of [".settings-chat-option", ".settings-option", ".settings-general-heading", ".config-field", ".config-sidebar-item"]) {
    assert.ok(search.SETTINGS_ROW_SELECTORS.includes(selector), `${selector} is indexed`);
  }
  // Disclosure rows whose content is not rendered while collapsed.
  assert.ok(search.SETTINGS_ROW_SELECTORS.includes("button[aria-expanded][aria-controls]"));
  // The explicit marker a panel can add to a row whose label is not structural.
  assert.ok(search.SETTINGS_ROW_SELECTORS.includes("[data-settings-item]"));
});
