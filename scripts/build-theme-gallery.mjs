#!/usr/bin/env node
/**
 * Plus: generate lib/plus-theme-gallery.ts from OpenCode's TUI themes
 * (https://github.com/sst/opencode, MIT), which define every colour for both
 * dark and light. Usage:
 *
 *   node scripts/build-theme-gallery.mjs <opencode>/packages/tui/src/theme/assets
 *
 * The mapping to Plus palettes lives here so the gallery can be regenerated
 * when OpenCode adds themes.
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: build-theme-gallery.mjs <opencode theme assets dir>");
  process.exit(1);
}

const NAMES = {
  aura: "Aura", ayu: "Ayu", carbonfox: "Carbonfox", catppuccin: "Catppuccin",
  "catppuccin-frappe": "Catppuccin Frappé", "catppuccin-macchiato": "Catppuccin Macchiato",
  cobalt2: "Cobalt2", cursor: "Cursor", dracula: "Dracula", everforest: "Everforest", flexoki: "Flexoki",
  github: "GitHub", gruvbox: "Gruvbox", kanagawa: "Kanagawa", material: "Material", matrix: "Matrix",
  mercury: "Mercury", monokai: "Monokai", nightowl: "Night Owl", nord: "Nord", "one-dark": "One Dark",
  opencode: "OpenCode", orng: "Orng", "osaka-jade": "Osaka Jade", palenight: "Palenight", rosepine: "Rosé Pine",
  solarized: "Solarized", synthwave84: "Synthwave '84", tokyonight: "Tokyo Night", vercel: "Vercel",
  vesper: "Vesper", zenburn: "Zenburn",
};

function hex(value) {
  if (typeof value !== "string") return null;
  let v = value.trim().toLowerCase();
  if (!v.startsWith("#")) return null;
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v.slice(1).split("").map((c) => c + c).join("")}`;
  if (/^#[0-9a-f]{8}$/.test(v)) v = v.slice(0, 7);
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
/** `a` weighted `t` (0..1) over `b`. */
const mix = (a, b, t) => toHex(rgb(a).map((x, i) => x * t + rgb(b)[i] * (1 - t)));
function luminance(h) {
  const [r, g, b] = rgb(h).map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const textOn = (fill, dark) => (contrast(fill, "#ffffff") >= contrast(fill, dark) ? "#ffffff" : dark);

function resolver(json, mode) {
  const defs = json.defs ?? {};
  const seen = new Set();
  const resolve = (value) => {
    if (value && typeof value === "object") return resolve(value[mode]);
    if (typeof value !== "string") return null;
    const direct = hex(value);
    if (direct) return direct;
    if (seen.has(value) || !(value in defs)) return null;
    seen.add(value);
    try {
      return resolve(defs[value]);
    } finally {
      seen.delete(value);
    }
  };
  return (key) => resolve(json.theme?.[key]);
}

function palette(json, mode) {
  const get = resolver(json, mode);
  const background = get("background");
  const text = get("text");
  const primary = get("primary");
  if (!background || !text || !primary) return null;
  const isDark = luminance(background) < 0.25;
  const panelRaw = get("backgroundPanel") ?? background;
  const panel = panelRaw === background ? mix(text, background, isDark ? 0.04 : 0.03) : panelRaw;
  const element = get("backgroundElement") ?? mix(text, background, isDark ? 0.07 : 0.05);
  const muted = get("textMuted") ?? mix(text, background, 0.7);
  const markdownCode = get("markdownCode") ?? primary;
  const s = (key, fallback) => get(key) ?? fallback;
  const darkText = isDark ? background : mix(text, "#000000", 0.4);
  return {
    isDark,
    p: {
      bg: panel,
      panel,
      workbench: background,
      surface: element,
      text,
      muted,
      dim: mix(muted, background, 0.8),
      accent: primary,
      accentText: textOn(primary, isDark ? background : "#111111"),
      fill: primary,
      fillText: textOn(primary, isDark ? background : darkText),
      border: get("border") ?? mix(text, background, 0.15),
      user: element,
      code: panel,
      codeHeader: element,
      codeText: get("markdownCodeBlock") ?? text,
      inlineCode: markdownCode,
      inlineCodeBg: mix(markdownCode, background, isDark ? 0.14 : 0.1),
      marker: get("markdownListItem") ?? primary,
      danger: get("error") ?? undefined,
      success: get("success") ?? undefined,
      warning: get("warning") ?? undefined,
      syntax: {
        comment: s("syntaxComment", muted),
        keyword: s("syntaxKeyword", primary),
        string: s("syntaxString", primary),
        number: s("syntaxNumber", primary),
        function: s("syntaxFunction", primary),
        class: s("syntaxType", primary),
        property: s("syntaxVariable", text),
        operator: s("syntaxOperator", muted),
        punctuation: s("syntaxPunctuation", text),
        tag: s("syntaxKeyword", primary),
        attr: s("syntaxType", primary),
        regex: s("syntaxOperator", primary),
        variable: s("syntaxVariable", text),
        inserted: s("diffAdded", get("success") ?? primary),
        deleted: s("diffRemoved", get("error") ?? primary),
      },
    },
  };
}

const themes = [];
for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
  const id = file.slice(0, -5);
  if (!(id in NAMES)) continue;
  const json = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const dark = palette(json, "dark");
  const light = palette(json, "light");
  if (!dark && !light) continue;
  const realDark = dark?.isDark ? dark.p : null;
  const realLight = light && !light.isDark ? light.p : null;
  const def = {};
  // A theme without a real light (or dark) variant uses the one it has in
  // both modes, flagged so the generated tokens keep their dark (light) feel.
  if (realLight) def.light = realLight;
  else if (realDark) def.light = { ...realDark, isDark: true };
  if (realDark) def.dark = realDark;
  else if (realLight) def.dark = { ...realLight, isDark: false };
  for (const p of [def.light, def.dark]) {
    for (const key of Object.keys(p)) if (p[key] === undefined) delete p[key];
  }
  themes.push({ id: `opencode-${id}`, name: NAMES[id], source: "OpenCode", modes: realLight && realDark ? "both" : realDark ? "dark" : "light", definition: def });
}

const out = `/* eslint-disable */
// Generated by scripts/build-theme-gallery.mjs from OpenCode's themes
// (https://github.com/sst/opencode, MIT License, Copyright (c) 2025 opencode).
// Do not edit by hand; re-run the script instead.
import type { ThemeDefinition } from "./plus-theme-catalog";

export interface GalleryTheme {
  id: string;
  name: string;
  source: string;
  /** Which modes the original theme designs; the other mode reuses it. */
  modes: "both" | "dark" | "light";
  definition: ThemeDefinition;
}

export const OPENCODE_GALLERY: readonly GalleryTheme[] = ${JSON.stringify(themes, null, 1)};
`;
fs.writeFileSync(new URL("../lib/plus-theme-gallery-opencode.ts", import.meta.url), out);
console.log(`${themes.length} themes: ${themes.map((t) => `${t.name}(${t.modes})`).join(", ")}`);
