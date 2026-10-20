import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const theme = await jiti.import("./plus-theme.ts");
const work = await jiti.import("./work-details.ts");

const catalog = await jiti.import("./plus-theme-catalog.ts");
const userThemes = await jiti.import("./plus-user-themes.ts");
const fileOps = await jiti.import("./file-ops.ts");
const systemFonts = await jiti.import("./system-fonts.ts");

test("Plus theme: settings are validated, defaulted and migrated from v1", () => {
  assert.deepEqual(theme.parseStoredPlusTheme(null), theme.DEFAULT_PLUS_THEME);
  assert.deepEqual(theme.parseStoredPlusTheme("not json"), theme.DEFAULT_PLUS_THEME);
  const v1 = theme.parseStoredPlusTheme(JSON.stringify({ style: "native", accent: "#ABCDEF", font: "inter", customCss: false }));
  assert.equal(v1.theme, "native");
  assert.equal(v1.uiFont, "Inter");
  assert.equal(v1.accent, "#abcdef");
  assert.equal(v1.customCss, false);
  const v2 = theme.normalizePlusTheme({ theme: "nord", codeFont: "JetBrains Mono", chatFont: "LXGW WenKai\";}body{x" });
  assert.equal(v2.theme, "nord");
  assert.equal(v2.codeFont, "JetBrains Mono");
  assert.equal(v2.chatFont, "LXGW WenKaibodyx");
  assert.equal(theme.normalizePlusTheme({ theme: "user:my-theme-1a2b3c" }).theme, "user:my-theme-1a2b3c");
  assert.equal(theme.normalizePlusTheme({ theme: "nope" }).theme, "clean");
  assert.equal(theme.normalizePlusTheme({ theme: "user:../x" }).theme, "clean");
});

test("Plus theme: font stacks quote names and keep fallbacks", () => {
  assert.equal(theme.fontStack("", "ui"), null);
  assert.match(theme.fontStack("Microsoft YaHei", "chat"), /^"Microsoft YaHei", /);
  assert.match(theme.fontStack("Georgia, serif", "chat"), /^"Georgia", serif, /);
  assert.match(theme.fontStack("Cascadia Code", "code"), /monospace$/);
});

test("Plus theme: accent derives the related tokens, and none for an empty accent", () => {
  assert.deepEqual(theme.accentProperties(""), {});
  const props = theme.accentProperties("#2563eb");
  assert.equal(props["--accent"], "#2563eb");
  assert.match(props["--accent-soft"], /color-mix/);
});

test("Plus theme: the init script knows every built-in theme and storage key", () => {
  const bases = Object.fromEntries(catalog.BUILTIN_THEMES.map((t) => [t.id, t.base]));
  const script = theme.plusThemeInitScript(bases);
  for (const t of catalog.BUILTIN_THEMES) assert.ok(script.includes(`"${t.id}"`));
  assert.ok(script.includes(theme.PLUS_THEME_STORAGE_KEY));
  assert.ok(script.includes(theme.PLUS_USER_THEME_CACHE_KEY));
  assert.doesNotThrow(() => new Function(script));
});

test("Built-in themes: unique ids, complete palettes and generated CSS", () => {
  const ids = catalog.BUILTIN_THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 10);
  const css = catalog.builtinThemesCss();
  for (const t of catalog.BUILTIN_THEMES) {
    if (!t.light) continue;
    assert.ok(t.dark, `${t.id} has a dark palette`);
    assert.ok(css.includes(`html[data-plus-theme="${t.id}"]:root{`));
    assert.ok(css.includes(`html.dark[data-plus-theme="${t.id}"]:root{`));
    for (const key of ["bg", "panel", "workbench", "surface", "text", "accent", "border"]) {
      assert.match(t.light[key], /^#[0-9a-f]{6}$/i, `${t.id}.light.${key}`);
      assert.match(t.dark[key], /^#[0-9a-f]{6}$/i, `${t.id}.dark.${key}`);
    }
  }
  assert.match(catalog.themeTemplateCss(catalog.findBuiltinTheme("nord")), /html\.dark:root \{/);
});

test("Imported themes: header round-trip, swatch and ids", () => {
  const file = userThemes.serializeThemeFile("我的主题", "clean", ":root{--bg:#fff;--accent: #ff0000;}");
  const parsed = userThemes.parseThemeFile(file);
  assert.equal(parsed.name, "我的主题");
  assert.equal(parsed.base, "clean");
  assert.equal(parsed.css, ":root{--bg:#fff;--accent: #ff0000;}");
  assert.deepEqual(userThemes.parseThemeFile(":root{}"), { css: ":root{}" });
  assert.equal(userThemes.themeSwatch(parsed.css).accent, "#ff0000");
  assert.equal(userThemes.themeSwatch("--accent: var(--x)").accent, undefined);
  assert.ok(userThemes.isValidThemeId(userThemes.slugifyThemeName("Claude Theme")));
  assert.ok(userThemes.isValidThemeId(userThemes.slugifyThemeName("中文主题")));
  assert.equal(userThemes.isValidThemeId("../etc"), false);
});

test("Imported themes: create, update, list and delete on disk", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "plus-themes-"));
  const created = await userThemes.createUserTheme(dir, { name: "Test", base: "native", css: ":root{--accent:#123456}" });
  assert.equal((await userThemes.listUserThemes(dir)).length, 1);
  const updated = await userThemes.updateUserTheme(dir, created.id, { base: "clean" });
  assert.equal(updated.base, "clean");
  assert.equal(updated.css, ":root{--accent:#123456}");
  assert.notEqual(await userThemes.userThemeVersion(dir, created.id), "none");
  await userThemes.deleteUserTheme(dir, created.id);
  assert.equal((await userThemes.listUserThemes(dir)).length, 0);
  await assert.rejects(userThemes.createUserTheme(dir, { name: "", css: "" }), /name/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("File ops: names are validated the way Windows needs", () => {
  assert.equal(fileOps.validateEntryName(" a.txt "), "a.txt");
  for (const bad of ["", "..", "a/b", "a\\b", "a:b", "CON", "lpt1.txt", "name.", "a?"]) {
    assert.throws(() => fileOps.validateEntryName(bad), undefined, bad);
  }
  assert.throws(() => fileOps.parseFileOp({ op: "rm" }));
  assert.deepEqual(fileOps.parseFileOp({ op: "rename", path: "C:/x/a", name: "b" }), { op: "rename", path: "C:/x/a", name: "b" });
});

test("File ops: rename, new file/folder, duplicate and delete via an injected trash", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plus-fileops-"));
  const file = (await fileOps.performFileOp({ op: "newFile", dir, name: "a.txt" })).path;
  assert.ok(fs.existsSync(file));
  await assert.rejects(fileOps.performFileOp({ op: "newFile", dir, name: "a.txt" }), /exists/);
  const folder = (await fileOps.performFileOp({ op: "newFolder", dir, name: "sub" })).path;
  assert.ok(fs.statSync(folder).isDirectory());
  const renamed = (await fileOps.performFileOp({ op: "rename", path: file, name: "b.txt" })).path;
  assert.equal(path.basename(renamed), "b.txt");
  const copy = (await fileOps.performFileOp({ op: "duplicate", path: renamed })).path;
  assert.equal(path.basename(copy), "b copy.txt");
  const trashed = [];
  await fileOps.performFileOp({ op: "delete", path: copy }, { trash: async (p) => { trashed.push(p); fs.rmSync(p); } });
  assert.deepEqual(trashed, [copy]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("System fonts: PowerShell output is parsed, de-duplicated and flagged", () => {
  const fonts = systemFonts.parseWindowsFontLines("Microsoft YaHei|微软雅黑|微軟正黑體\r\nCascadia Code||\r\n@SimSun||\r\ncascadia code||\r\nArial||\r\n");
  assert.deepEqual(fonts.map((f) => f.name), ["Arial", "cascadia code", "Microsoft YaHei"]);
  assert.equal(fonts.find((f) => f.name === "Microsoft YaHei").zh, "微软雅黑");
  assert.equal(fonts.find((f) => f.name === "cascadia code").mono, true);
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
