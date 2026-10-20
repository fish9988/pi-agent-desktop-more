import { SYNTAX_KEYS, type SyntaxPalette, type ThemeDefinition, type ThemePalette } from "./plus-theme-catalog";

/**
 * Plus: convert a VS Code colour theme (the JSON inside a theme extension,
 * e.g. `themes/xxx-color-theme.json`) into a palette theme definition.
 * VS Code themes describe one mode; the other mode reuses the same palette,
 * flagged so it keeps its look.
 */

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
/** `a` weighted `t` (0..1) over `b`. */
export const mixHex = (a: string, b: string, t: number) => toHex(rgb(a).map((x, i) => x * t + rgb(b)[i] * (1 - t)));

export function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** #rgb / #rrggbb / #rrggbbaa → #rrggbb, blending any alpha over `under`. */
export function normalizeHex(value: unknown, under?: string): string | null {
  if (typeof value !== "string") return null;
  let v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3,4}$/.test(v)) v = `#${v.slice(1).split("").map((c) => c + c).join("")}`;
  if (/^#[0-9a-f]{8}$/.test(v)) {
    const alpha = parseInt(v.slice(7, 9), 16) / 255;
    const base = v.slice(0, 7);
    return under ? mixHex(base, under, alpha) : base;
  }
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/** JSON with comments and trailing commas, as VS Code writes it. */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\") { out += text[++i] ?? ""; continue; }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") { inString = true; out += ch; continue; }
    if (ch === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; continue; }
    if (ch === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

interface TokenColor { scope?: string | string[]; settings?: { foreground?: string } }

const SCOPES: Record<keyof SyntaxPalette, string[]> = {
  comment: ["comment", "punctuation.definition.comment"],
  keyword: ["keyword", "storage.type", "storage.modifier", "keyword.control", "storage"],
  string: ["string", "string.quoted"],
  number: ["constant.numeric", "constant", "constant.language"],
  function: ["entity.name.function", "support.function", "meta.function-call"],
  class: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.name.type.class"],
  property: ["variable.other.property", "support.type.property-name", "meta.object-literal.key", "variable.other.object.property"],
  operator: ["keyword.operator"],
  punctuation: ["punctuation", "meta.brace", "punctuation.separator"],
  tag: ["entity.name.tag"],
  attr: ["entity.other.attribute-name"],
  regex: ["string.regexp"],
  variable: ["variable", "variable.other", "variable.other.readwrite"],
  inserted: ["markup.inserted"],
  deleted: ["markup.deleted"],
};

function scopeColours(tokenColors: TokenColor[], under: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of tokenColors) {
    const colour = normalizeHex(entry.settings?.foreground, under);
    if (!colour || !entry.scope) continue;
    const scopes = Array.isArray(entry.scope) ? entry.scope : entry.scope.split(",");
    for (const scope of scopes.map((s) => s.trim()).filter(Boolean)) {
      // Plain scopes only; "a b" descendant selectors describe special cases.
      if (!scope.includes(" ") && !map.has(scope)) map.set(scope, colour);
    }
  }
  return map;
}

export interface VsCodeThemeResult {
  name?: string;
  definition: ThemeDefinition;
}

export function definitionFromVsCodeTheme(source: string): VsCodeThemeResult {
  const json = parseJsonc(source) as { name?: unknown; type?: unknown; colors?: Record<string, unknown>; tokenColors?: unknown };
  const colors = json.colors ?? {};
  if (!colors || typeof colors !== "object" || !("editor.background" in colors || "editor.foreground" in colors)) {
    throw new Error("Not a VS Code colour theme (no editor colours)");
  }
  const editorBg = normalizeHex(colors["editor.background"]) ?? (json.type === "light" ? "#ffffff" : "#1e1e1e");
  const isDark = json.type === "light" || json.type === "hcLight" ? false : json.type === "dark" || json.type === "hc" ? true : luminance(editorBg) < 0.25;
  const c = (...keys: string[]) => {
    for (const key of keys) {
      const value = normalizeHex(colors[key], editorBg);
      if (value) return value;
    }
    return null;
  };
  const text = c("editor.foreground", "foreground") ?? (isDark ? "#d4d4d4" : "#1f1f1f");
  const panel = c("sideBar.background", "activityBar.background", "panel.background") ?? mixHex(text, editorBg, isDark ? 0.04 : 0.03);
  const surface = c("input.background", "dropdown.background", "editorWidget.background", "quickInput.background") ?? mixHex(text, editorBg, isDark ? 0.07 : 0.05);
  const muted = c("descriptionForeground", "sideBar.foreground", "editorLineNumber.activeForeground") ?? mixHex(text, editorBg, 0.7);
  const accent = c("textLink.foreground", "focusBorder", "button.background", "activityBarBadge.background") ?? (isDark ? "#4fc1ff" : "#005fb8");
  const fill = c("button.background") ?? accent;
  const fillText = c("button.foreground") ?? (contrast(fill, "#ffffff") >= contrast(fill, editorBg) ? "#ffffff" : editorBg);
  const border = c("panel.border", "sideBar.border", "editorGroup.border", "widget.border") ?? mixHex(text, editorBg, 0.15);
  const tokenColors = Array.isArray(json.tokenColors) ? json.tokenColors as TokenColor[] : [];
  const scopes = scopeColours(tokenColors, editorBg);
  const syntax: Partial<SyntaxPalette> = {};
  for (const key of SYNTAX_KEYS) {
    const found = SCOPES[key].map((scope) => scopes.get(scope)).find(Boolean);
    if (found) syntax[key] = found;
  }
  if (!syntax.inserted) syntax.inserted = c("gitDecoration.addedResourceForeground", "editorGutter.addedBackground") ?? undefined;
  if (!syntax.deleted) syntax.deleted = c("gitDecoration.deletedResourceForeground", "editorGutter.deletedBackground") ?? undefined;
  for (const key of SYNTAX_KEYS) if (!syntax[key]) delete syntax[key];
  const inlineCode = c("textPreformat.foreground") ?? syntax.string ?? accent;
  const palette: ThemePalette = {
    bg: panel,
    panel,
    workbench: editorBg,
    surface,
    text,
    muted,
    dim: mixHex(muted, editorBg, 0.8),
    accent,
    accentText: contrast(accent, "#ffffff") >= contrast(accent, editorBg) ? "#ffffff" : editorBg,
    fill,
    fillText,
    border,
    user: surface,
    code: panel === editorBg ? mixHex(text, editorBg, isDark ? 0.04 : 0.03) : panel,
    codeHeader: surface,
    codeText: text,
    inlineCode,
    inlineCodeBg: mixHex(inlineCode, editorBg, isDark ? 0.14 : 0.1),
    marker: accent,
    ...(c("errorForeground", "editorError.foreground") ? { danger: c("errorForeground", "editorError.foreground")! } : {}),
    ...(c("gitDecoration.addedResourceForeground", "terminal.ansiGreen") ? { success: c("gitDecoration.addedResourceForeground", "terminal.ansiGreen")! } : {}),
    ...(c("editorWarning.foreground", "terminal.ansiYellow") ? { warning: c("editorWarning.foreground", "terminal.ansiYellow")! } : {}),
    syntax,
  };
  const definition: ThemeDefinition = isDark
    ? { dark: palette, light: { ...palette, isDark: true } }
    : { light: palette, dark: { ...palette, isDark: false } };
  return { name: typeof json.name === "string" ? json.name : undefined, definition };
}
