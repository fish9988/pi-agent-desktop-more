import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const theme = await jiti.import("./plus-theme.ts");
const work = await jiti.import("./work-details.ts");

test("Plus theme: stored values are validated and defaulted", () => {
  assert.deepEqual(theme.parseStoredPlusTheme(null), theme.DEFAULT_PLUS_THEME);
  assert.deepEqual(theme.parseStoredPlusTheme("not json"), theme.DEFAULT_PLUS_THEME);
  const parsed = theme.parseStoredPlusTheme(JSON.stringify({ style: "native", accent: "#ABCDEF", font: "inter", customCss: false }));
  assert.deepEqual(parsed, { style: "native", accent: "#abcdef", font: "inter", customCss: false });
  const bad = theme.normalizePlusTheme({ style: "neon", accent: "red", font: "comic", customCss: "yes" });
  assert.deepEqual(bad, theme.DEFAULT_PLUS_THEME);
});

test("Plus theme: accent derives the related tokens, and none for an empty accent", () => {
  assert.deepEqual(theme.accentProperties(""), {});
  const props = theme.accentProperties("#2563eb");
  assert.equal(props["--accent"], "#2563eb");
  assert.match(props["--accent-soft"], /color-mix/);
});

test("Plus theme: the init script knows every style and font", () => {
  for (const style of theme.PLUS_STYLES) assert.ok(theme.PLUS_THEME_INIT_SCRIPT.includes(`"${style}"`));
  for (const font of theme.PLUS_FONTS) assert.ok(theme.PLUS_THEME_INIT_SCRIPT.includes(`"${font}"`));
  assert.ok(theme.PLUS_THEME_INIT_SCRIPT.includes(theme.PLUS_THEME_STORAGE_KEY));
});

test("Work details: levels map to the DSH-style policy table", () => {
  assert.equal(work.normalizeWorkDetailsLevel("nope"), "standard");
  assert.equal(work.WORK_DETAILS_POLICY.compact.liveDetail, false);
  assert.equal(work.WORK_DETAILS_POLICY.standard.groupLiveWork, true);
  assert.equal(work.WORK_DETAILS_POLICY.detailed.groupLiveWork, false);
  assert.equal(work.WORK_DETAILS_POLICY.verbose.foldCompletedTurns, false);
  assert.equal(work.normalizeWorkCollapseTiming("next-input"), "next-input");
  assert.equal(work.normalizeWorkCollapseTiming("x"), "completion");
});

test("Work details: the live activity is the newest unfinished tool call", () => {
  const call = (id, toolName, input) => ({ type: "toolCall", toolCallId: id, toolName, input });
  const messages = [
    { role: "assistant", content: [call("a", "read", { path: "src/a.ts" })] },
    { role: "assistant", content: [{ type: "thinking", thinking: "Now run the tests" }, call("b", "bash", { command: "npm test" })] },
  ];
  const results = new Map([["a", { role: "toolResult", toolCallId: "a", content: [] }]]);
  assert.deepEqual(work.currentWorkActivity(messages, null, results), { kind: "command", toolName: "bash", detail: "npm test", preparing: false });
  results.set("b", { role: "toolResult", toolCallId: "b", content: [] });
  assert.equal(work.currentWorkActivity(messages, null, results), null);
  const streaming = { role: "assistant", content: [{ type: "thinking", thinking: "First idea\n\nCheck the sidebar spacing" }] };
  assert.deepEqual(work.currentWorkActivity(messages, streaming, results), { kind: "think", detail: "Check the sidebar spacing" });
});

test("Work details: summaries, durations and searchable text", () => {
  const messages = [
    { role: "assistant", content: [{ type: "toolCall", toolCallId: "1", toolName: "read", input: {} }, { type: "toolCall", toolCallId: "2", toolName: "read", input: {} }] },
    { role: "assistant", content: [{ type: "toolCall", toolCallId: "3", toolName: "edit", input: { path: "x" } }] },
  ];
  assert.deepEqual(work.summarizeWorkActivities(messages), ["read", "edit"]);
  assert.equal(work.formatWorkDuration(65_000, { h: "h", m: "m", s: "s" }), "1m05s");
  assert.equal(work.formatWorkDuration(4_000, { h: "h", m: "m", s: "s" }), "4s");
  const results = new Map([["3", { role: "toolResult", toolCallId: "3", content: [{ type: "text", text: "patched OK" }] }]]);
  assert.match(work.searchableMessageText(messages[1], results), /patched OK/);
  assert.equal(work.activityKindForTool("mcp__rea__web_fetch"), "web");
  assert.equal(work.activityKindForTool("powershell"), "command");
});
