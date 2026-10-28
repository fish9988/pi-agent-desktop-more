import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const optimizerSettings = await jiti.import("./prompt-optimizer-settings.ts");
const prefs = await jiti.import("./plus-prefs.ts");
const timing = await jiti.import("./session-timing.ts");
const themeImport = await jiti.import("./plus-theme-import.ts");
const gallery = await jiti.import("./plus-theme-gallery-opencode.ts");
const timeline = await jiti.import("./work-timeline.ts");
const streaming = await jiti.import("./streaming-message.ts");

test("Work timeline: commands lose their set-up, paths go relative", () => {
  assert.equal(timeline.stripCommandNoise('cd C:\\pi-project\\app; npx tsc --noEmit'), "npx tsc --noEmit");
  assert.equal(timeline.stripCommandNoise('$env:Path += ";C:\\Program Files\\GitHub CLI"; cd C:\\x; gh run list'), "gh run list");
  assert.equal(timeline.stripCommandNoise('cd /d "D:\\a b" && npm test'), "npm test");
  assert.equal(timeline.stripCommandNoise("cd C:\\only"), "cd C:\\only", "a lone cd stays");
  assert.equal(timeline.displayPath("C:\\pi-project\\app\\lib\\a.ts", "C:/pi-project/app"), "lib/a.ts");
  assert.equal(timeline.displayPath("c:/PI-project/app/b.ts", "C:\\pi-project\\app"), "b.ts");
  assert.equal(timeline.displayPath("/etc/hosts", "/home/me"), "/etc/hosts");
});

test("Work timeline: lines, status and folded exploration", () => {
  const t0 = 1_000_000;
  const msg = (content, offset) => ({ role: "assistant", content, timestamp: t0 + offset * 1000 });
  const steps = [
    msg([{ type: "thinking", thinking: "look around" }, { type: "toolCall", toolCallId: "a", toolName: "grep", input: { pattern: "X" } }], 1),
    msg([{ type: "toolCall", toolCallId: "b", toolName: "read", input: { path: "/w/src/a.ts" } }], 2),
    msg([{ type: "thinking", thinking: "hmm" }, { type: "toolCall", toolCallId: "c", toolName: "read", input: { path: "/w/src/b.ts" } }], 3),
    msg([{ type: "text", text: "Fixing it." }, { type: "toolCall", toolCallId: "d", toolName: "edit", input: { path: "/w/src/a.ts", edits: [{ oldText: "x\ny", newText: "x\nz\nw" }] } }], 4),
    msg([{ type: "toolCall", toolCallId: "e", toolName: "bash", input: { command: "cd /w; npm test" } }], 6),
    msg([{ type: "toolCall", toolCallId: "f", toolName: "bash", input: { command: "npm run lint" } }], 9),
  ];
  const results = new Map([
    ["a", { role: "toolResult", toolCallId: "a", content: [], isError: false, timestamp: t0 + 2000 }],
    ["b", { role: "toolResult", toolCallId: "b", content: [], isError: false, timestamp: t0 + 3000 }],
    ["c", { role: "toolResult", toolCallId: "c", content: [], isError: false, timestamp: t0 + 4000 }],
    ["d", { role: "toolResult", toolCallId: "d", content: [], isError: false, timestamp: t0 + 5000 }],
    ["e", { role: "toolResult", toolCallId: "e", content: [], isError: true, timestamp: t0 + 8000 }],
  ]);
  const inputs = steps.map((message, i) => ({ type: "step", step: { key: `s${i}`, entryId: `e${i}`, message } }));
  const finished = timeline.buildTimeline(inputs, results, { live: false, cwd: "/w" });
  assert.deepEqual(finished.map((e) => e.type), ["thinking", "group", "text", "tool", "tool", "tool"]);
  const group = finished[1];
  assert.equal(group.reads, 2);
  assert.equal(group.searches, 1);
  assert.deepEqual(group.children.map((c) => c.type), ["tool", "tool", "thinking", "tool"]);
  const [edit, failed, missing] = finished.slice(3);
  assert.equal(edit.verb, "edit");
  assert.equal(edit.detail, "src/a.ts");
  assert.deepEqual(edit.stats, { added: 2, removed: 1 });
  assert.equal(failed.status, "error");
  assert.equal(failed.detail, "npm test");
  assert.equal(failed.durationSec, 2);
  assert.equal(missing.status, "aborted");
  const live = timeline.buildTimeline(inputs, results, { live: true, cwd: "/w" });
  assert.equal(live.at(-1).status, "running");
  assert.ok(finished.find((e) => e.type === "text").first === true, "a step's first line carries its entry id");
});

test("Streaming store: listeners run per change and only on change", () => {
  const store = streaming.createStreamingStore();
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  store.dispatch({ type: "start" });
  assert.equal(store.getState().isStreaming, true);
  store.dispatch({ type: "end" });
  store.dispatch({ type: "end" });
  assert.equal(calls, 2);
  off();
  store.dispatch({ type: "start" });
  assert.equal(calls, 2);
});

test("Bold & heading font stacks after the chat font", () => {
  assert.equal(theme.chatBoldStack("", "LXGW Neo ZhiSong Plus"), null);
  assert.match(theme.chatBoldStack("Noto Serif SC", "LXGW Neo ZhiSong Plus"), /^"Noto Serif SC", "LXGW Neo ZhiSong Plus", /);
  assert.equal(theme.normalizePlusTheme({ chatBoldFont: "Noto Serif SC" }).chatBoldFont, "Noto Serif SC");
  const script = theme.plusThemeInitScript({ clean: "clean" });
  assert.match(script, /chatBold/);
  assert.doesNotThrow(() => new Function(script));
});

test("Mirrored prefs: only preference keys are kept, null removes, the seed script parses", () => {
  assert.ok(prefs.isSyncedPrefKey("pi-plus-theme"));
  assert.ok(prefs.isSyncedPrefKey("pi-theme"));
  assert.ok(prefs.isSyncedPrefKey("pi-chat-content-width-unit"));
  assert.ok(prefs.isSyncedPrefKey("pi-web:pinned-chats"));
  assert.equal(prefs.isSyncedPrefKey("pi-chat-drafts-v1"), false);
  assert.equal(prefs.isSyncedPrefKey("pi-web:auth-throttle"), false);
  const merged = prefs.mergePlusPrefs({ "pi-theme": "dark", "pi-locale": "zh-CN" }, { "pi-theme": "light", "pi-locale": null, "evil": "x", "pi-plus-theme": 3 });
  assert.deepEqual(merged, { "pi-theme": "light" });
  assert.doesNotThrow(() => new Function(prefs.PLUS_PREFS_SEED_SCRIPT));
  assert.match(prefs.PLUS_PREFS_SEED_SCRIPT, /\/api\/plus-prefs/);
});

test("Active time keeps growing with messages newer than the snapshot", () => {
  const loaded = [{ role: "user", timestamp: 1000 }, { role: "assistant", timestamp: 5000 }];
  const current = [...loaded, { role: "toolResult", timestamp: 9000 }, { role: "assistant", timestamp: 12000 }, { role: "user", timestamp: 100000 }, { role: "assistant", timestamp: 103000 }];
  assert.equal(timing.liveSessionActiveMs(4000, loaded, loaded), 4000);
  assert.equal(timing.liveSessionActiveMs(4000, loaded, current), 4000 + 4000 + 3000 + 3000);
  assert.equal(timing.liveSessionActiveMs(undefined, loaded, current), undefined);
});

test("Prompt optimiser settings: normalised, style and extra rules reach the prompt", () => {
  const s = optimizerSettings.normalizeOptimizerSettings({ model: { provider: "p", modelId: "m" }, thinkingLevel: "bogus", style: "structured", useContext: false, instructions: "用中文" });
  assert.deepEqual(s.model, { provider: "p", modelId: "m" });
  assert.equal(s.thinkingLevel, null);
  assert.equal(s.useContext, false);
  const prompt = optimizer.buildOptimizeSystemPrompt(s);
  assert.match(prompt, /labelled parts/);
  assert.match(prompt, /用中文/);
  assert.equal(optimizerSettings.normalizeOptimizerSettings({ model: null }, s).model, null);
});

test("Theme gallery and VS Code import produce storable definitions", () => {
  assert.ok(gallery.OPENCODE_GALLERY.length >= 25);
  for (const theme of gallery.OPENCODE_GALLERY) {
    const clean = catalog.sanitizeThemeDefinition(theme.definition);
    assert.ok(clean?.light && clean?.dark, theme.id);
  }
  const vscode = themeImport.definitionFromVsCodeTheme(`{
    // comment
    "name": "Test Dark", "type": "dark",
    "colors": { "editor.background": "#1e1e2e", "editor.foreground": "#cdd6f4", "button.background": "#89b4fa80", },
    "tokenColors": [ { "scope": ["comment"], "settings": { "foreground": "#6c7086" } }, { "scope": "keyword, storage.type", "settings": { "foreground": "#cba6f7" } } ]
  }`);
  assert.equal(vscode.name, "Test Dark");
  assert.equal(vscode.definition.dark.workbench, "#1e1e2e");
  assert.equal(vscode.definition.dark.syntax.keyword, "#cba6f7");
  assert.equal(vscode.definition.light.isDark, true);
  assert.match(vscode.definition.dark.fill, /^#[0-9a-f]{6}$/);
  assert.ok(catalog.sanitizeThemeDefinition(vscode.definition));
  assert.throws(() => themeImport.definitionFromVsCodeTheme("{}"), /VS Code/);
});

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
  const v1 = theme.parseStoredPlusTheme(JSON.stringify({ style: "clean", accent: "#ABCDEF", font: "inter", customCss: false }));
  assert.equal(v1.theme, "clean");
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
  // Plus 1.7: unknown themes fall back to the default theme ("plus" since the redesign).
  assert.equal(theme.normalizePlusTheme({ theme: "nope" }).theme, catalog.DEFAULT_THEME_ID);
  assert.equal(theme.normalizePlusTheme({ theme: "user:../x" }).theme, catalog.DEFAULT_THEME_ID);
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

test("Built-in themes: 5 curated themes on the single Plus layered base", () => {
  const ids = catalog.BUILTIN_THEMES.map((t) => t.id);
  assert.deepEqual(ids, ["plus", "clean", "claude", "github", "nord"]);
  for (const t of catalog.BUILTIN_THEMES) {
    assert.equal(t.base, "clean", `${t.id} uses the Plus layered base`);
  }
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
  // Plus 1.7: token names may end in a digit (the design scale: --plus-fs-1, --plus-s2).
  const defined = new Set([...defaults.matchAll(/(--plus-[a-z0-9-]+):/g)].map((m) => m[1]));
  const runtime = new Set(["--plus-font-ui", "--plus-font-chat", "--plus-font-code"]);
  const used = new Set([...css.matchAll(/var\((--plus-[a-z0-9-]+)/g)].map((m) => m[1]));
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
  const def = catalog.builtinDefinition(catalog.findBuiltinTheme("nord"));
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

const pluginCatalog = await jiti.import("./plugin-catalog.ts");
const settingsSearch = await jiti.import("./plus-settings-search.ts");

test("Plugin catalog: npm search rows normalize, bots give way to the maintainer, bad names drop", () => {
  const json = {
    objects: [
      { downloads: { weekly: 10 }, updated: "2026-10-01", package: { name: "pi-small", version: "1.0.0", description: " small ", publisher: { username: "GitHub Actions" }, maintainers: [{ username: "alice" }], links: { npm: "https://www.npmjs.com/package/pi-small", repository: "git+https://github.com/a/pi-small.git" } } },
      { downloads: { weekly: 500 }, package: { name: "@scope/pi-big", version: "2.0.0", publisher: { username: "bob" }, links: {} } },
      { package: { name: "../evil", version: "1" } },
      { package: null },
    ],
  };
  const rows = pluginCatalog.parseNpmSearch(json);
  assert.deepEqual(rows.map((row) => row.name), ["@scope/pi-big", "pi-small"]);
  assert.equal(rows[1].publisher, "alice");
  assert.equal(rows[1].description, "small");
  assert.equal(rows[1].repoUrl, "https://github.com/a/pi-small");
  assert.equal(rows[0].npmUrl, "https://www.npmjs.com/package/@scope/pi-big");
  // A search keeps npm's relevance order.
  assert.deepEqual(pluginCatalog.parseNpmSearch(json, false).map((row) => row.name), ["pi-small", "@scope/pi-big"]);
  assert.deepEqual(pluginCatalog.parseNpmSearch({}), []);
  const url = new URL(pluginCatalog.catalogSearchUrl("  web  ".padEnd(300, "x")));
  assert.equal(url.origin, "https://registry.npmjs.org");
  assert.ok(url.searchParams.get("text").startsWith("keywords:pi-package web"));
  assert.ok(url.searchParams.get("text").length <= "keywords:pi-package ".length + pluginCatalog.CATALOG_MAX_QUERY);
  assert.equal(pluginCatalog.formatCount(595244), "595.2K");
  assert.equal(pluginCatalog.formatCount(1_816_192), "1.8M");
  assert.equal(pluginCatalog.formatCount(42), "42");
});

test("Plugin cards: readable names, source kinds and avatar letters", () => {
  assert.equal(pluginCatalog.pluginDisplayName("git:https://github.com/nicobailon/pi-web-access"), "pi-web-access");
  assert.equal(pluginCatalog.pluginDisplayName("npm:pi-fold@4.2.8"), "pi-fold");
  assert.equal(pluginCatalog.pluginDisplayName("npm:@scope/pkg"), "@scope/pkg");
  assert.equal(pluginCatalog.pluginDisplayName("..\\..\\pi-project\\Pi desktop插件\\pi-wxpusher-notify\\"), "pi-wxpusher-notify");
  assert.equal(pluginCatalog.pluginDisplayName("anything", "real-name"), "real-name");
  assert.equal(pluginCatalog.pluginSourceKind("npm:x"), "npm");
  assert.equal(pluginCatalog.pluginSourceKind("git:https://github.com/a/b"), "git");
  assert.equal(pluginCatalog.pluginSourceKind("https://github.com/a/b"), "git");
  assert.equal(pluginCatalog.pluginSourceKind("C:\\plugins\\x"), "local");
  assert.equal(pluginCatalog.pluginInitial("@dietrichgebert/ponytail"), "P");
  assert.equal(pluginCatalog.pluginInitial("pi-web-access"), "W");
  assert.equal(pluginCatalog.pluginHue("pi-fold"), pluginCatalog.pluginHue("pi-fold"));
});

test("Settings search: label, description or keywords, every word must match", () => {
  const sections = [
    { id: "general", label: "常规" },
    { id: "appearance", label: "外观", description: "主题、字体" },
    { id: "models", label: "模型" },
    { id: "plugins", label: "插件" },
  ];
  const ids = (query) => settingsSearch.matchSettingsSections(sections, query).map((section) => section.id);
  assert.deepEqual(ids(""), ["general", "appearance", "models", "plugins"]);
  assert.deepEqual(ids("字体"), ["appearance"]);
  assert.deepEqual(ids("API KEY"), ["models"]);
  assert.deepEqual(ids("powershell"), ["general"]);
  assert.deepEqual(ids("npm git"), ["plugins"]);
  assert.deepEqual(ids("nothing-here"), []);
  const grouped = settingsSearch.SETTINGS_NAV_GROUPS.flatMap((group) => group.sections);
  assert.deepEqual([...grouped].sort(), ["agents", "appearance", "general", "mcp", "models", "plugins", "skills"]);
});

test("Kami paper default theme, DSH topbar subagent switcher, Custom CSS Studio & Image Lightbox", () => {
  const plus = catalog.findBuiltinTheme("plus");
  assert.ok(plus, "plus default theme exists");
  assert.equal(plus.light.workbench, "#efe7d2");
  assert.equal(plus.light.surface, "#f7f1de");
  assert.equal(plus.light.inlineCode, "#692314");

  const appShellSource = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  const sidebarSource = readFileSync(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8");
  const fileViewerSource = readFileSync(new URL("../components/FileViewer.tsx", import.meta.url), "utf8");
  const appearanceSource = readFileSync(new URL("../components/PlusAppearanceSettings.tsx", import.meta.url), "utf8");
  const settingsPanelSource = readFileSync(new URL("../components/SettingsPanel.tsx", import.meta.url), "utf8");
  const chatInputSource = readFileSync(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
  const customCssDoc = readFileSync(new URL("../docs/CUSTOM-CSS.md", import.meta.url), "utf8");

  assert.match(appShellSource, /app-topbar-subagents/);
  assert.match(appShellSource, /app-topbar-parent-button/);
  assert.match(appShellSource, /<UserProfileControl \/>/);
  assert.doesNotMatch(sidebarSource, /session-subagent-group/);
  assert.match(fileViewerSource, /plus-image-lightbox/);
  assert.match(appearanceSource, /CSS_STUDIO_PRESETS/);
  assert.match(settingsPanelSource, /<PasteAttachmentSettingRow \/>/);
  assert.match(chatInputSource, /shouldConvertPasteToAttachment/);
  assert.match(chatInputSource, /createPastedTextAttachment/);
  assert.match(chatInputSource, /composer-expand-corner-btn/);
  assert.match(customCssDoc, /--plus-inline-code/);
  assert.match(customCssDoc, /--plus-glass-blur/);
});