// Plus design scale (lib/plus-design-scale.ts ↔ app/plus-theme.css) and the
// redesign's "plus" theme. The ratchets below only go down: when a change
// moves literals onto the scale, lower the baseline in the same commit.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const scale = await jiti.import("./plus-design-scale.ts");
const catalog = await jiti.import("./plus-theme-catalog.ts");
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const plusCss = read("app/plus.css") + "\n" + read("app/plus-theme.css");
const engineCss = read("app/plus-theme.css");

test("Design scale: CSS variables match the TS scale", () => {
  for (const [step, px] of Object.entries(scale.FONT_SIZES)) assert.match(engineCss, new RegExp(`--plus-fs-${step}: ${px}px;`));
  for (const [step, px] of Object.entries(scale.RADII)) assert.match(engineCss, new RegExp(`--plus-r-${step}: ${px}px;`));
  for (const [step, px] of Object.entries(scale.SPACING)) assert.match(engineCss, new RegExp(`--plus-s${step}: ${px}px;`));
  for (const [step, ms] of Object.entries(scale.DURATIONS)) assert.match(engineCss, new RegExp(`--plus-dur-${step}: ${ms}ms;`));
  assert.equal(scale.scaleVar("fs", 2), "var(--plus-fs-2, 13px)");
  assert.equal(scale.scaleVar("r", "card"), "var(--plus-r-card, 8px)");
  assert.equal(scale.scaleVar("s", 4), "var(--plus-s4, 16px)");
});

const offScale = (text, re, allowed) => [...text.matchAll(re)].map((m) => Number(m[1])).filter((px) => !allowed.has(px));

// Baselines measured when the scale was introduced (Plus 1.7 redesign, step 1).
const PLUS_CSS_OFF_SCALE_FONT = 30;
const PLUS_CSS_OFF_SCALE_RADIUS = 21;
const COMPONENT_OFF_SCALE_FONT = 186;

test("Design scale ratchet: Plus CSS adds no off-scale font sizes or radii", () => {
  const fonts = offScale(plusCss, /font-size:\s*([0-9.]+)px/g, scale.SCALE_FONT_PX);
  const radii = offScale(plusCss, /border-radius:\s*([0-9.]+)px/g, new Set([...scale.SCALE_RADIUS_PX, 999, 0]));
  assert.ok(fonts.length <= PLUS_CSS_OFF_SCALE_FONT, `off-scale font-size literals in plus CSS: ${fonts.length} > ${PLUS_CSS_OFF_SCALE_FONT}. Use var(--plus-fs-N).`);
  assert.ok(radii.length <= PLUS_CSS_OFF_SCALE_RADIUS, `off-scale border-radius literals in plus CSS: ${radii.length} > ${PLUS_CSS_OFF_SCALE_RADIUS}. Use var(--plus-r-*).`);
});

function tsxFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

test("Design scale ratchet: components add no off-scale inline font sizes", () => {
  const dir = new URL("components/", root);
  let count = 0;
  for (const file of tsxFiles(dir.pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
    count += offScale(readFileSync(file, "utf8"), /fontSize:\s*([0-9.]+)\b/g, scale.SCALE_FONT_PX).length;
  }
  assert.ok(count <= COMPONENT_OFF_SCALE_FONT, `off-scale inline fontSize values in components: ${count} > ${COMPONENT_OFF_SCALE_FONT}. Use scaleVar("fs", N).`);
  console.log(`# component off-scale inline fontSize: ${count}`);
});

// WCAG relative luminance contrast for #rrggbb.
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test("Plus theme: layered surfaces step apart and text stays readable", () => {
  const plus = catalog.findBuiltinTheme("plus");
  assert.ok(plus, "the redesign theme exists");
  assert.equal(plus.base, "clean");
  assert.equal(plus.typography.readingSize, 16);
  assert.equal(plus.typography.readingLeading, 1.85);
  assert.match(plus.typography.bold, /Noto Serif SC/);
  for (const [mode, p] of [["light", plus.light], ["dark", plus.dark]]) {
    // the user asked for clear steps between areas, especially in light mode
    assert.notEqual(p.bg, p.workbench, `${mode}: window and content panel differ`);
    assert.notEqual(p.workbench, p.surface, `${mode}: content panel and cards differ`);
    assert.notEqual(p.code, p.codeHeader, `${mode}: code body and header differ`);
    assert.ok(contrast(p.text, p.workbench) >= 12, `${mode}: body text contrast`);
    assert.ok(contrast(p.muted, p.workbench) >= 4.5, `${mode}: secondary text contrast`);
    assert.ok(contrast(p.dim, p.workbench) >= 3.5, `${mode}: meta text contrast`);
    assert.ok(contrast(p.inlineCode, p.inlineCodeBg) >= 7, `${mode}: inline code contrast`);
    assert.ok(contrast(p.fillText ?? (mode === "dark" ? p.workbench : "#ffffff"), p.fill) >= 4.5, `${mode}: text on primary buttons`);
  }
  const css = catalog.builtinThemesCss();
  assert.match(css, /html\[data-plus-theme="plus"\]:root\{[^}]*--plus-bold-font:/);
});

test("Plus theme: a theme bold font survives copying into a custom theme", () => {
  const def = catalog.sanitizeThemeDefinition(catalog.builtinDefinition(catalog.findBuiltinTheme("plus")));
  assert.equal(def.typography.bold, catalog.findBuiltinTheme("plus").typography.bold);
  assert.match(def.typography.reading, /霞鹜新致宋＋/);
});

test("Plus theme: the theme bold font yields to a user chat font", () => {
  assert.match(engineCss, /html\[data-plus-style="clean"\]:not\(\[data-plus-chat-font\]\) \.message-assistant \.markdown-body :is\(strong, b, th\) \{\s*font-family: var\(--plus-bold-font, inherit\);/);
});
