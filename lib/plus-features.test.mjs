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
const optimizer = await jiti.import("./prompt-optimizer.ts");

test("Prompt optimiser: context and reply cleanup", () => {
  const plain = optimizer.buildOptimizeContext("改下 bug");
  assert.equal(plain.messages.length, 1);
  assert.match(plain.messages[0].content[0].text, /<message>\n改下 bug\n<\/message>/);
  assert.doesNotMatch(plain.messages[0].content[0].text, /<conversation>/);
  const withHistory = optimizer.buildOptimizeContext("same as before", [{ role: "user", content: "fix the login page", timestamp: 1 }]);
  assert.match(withHistory.messages[0].content[0].text, /<conversation>[\s\S]*fix the login page/);
  assert.equal(optimizer.cleanOptimizedText("```text\nDo X.\n```"), "Do X.");
  assert.equal(optimizer.cleanOptimizedText("<message>\nDo Y.\n</message>"), "Do Y.");
  assert.match(optimizer.OPTIMIZE_SYSTEM_PROMPT, /same language/);
});

test("Plus theme: settings are validated, defaulted and migrated from v1", () => {
  assert.deepEqual(theme.parseStoredPlusTheme(null), theme.DEFAULT_PLUS_THEME);
  assert.deepEqual(theme.parseStoredPlusTheme("not json"), theme.DEFAULT_PLUS_THEME);
  const v1 = theme.parseStoredPlusTheme(JSON.stringify({ style: "native", accent: "#ABCDEF", font: "inter", customCss: false }));
  assert.equal(v1.theme, "native");
  assert.equal(v1.uiFont, "Inter");
  assert.equal(v1.accent, "#abcdef");
  // v2's customCss (default true) leaked custom.css into every theme: not migrated.
  assert.equal(v1.customCssOverlay, false);
  assert.equal(theme.parseStoredPlusTheme(JSON.stringify({ theme: "nord", customCss: true })).customCssOverlay, false);
  assert.equal(theme.normalizePlusTheme({ customCssOverlay: true }).customCssOverlay, true);
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
  assert.equal(props["--plus-fill"], "#2563eb", "buttons follow a custom accent");
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
});

test("Built-in themes: every palette sets the whole engine token set", () => {
  for (const t of catalog.BUILTIN_THEMES) {
    for (const [mode, p] of [["light", t.light], ["dark", t.dark]]) {
      if (!p) continue;
      const tokens = catalog.paletteTokens(p, mode === "dark");
      for (const key of catalog.SYNTAX_KEYS) assert.ok(tokens[`--plus-syn-${key}`], `${t.id}.${mode} syntax ${key}`);
      for (const name of ["--plus-fill", "--plus-fill-text", "--plus-marker", "--plus-code-bg", "--plus-code-header", "--plus-inline-code-bg", "--shadow-popover"]) {
        assert.ok(tokens[name], `${t.id}.${mode} ${name}`);
      }
      assert.ok(p.syntax && catalog.SYNTAX_KEYS.every((key) => /^#[0-9a-f]{6}$/i.test(p.syntax[key])), `${t.id}.${mode} has a full hand-picked syntax palette`);
    }
  }
  assert.match(catalog.builtinThemesCss(), /--plus-reading-font:/, "Claude's serif reading font is emitted");
});

test("Theme engine: every --plus-* token it reads has a default", async () => {
  const css = (await import("node:fs")).readFileSync(new URL("../app/plus-theme.css", import.meta.url), "utf8");
  const defaults = /:where\(html\[data-plus-style="clean"\]\) \{([\s\S]*?)\n\}/.exec(css)[1];
  const defined = new Set([...defaults.matchAll(/(--plus-[a-z-]+):/g)].map((m) => m[1]));
  const runtime = new Set(["--plus-font-ui", "--plus-font-chat", "--plus-font-code"]);
  const used = new Set([...css.matchAll(/var\((--plus-[a-z-]+)/g)].map((m) => m[1]));
  for (const name of used) assert.ok(defined.has(name) || runtime.has(name), `${name} has a default`);
});

test("Palette themes: definitions are sanitised, compiled and read back from CSS", () => {
  const def = catalog.builtinDefinition(catalog.findBuiltinTheme("nord"));
  const clean = catalog.sanitizeThemeDefinition(JSON.parse(JSON.stringify(def)));
  assert.deepEqual(clean.light.bg, def.light.bg);
  assert.equal(catalog.sanitizeThemeDefinition({ light: { bg: "red" } }), undefined);
  assert.equal(catalog.sanitizeThemeDefinition({ light: { ...def.light, accent: "url(x)" } }), undefined);
  const compiled = catalog.compileUserThemeCss(def, "/* extra */");
  assert.ok(compiled.startsWith("html[data-plus-theme]:root{"));
  assert.ok(compiled.includes("html.dark[data-plus-theme]:root{"));
  assert.ok(compiled.endsWith("/* extra */"));
  const fromCss = catalog.definitionFromCss("html:root{--bg:#101010;--accent: #FF0000}\nhtml.dark:root{--bg:#000000}");
  assert.equal(fromCss.light.bg, "#101010");
  assert.equal(fromCss.light.accent, "#ff0000");
  assert.equal(fromCss.dark.bg, "#000000");
  assert.ok(catalog.sanitizeThemeDefinition(fromCss), "a CSS-derived definition is storable");
});

test("Imported themes: header round-trip, swatch and ids", () => {
  const file = userThemes.serializeThemeFile("我的主题", "clean", ":root{--bg:#fff;--accent: #ff0000;}");
  const parsed = userThemes.parseThemeFile(file);
  assert.equal(parsed.name, "我的主题");
  assert.equal(parsed.base, "clean");
  assert.equal(parsed.css, ":root{--bg:#fff;--accent: #ff0000;}");
  assert.deepEqual(userThemes.parseThemeFile(":root{}"), { css: ":root{}" });
  const def = catalog.builtinDefinition(catalog.findBuiltinTheme("sage"));
  const withDef = userThemes.parseThemeFile(userThemes.serializeThemeFile("护眼 */ 绿", "clean", "", def));
  assert.equal(withDef.definition.dark.accent, def.dark.accent);
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
  const palette = await userThemes.createUserTheme(dir, { name: "P", base: "native", definition: catalog.builtinDefinition(catalog.findBuiltinTheme("github")) });
  assert.equal(palette.base, "clean", "palette themes always use the engine");
  assert.ok(palette.hasPalette && palette.swatchDark.bg);
  assert.ok(palette.compiled.includes("--plus-syn-keyword:"));
  const removed = await userThemes.updateUserTheme(dir, palette.id, { definition: null, css: ":root{}" });
  assert.equal(removed.hasPalette, false);
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
