import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const work = await jiti.import("./work-details.ts");

const catalog = await jiti.import("./plus-theme-catalog.ts");
const fileOps = await jiti.import("./file-ops.ts");
const systemFonts = await jiti.import("./system-fonts.ts");
const optimizer = await jiti.import("./prompt-optimizer.ts");
const optimizerSettings = await jiti.import("./prompt-optimizer-settings.ts");
const prefs = await jiti.import("./plus-prefs.ts");
const timing = await jiti.import("./session-timing.ts");
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
  // Curated plugins are enriched and prioritized when browsing, and noisy internal packages are filtered out.
  const curatedRows = pluginCatalog.parseNpmSearch({
    objects: [
      { downloads: { weekly: 9999 }, package: { name: "@agimon-ai/po-core", version: "1.0.0" } },
      { downloads: { weekly: 500 }, package: { name: "pi-other", version: "1.0.0" } },
      { downloads: { weekly: 50 }, package: { name: "pi-web-access", version: "1.0.0", description: "Web access" } },
    ],
  });
  assert.deepEqual(curatedRows.map((row) => row.name), ["pi-web-access", "pi-other"]);
  assert.equal(curatedRows[0].curated, true);
  assert.equal(curatedRows[0].category, "搜索与记忆");
  assert.ok(curatedRows[0].zhDescription.includes("联网搜索"));
  assert.equal(Object.keys(pluginCatalog.CURATED_PLUGINS).length, 18);
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
  const appearanceSource = readFileSync(new URL("../components/AppearanceSettingsPage.tsx", import.meta.url), "utf8");
  const settingsPanelSource = readFileSync(new URL("../components/SettingsPanel.tsx", import.meta.url), "utf8");
  const chatInputSource = readFileSync(new URL("../components/ChatInput.tsx", import.meta.url), "utf8");
  const customCssDoc = readFileSync(new URL("../docs/CUSTOM-CSS.md", import.meta.url), "utf8");

  assert.match(appShellSource, /app-topbar-subagents/);
  assert.match(appShellSource, /app-topbar-parent-button/);
  assert.match(appShellSource, /<UserProfileControl \/>/);
  assert.doesNotMatch(sidebarSource, /session-subagent-group/);
  assert.match(fileViewerSource, /plus-image-lightbox/);
  assert.doesNotMatch(appearanceSource, /PlusAppearanceSettings/);
  assert.doesNotMatch(appearanceSource, /PLUS_ACCENT_PRESETS/);
  assert.doesNotMatch(appearanceSource, /custom-css/);
  assert.match(appearanceSource, /THEME_OPTIONS/);
  assert.match(settingsPanelSource, /<PasteAttachmentSettingRow \/>/);
  assert.match(chatInputSource, /shouldConvertPasteToAttachment/);
  assert.match(chatInputSource, /createPastedTextAttachment/);
  assert.match(chatInputSource, /composer-expand-corner-btn/);
  assert.match(customCssDoc, /--plus-inline-code/);
  assert.match(customCssDoc, /--plus-glass-blur/);
});

test("Claude Code Desktop overhaul: Pi pet sprite sheets, split-sector pie, Pi brand lockup & serif prose", async () => {
  const pet = await jiti.import("./pi-pet-sheets.ts");
  assert.equal(pet.PI_PET_FRAME_MS, 80);
  assert.equal(Object.keys(pet.PI_PET_SHEETS).length, 19);
  for (const [key, sheet] of Object.entries(pet.PI_PET_SHEETS)) {
    assert.ok(sheet.frames > 0, `${key} frames`);
    assert.equal(sheet.box.length, 4, `${key} box`);
    assert.ok(pet.PI_PET_SHEET_URLS[key]?.body.startsWith("data:image/png;base64,"), `${key} body sheet`);
    assert.ok(pet.PI_PET_SHEET_URLS[key]?.ink.startsWith("data:image/png;base64,"), `${key} ink sheet`);
  }
  const clean = catalog.findBuiltinTheme("clean");
  assert.equal(clean.light.workbench, "#ffffff");
  assert.equal(clean.light.accent, "#d97757");
  assert.equal(clean.light.inlineCode, "#943333");
  // Claude Code Desktop reads in a serif; the appearance page no longer offers fonts.
  assert.match(clean.typography.reading, /^"Pi Serif"/);
  assert.equal(clean.typography.readingSize, 16);

  const sidebarSource = readFileSync(new URL("../components/SessionSidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebarSource, /<span className="sidebar-brand-wordmark">Pi<\/span>/);
  assert.doesNotMatch(sidebarSource, /sidebar-brand-wordmark" height="18"/);
  const cssSource = readFileSync(new URL("../app/plus-theme.css", import.meta.url), "utf8");
  assert.match(cssSource, /@font-face[^}]*Pi Sans/);
  assert.match(cssSource, /--font-mono: "Pi Mono"/);
  assert.doesNotMatch(cssSource, /data-dsh-claude-style/);
});

test("Dual-Plugin Engine (Pi Native + DSH Full-Stack GUI Plugins): host discovery, extension bridge & React slot wiring", async () => {
  const dshHost = await jiti.import("./dsh-plugin-host.ts");
  assert.equal(typeof dshHost.listDshPlugins, "function");
  assert.equal(typeof dshHost.createDshPluginsExtension, "function");
  assert.equal(typeof dshHost.dispatchDshPluginRoute, "function");
  const ext = dshHost.createDshPluginsExtension();
  assert.equal(ext.name, "builtin:dsh-plugins");

  const pluginsConfigSource = readFileSync(new URL("../components/PluginsConfig.tsx", import.meta.url), "utf8");
  const messageViewSource = readFileSync(new URL("../components/MessageView.tsx", import.meta.url), "utf8");
  const rpcManagerSource = readFileSync(new URL("../lib/rpc-manager.ts", import.meta.url), "utf8");

  assert.match(pluginsConfigSource, /DshPluginSlot/);
  assert.match(pluginsConfigSource, /plugins\.item/);
  assert.match(messageViewSource, /tool\.call\.toolview/);
  assert.match(rpcManagerSource, /createDshPluginsExtension/);
});