// Plus 1.9: Plus is the base, themes stack on it (colours and fonts only).
// Rules in docs/agents/plus.md §6; the ratchets below only go down.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const catalog = await jiti.import("./plus-theme-catalog.ts");
const gallery = await jiti.import("./plus-theme-gallery-opencode.ts");
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

/** Drops `var(--x, fallback)` fallbacks (a theme still controls the value), comments and selector strings. */
export function stripAllowed(css) {
  let out = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\[style\*="[^"]*"\]/g, "").replace(/^.*mask-image.*$/gm, "");
  let index;
  while ((index = out.indexOf("var(--")) !== -1) {
    let depth = 0;
    let end = index + 3;
    for (; end < out.length; end++) {
      if (out[end] === "(") depth++;
      else if (out[end] === ")" && --depth === 0) break;
    }
    out = `${out.slice(0, index)}VAR${out.slice(end + 1)}`;
  }
  return out;
}
const literalColours = (text) => (text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).length;

// Baselines when the rules were written (Plus 1.9): base CSS still holds shadow,
// file-badge and white-on-fill literals; components hold the rest.
const PLUS_CSS_LITERAL_COLOURS = 14;
const PLUS_CSS_LITERAL_FONTS = 46;
const COMPONENT_INLINE_LITERAL_COLOURS = 16;

test("Theme rules: base CSS takes colours and fonts from variables (ratchet)", () => {
  const css = stripAllowed(read("app/plus.css") + "\n" + read("app/plus-theme.css"));
  const colours = literalColours(css);
  const fonts = (css.match(/font-family:\s*(?!VAR|inherit)/g) ?? []).length;
  assert.ok(colours <= PLUS_CSS_LITERAL_COLOURS, `literal colours in plus CSS: ${colours} > ${PLUS_CSS_LITERAL_COLOURS}. Use a theme variable.`);
  assert.ok(fonts <= PLUS_CSS_LITERAL_FONTS, `literal font-family in plus CSS: ${fonts} > ${PLUS_CSS_LITERAL_FONTS}. Use a font variable.`);
  console.log(`# plus CSS literal colours ${colours}, fonts ${fonts}`);
});

function tsxFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? tsxFiles(p) : name.endsWith(".tsx") && !name.includes(".test.") ? [p] : [];
  });
}

test("Theme rules: components add no inline literal colours (ratchet)", () => {
  let count = 0;
  for (const file of tsxFiles(new URL("components/", root).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
    const text = stripAllowed(readFileSync(file, "utf8"));
    count += (text.match(/(?:color|background|backgroundColor|borderColor|border|fill|stroke)\s*:\s*["`][^"`]*(?:#[0-9a-fA-F]{3,8}|rgba?\()/g) ?? []).length;
  }
  assert.ok(count <= COMPONENT_INLINE_LITERAL_COLOURS, `inline literal colours in components: ${count} > ${COMPONENT_INLINE_LITERAL_COLOURS}. Use var(--danger) and friends.`);
  console.log(`# component inline literal colours ${count}`);
});

test("Theme rules: no layout keyed to a theme, themes set no radius", () => {
  for (const file of ["app/globals.css", "app/settings.css", "app/native-theme.css", "app/plus.css", "app/plus-theme.css"]) {
    assert.doesNotMatch(read(file), /data-plus-theme=/, `${file} must not key rules to a theme name`);
  }
  for (const theme of catalog.BUILTIN_THEMES) {
    if (theme.id !== catalog.DEFAULT_THEME_ID) assert.equal(theme.radius, undefined, `${theme.id} sets a radius; corners are the base's`);
  }
  // Even a stored radius does not reach the page: the base's wins.
  const css = catalog.compileThemeCss({ ...catalog.findBuiltinTheme("github"), radius: 3 }, "L", "D");
  assert.match(css, /--plus-radius:8px/);
});

test("Theme stacking: a theme only says what differs; the rest is the base", () => {
  const base = catalog.BASE_THEME;
  const merged = catalog.mergePalette(base.light, { accent: "#ff0000" });
  assert.equal(merged.bg, base.light.bg);
  assert.equal(merged.text, base.light.text);
  assert.equal(merged.accent, "#ff0000");
  // The fill follows the theme's own accent, not the base's blue.
  assert.equal(merged.fill, undefined);
  assert.equal(merged.syntax, undefined);
  // A theme without fonts reads in the base's; one with fonts keeps them.
  assert.equal(catalog.resolveThemeDefinition({ light: base.light }).typography.reading, base.typography.reading);
  const claude = catalog.resolveThemeDefinition(catalog.findBuiltinTheme("claude"));
  assert.notEqual(claude.typography.reading, base.typography.reading);
  assert.equal(claude.typography.bold, base.typography.bold);
  // The base renders first, on the clean style only; native gets nothing stacked.
  const all = catalog.builtinThemesCss();
  assert.ok(all.startsWith(catalog.BASE_LIGHT_SELECTOR));
  assert.doesNotMatch(all, /data-plus-theme="native"/);
  // The base itself is already layered: layering leaves it as it is.
  assert.equal(catalog.layeredPalette(base.light), base.light);
  assert.equal(catalog.layeredPalette(base.dark), base.dark);
});

test("Theme stacking: every theme keeps the base's layer order and readable text", () => {
  const defs = [
    ...catalog.BUILTIN_THEMES.filter((theme) => theme.base === "clean").map((theme) => [theme.id, theme]),
    ...gallery.OPENCODE_GALLERY.map((theme) => [theme.id, theme.definition]),
  ];
  assert.ok(defs.length >= 35);
  for (const [id, raw] of defs) {
    const def = catalog.resolveThemeDefinition(raw);
    for (const mode of ["light", "dark"]) {
      const p = def[mode];
      const original = raw[mode];
      if (!p || !original) continue;
      const where = `${id} ${mode}`;
      assert.ok(catalog.contrastRatio(p.bg, p.workbench) >= catalog.LAYER_MIN_CANVAS_STEP - 0.005, `${where}: canvas → panel`);
      assert.ok(catalog.contrastRatio(p.workbench, p.surface) >= catalog.LAYER_MIN_CARD_STEP - 0.005, `${where}: panel → card`);
      // Layering may swap which layer gets which of the theme's colours, but the
      // weakest text contrast stays near the theme's own (or 4.5): a light canvas pushed one notch darker costs a little, never below 3.
      const layers = ["bg", "workbench", "surface"];
      const before = Math.min(4.5, ...layers.map((layer) => catalog.contrastRatio(original.text, original[layer])));
      const after = Math.min(...layers.map((layer) => catalog.contrastRatio(p.text, p[layer])));
      assert.ok(after >= before - 0.3 && after >= Math.min(3, before), `${where}: weakest text contrast ${after.toFixed(2)} vs ${before.toFixed(2)}`);
    }
  }
});
