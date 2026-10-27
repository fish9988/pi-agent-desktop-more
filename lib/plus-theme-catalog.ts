/**
 * Plus themes.
 *
 * A theme is a compact definition (a palette for light and for dark, plus
 * optional typography and corner radius). `themeTokens` expands it into the
 * full token set that app/plus-theme.css reads, so every theme styles the
 * same elements: chrome, messages, markdown (headings, lists, quotes,
 * tables), code blocks and syntax colours, thinking blocks, tool cards,
 * composer, buttons, switches, sliders, menus and dialogs.
 *
 * Built-in themes are server-rendered into <head> (no flash on start).
 * Custom themes made with the palette editor use the same definition, stored
 * in the theme file's header (lib/plus-user-themes.ts).
 */

export type ThemeBase = "clean" | "native";

export const SYNTAX_KEYS = [
  "comment", "keyword", "string", "number", "function", "class", "property",
  "operator", "punctuation", "tag", "attr", "regex", "variable", "inserted", "deleted",
] as const;
export type SyntaxKey = (typeof SYNTAX_KEYS)[number];
export type SyntaxPalette = Record<SyntaxKey, string>;

export interface ThemePalette {
  /**
   * Dark-looking palette regardless of the mode it is used for (a dark-only
   * theme shown while the app is in light mode, or the reverse).
   */
  isDark?: boolean;
  /** Window canvas behind the sidebar. */
  bg: string;
  /** Sidebar / chrome. */
  panel: string;
  /** Chat and file reading surface. */
  workbench: string;
  /** Cards, composer, popovers. */
  surface: string;
  text: string;
  muted: string;
  dim: string;
  /** Links, focus, selection, small highlights. */
  accent: string;
  /** Text on an accent fill; defaults to white (light) / the canvas (dark). */
  accentText?: string;
  /** Primary buttons, send button, switches; defaults to the accent. */
  fill?: string;
  /** Text on the fill; white by default when a fill is set. */
  fillText?: string;
  border: string;
  /** User message bubble. */
  user: string;
  /** Code block background. */
  code: string;
  /** Code block header strip and table header; derived when absent. */
  codeHeader?: string;
  /** Plain code text; defaults to the text colour. */
  codeText?: string;
  /** Inline `code` text colour. */
  inlineCode: string;
  inlineCodeBg?: string;
  /** List markers, quote bar, thinking stripe; derived from the accent. */
  marker?: string;
  danger?: string;
  success?: string;
  warning?: string;
  syntax?: Partial<SyntaxPalette>;
}

export interface ThemeTypography {
  /** Assistant reply font family list (CSS syntax). */
  reading?: string;
  /** Markdown headings font family list. */
  heading?: string;
  /**
   * Bold text and table heads in replies, for reading fonts whose bold is
   * weak or synthesized. Only applies while the user has not picked a chat font.
   */
  bold?: string;
  /** Assistant reply size in px before the chat size offset (default 14). */
  readingSize?: number;
  readingLeading?: number;
  /** Italic thinking text (Claude-style). */
  thinkingItalic?: boolean;
}

export interface ThemeDefinition {
  light?: ThemePalette;
  dark?: ThemePalette;
  typography?: ThemeTypography;
  /** Ignored since Plus 1.9 (corners are the base's); kept so older theme files still parse. */
  radius?: number;
}

export interface BuiltinTheme extends ThemeDefinition {
  id: string;
  /** Kept for existing selections but not offered in the theme grid (see the gallery). */
  hidden?: boolean;
  name: { en: string; zh: string; tw?: string };
  base: ThemeBase;
  description?: { en: string; zh: string };
}

/** The redesign's reading pair: LXGW Neo ZhiSong for text, Noto Serif SC for bold and headings. */
const PLUS_READING = "\"霞鹜新致宋＋\", \"LXGW Neo ZhiSong Plus\", \"LXGW Neo ZhiSong\", \"Noto Serif SC\", \"Source Han Serif SC\", Georgia, serif";
const PLUS_BOLD = "\"Noto Serif SC\", \"Source Han Serif SC\", \"Source Han Serif\", Georgia, serif";

const SERIF_READING = "\"Anthropic Serif\", \"Copernicus\", \"Tiempos Text\", Georgia, \"Noto Serif SC\", \"Source Han Serif SC\", \"Source Han Serif\", \"Songti SC\", \"STSong\", \"SimSun\", serif";

const s = (
  comment: string, keyword: string, string: string, number: string, fn: string, cls: string, property: string,
  operator: string, punctuation: string, tag: string, attr: string, regex: string, variable: string,
  inserted: string, deleted: string,
): SyntaxPalette => ({
  comment, keyword, string, number, function: fn, class: cls, property, operator, punctuation, tag, attr, regex, variable, inserted, deleted,
});

export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  {
    // Plus 1.10 default: Kami warm handmade cotton paper, vermilion & olive ink,
    // layered surfaces with clear steps in both modes, serif reading at 16px / 1.85.
    id: "plus",
    name: { en: "Kami Paper", zh: "纸枢 · Kami", tw: "紙樞 · Kami" },
    description: { en: "Handmade warm cotton paper, vermilion & olive ink, editorial serif", zh: "手造暖棉纸 + 朱砂与橄榄墨，无刺眼纯白与死黑" },
    base: "clean",
    typography: { reading: PLUS_READING, heading: PLUS_BOLD, bold: PLUS_BOLD, readingSize: 16, readingLeading: 1.85, thinkingItalic: true },
    radius: 8,
    light: {
      bg: "#e5dec9", panel: "#e5dec9", workbench: "#efe7d2", surface: "#f7f1de", text: "#15140f", muted: "#585246", dim: "#6e685a",
      accent: "#c44d36", fill: "#1c1a15", border: "#d5ccb4", user: "#f7f1de", code: "#e4dcc6", codeHeader: "#dad0b6", codeText: "#1f1d17",
      inlineCode: "#692314", inlineCodeBg: "#e6dec8", marker: "#b8442e",
      danger: "#b83524", success: "#52662c", warning: "#96650c",
      syntax: s("#787162", "#9e3b24", "#4d6328", "#8f5408", "#275b73", "#6b4894", "#275b73", "#585246", "#6b6558", "#9e3b24", "#8f5408", "#7d4906", "#2a2620", "#4d6328", "#b83524"),
    },
    dark: {
      bg: "#121210", panel: "#121210", workbench: "#1c1b18", surface: "#262420", text: "#efe7d2", muted: "#bdb5a2", dim: "#918a79",
      accent: "#ed6f5c", accentText: "#15140f", fill: "#ed6f5c", fillText: "#15140f", border: "#33302a", user: "#262420", code: "#151412", codeHeader: "#22201c", codeText: "#e8e0cc",
      inlineCode: "#ffd6cc", inlineCodeBg: "#332622", marker: "#ed6f5c",
      danger: "#f07167", success: "#99c274", warning: "#e9b94a",
      syntax: s("#878071", "#f08e7c", "#a7c985", "#e9b94a", "#82b8cf", "#c7aee8", "#82b8cf", "#bdb5a2", "#9e9685", "#f08e7c", "#e9b94a", "#f29d6b", "#efe7d2", "#99c274", "#f07167"),
    },
  },
  {
    id: "clean",
    name: { en: "Pure Slate", zh: "澄明 · 极简", tw: "澄明 · 極簡" },
    description: { en: "Neutral greys, modern minimal slate", zh: "现代极简中性灰与冷白" },
    base: "clean",
    light: {
      bg: "#f4f4f5", panel: "#f4f4f5", workbench: "#fbfbfc", surface: "#ffffff", text: "#18181b", muted: "#52525b", dim: "#6b6b74",
      accent: "#5b4fe0", border: "#e4e4e8", user: "#f0f0f3", code: "#f6f6f8", inlineCode: "#4b3fd1",
      syntax: s("#8a8a94", "#7c3aed", "#15803d", "#b45309", "#2563eb", "#0e7490", "#1d4ed8", "#52525b", "#71717a", "#be185d", "#b45309", "#c2410c", "#27272a", "#15803d", "#b91c1c"),
    },
    dark: {
      bg: "#161618", panel: "#161618", workbench: "#1b1b1e", surface: "#222226", text: "#f4f4f5", muted: "#b4b4bb", dim: "#8e8e97",
      accent: "#8f86ff", border: "#2e2e34", user: "#26262b", code: "#141416", inlineCode: "#b3adff",
      syntax: s("#7f7f8a", "#b4a7ff", "#86d993", "#f5b971", "#7cb7ff", "#67d4e8", "#8ab4ff", "#b4b4bb", "#9a9aa3", "#ff8fb8", "#f5b971", "#ffa07a", "#e4e4e7", "#86d993", "#ff8a8a"),
    },
  },
  {
    id: "claude",
    name: { en: "Claude", zh: "陶土 · Claude", tw: "陶土 · Claude" },
    description: { en: "Warm paper, clay accent, serif reading", zh: "暖奶油纸 + 陶土橙，衬线阅读" },
    base: "clean",
    typography: { reading: SERIF_READING, heading: SERIF_READING, readingSize: 15, readingLeading: 1.72, thinkingItalic: true },
    light: {
      bg: "#f2f0e8", panel: "#f2f0e8", workbench: "#faf9f5", surface: "#ffffff", text: "#141413", muted: "#5e5d59", dim: "#6f6e68",
      accent: "#b85636", fill: "#c15f3c", border: "#e3dfd3", user: "#efece3",
      code: "#f1eee6", codeHeader: "#e8e4d9", codeText: "#2b2a27", inlineCode: "#8f3c22", inlineCodeBg: "#ece8de", marker: "#d97757",
      danger: "#b4372a", success: "#4f7a28", warning: "#9a6200",
      syntax: s("#85827a", "#a8452a", "#4f7a28", "#9c5b00", "#2c6a84", "#7650a3", "#2c6a84", "#5e5d59", "#6e6c66", "#a8452a", "#9c5b00", "#8a5300", "#3d3d3a", "#4f7a28", "#b4372a"),
    },
    dark: {
      bg: "#1f1e1d", panel: "#1f1e1d", workbench: "#262624", surface: "#30302e", text: "#f5f4ef", muted: "#c2c0b6", dim: "#9c9a92",
      accent: "#d97757", accentText: "#ffffff", fill: "#c6613f", border: "#3e3d39", user: "#1a1918",
      code: "#1c1b1a", codeHeader: "#2b2a27", codeText: "#e9e6dc", inlineCode: "#f0a487", inlineCodeBg: "#383733", marker: "#d97757",
      danger: "#ef8a7a", success: "#a3c27a", warning: "#e3b45f",
      syntax: s("#8f8c83", "#ea9a7c", "#b3cc8a", "#e8bd76", "#86bcd2", "#c4ace6", "#86bcd2", "#c2c0b6", "#a8a59c", "#ea9a7c", "#e8bd76", "#e3b45f", "#e9e6dc", "#a3c27a", "#ef8a7a"),
    },
  },
  {
    id: "github",
    name: { en: "GitHub", zh: "极客 · GitHub", tw: "極客 · GitHub" },
    description: { en: "GitHub Primer colours", zh: "GitHub 经典高对比工程配色" },
    base: "clean",
    light: {
      bg: "#f6f8fa", panel: "#f6f8fa", workbench: "#ffffff", surface: "#ffffff", text: "#1f2328", muted: "#59636e", dim: "#6e7781",
      accent: "#0969da", fill: "#1f883d", border: "#d1d9e0", user: "#f6f8fa", code: "#f6f8fa", codeHeader: "#eff2f5", inlineCode: "#1f2328", inlineCodeBg: "#eff1f3", marker: "#59636e",
      danger: "#d1242f", success: "#1a7f37", warning: "#9a6700",
      syntax: s("#59636e", "#cf222e", "#0a3069", "#0550ae", "#6639ba", "#953800", "#0550ae", "#1f2328", "#1f2328", "#116329", "#0550ae", "#116329", "#953800", "#116329", "#82071e"),
    },
    dark: {
      bg: "#010409", panel: "#010409", workbench: "#0d1117", surface: "#151b23", text: "#f0f6fc", muted: "#9198a1", dim: "#8b949e",
      accent: "#4493f8", accentText: "#ffffff", fill: "#238636", border: "#3d444d", user: "#151b23", code: "#151b23", codeHeader: "#1c232c", inlineCode: "#f0f6fc", inlineCodeBg: "#262c36", marker: "#9198a1",
      danger: "#f85149", success: "#3fb950", warning: "#d29922",
      syntax: s("#9198a1", "#ff7b72", "#a5d6ff", "#79c0ff", "#d2a8ff", "#ffa657", "#79c0ff", "#f0f6fc", "#f0f6fc", "#7ee787", "#79c0ff", "#7ee787", "#ffa657", "#aff5b4", "#ffdcd7"),
    },
  },
  {
    id: "nord",
    name: { en: "Nord", zh: "极夜 · Nord", tw: "極夜 · Nord" },
    description: { en: "Arctic blue-grey frost", zh: "北极冰川冷蓝灰，低饱和护眼" },
    base: "clean",
    light: {
      bg: "#e5e9f0", panel: "#e5e9f0", workbench: "#eceff4", surface: "#f8f9fb", text: "#2e3440", muted: "#4c566a", dim: "#5f6b80",
      accent: "#5e81ac", border: "#d3d9e3", user: "#e1e6ee", code: "#e5e9f0", codeHeader: "#d8dee9", inlineCode: "#4c6a91", marker: "#81a1c1",
      danger: "#a5424c", success: "#5a7a3a", warning: "#9a6f1d",
      syntax: s("#6b7689", "#5e81ac", "#5a7a3a", "#8f5e8a", "#3b7c8c", "#3f7f7b", "#5e81ac", "#4c566a", "#4c566a", "#5e81ac", "#3f7f7b", "#a07a1d", "#2e3440", "#5a7a3a", "#a5424c"),
    },
    dark: {
      bg: "#272c36", panel: "#272c36", workbench: "#2e3440", surface: "#3b4252", text: "#eceff4", muted: "#d8dee9", dim: "#a3acbd",
      accent: "#88c0d0", accentText: "#2e3440", fill: "#5e81ac", border: "#434c5e", user: "#3b4252", code: "#272c36", codeHeader: "#323946", inlineCode: "#8fbcbb", marker: "#81a1c1",
      danger: "#bf616a", success: "#a3be8c", warning: "#ebcb8b",
      syntax: s("#7b88a1", "#81a1c1", "#a3be8c", "#b48ead", "#88c0d0", "#8fbcbb", "#81a1c1", "#81a1c1", "#d8dee9", "#81a1c1", "#8fbcbb", "#ebcb8b", "#d8dee9", "#a3be8c", "#bf616a"),
    },
  },
];

/** Plus 1.7: the redesign theme is the default for anyone who has not picked one. */
export const DEFAULT_THEME_ID = "plus";

export function findBuiltinTheme(id: string): BuiltinTheme | undefined {
  return BUILTIN_THEMES.find((theme) => theme.id === id);
}

/**
 * Plus 1.9: "Plus" is the base every clean theme stacks on. A theme only
 * says how it differs (colours and fonts); anything it leaves out comes from
 * the base, layout and corner radius always do. See docs/agents/plus.md §6.
 */
export const BASE_THEME: BuiltinTheme = findBuiltinTheme(DEFAULT_THEME_ID)!;

/** Optional fields derived from a parent colour: a theme that sets the parent derives them instead of inheriting the base's. */
const DERIVED_FROM: ReadonlyArray<[keyof ThemePalette, keyof ThemePalette]> = [
  ["accentText", "accent"], ["fill", "accent"], ["fillText", "accent"], ["marker", "accent"],
  ["codeHeader", "code"], ["codeText", "code"], ["inlineCodeBg", "inlineCode"],
];
const REQUIRED_COLOURS = ["bg", "panel", "workbench", "surface", "text", "muted", "dim", "accent", "border", "user", "code", "inlineCode"] as const;

/** A theme palette laid over the base palette of the same mode. */
export function mergePalette(base: ThemePalette, p: Partial<ThemePalette>): ThemePalette {
  const out: Record<string, unknown> = { ...p };
  for (const key of REQUIRED_COLOURS) out[key] ??= base[key];
  for (const [key, parent] of DERIVED_FROM) {
    if (out[key] === undefined && p[parent] === undefined && base[key] !== undefined) out[key] = base[key];
  }
  for (const key of ["danger", "success", "warning"] as const) out[key] ??= base[key];
  // Syntax colours follow the theme's accent and text unless it names them.
  if (p.syntax === undefined && p.accent === undefined && p.text === undefined) out.syntax = base.syntax;
  return out as unknown as ThemePalette;
}

// ---- layer steps: canvas (bg) → content panel (workbench) → cards (surface) ----

function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").slice(0, 6);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function hex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}
function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio of two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** `color` moved `amount` (0–1) of the way to `target`, in sRGB like CSS color-mix. */
function toward(color: string, target: string, amount: number): string {
  const a = rgb(color);
  const b = rgb(target);
  return hex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as [number, number, number]);
}
/** Moves `color` toward `target` in small steps until it stands `min` apart from `from`. */
function pushApart(color: string, from: string, target: string, min: number): string {
  let out = color;
  for (let step = 1; step <= 40 && contrastRatio(out, from) < min; step += 1) out = toward(color, target, step * 0.01);
  return out;
}

/** Smallest steps the base's two-layer shell needs to read (the base itself: 1.12 / 1.04 light, 1.13 / 1.11 dark). */
export const LAYER_MIN_CANVAS_STEP = 1.06;
export const LAYER_MIN_CARD_STEP = 1.03;

/**
 * Plus 1.9: the base's three layers, kept readable in every theme. The
 * content panel (workbench) stays the theme's own reading background. The
 * window canvas (bg, where the sidebar sits) must stand one notch below it,
 * darker when there is room, else lighter; cards (surface) must stand one
 * notch away from it, raised or inset as the theme draws them. Too-close
 * layers move toward black or white only, so the hue stays the theme's own.
 */
export function layeredPalette(p: ThemePalette): ThemePalette {
  const valid = [p.bg, p.panel, p.workbench, p.surface].every((c) => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(c));
  if (!valid) return p;
  const { workbench } = p;
  let { bg, surface } = p;
  const sidebarOnCanvas = p.panel.toLowerCase() === p.bg.toLowerCase();
  if (luminance(bg) > luminance(workbench) || contrastRatio(bg, workbench) < LAYER_MIN_CANVAS_STEP) {
    // From the theme's canvas when it is already below the panel, else from the panel itself.
    const start = luminance(bg) < luminance(workbench) ? bg : workbench;
    const darker = pushApart(start, workbench, "#000000", LAYER_MIN_CANVAS_STEP);
    bg = contrastRatio(darker, workbench) >= LAYER_MIN_CANVAS_STEP
      ? darker
      : pushApart(workbench, workbench, "#ffffff", LAYER_MIN_CANVAS_STEP);
  }
  if (contrastRatio(surface, workbench) < LAYER_MIN_CARD_STEP) {
    const up = pushApart(surface, workbench, "#ffffff", LAYER_MIN_CARD_STEP);
    surface = luminance(up) > luminance(workbench) && contrastRatio(up, workbench) >= LAYER_MIN_CARD_STEP
      ? up
      : pushApart(surface, workbench, "#000000", LAYER_MIN_CARD_STEP);
  }
  if (bg === p.bg && surface === p.surface) return p;
  return { ...p, bg, panel: sidebarOnCanvas ? bg : p.panel, surface };
}

/**
 * The definition a theme actually renders with: its palettes laid over the
 * base and put in the base's layer order, its fonts over the base's, and the
 * base's radius (corner radius is layout, not a theme's call).
 */
export function resolveThemeDefinition(def: ThemeDefinition): ThemeDefinition {
  const base = BASE_THEME;
  return {
    light: def.light ? layeredPalette(mergePalette(base.light!, def.light)) : undefined,
    dark: def.dark ? layeredPalette(mergePalette(base.dark!, def.dark)) : undefined,
    typography: { ...base.typography, ...def.typography },
    radius: base.radius,
  };
}

const mix = (color: string, percent: number, other = "transparent") => `color-mix(in srgb, ${color} ${percent}%, ${other})`;

/** Syntax colours a palette leaves out, derived from its other colours. */
export function deriveSyntax(p: ThemePalette, dark: boolean): SyntaxPalette {
  const danger = p.danger ?? (dark ? "#ff8a8a" : "#b91c1c");
  const success = p.success ?? (dark ? "#86d993" : "#15803d");
  const warning = p.warning ?? (dark ? "#f5b971" : "#b45309");
  return {
    comment: p.dim,
    keyword: p.accent,
    string: success,
    number: warning,
    function: mix(p.accent, 60, p.text),
    class: mix(warning, 70, p.text),
    property: mix(p.accent, 75, p.text),
    operator: p.muted,
    punctuation: p.dim,
    tag: p.accent,
    attr: warning,
    regex: danger,
    variable: p.codeText ?? p.text,
    inserted: success,
    deleted: danger,
    ...p.syntax,
  };
}

/** Colour tokens of one palette, as `name: value` pairs. */
export function paletteTokens(p: ThemePalette, mode: boolean): Record<string, string> {
  const dark = p.isDark ?? mode;
  const danger = p.danger ?? (dark ? "#ff6961" : "#d92d20");
  const success = p.success ?? (dark ? "#30d158" : "#248a3d");
  const warning = p.warning ?? (dark ? "#ffd60a" : "#b87503");
  const fill = p.fill ?? p.accent;
  const accentText = p.accentText ?? (dark ? p.workbench : "#ffffff");
  const syntax = deriveSyntax(p, dark);
  const shadowInk = dark ? "#000000" : p.text;
  const tokens: Record<string, string> = {
    "color-scheme": dark ? "dark" : "light",
    "--bg": p.bg,
    "--bg-panel": p.panel,
    "--workbench-bg": p.workbench,
    "--surface": p.surface,
    "--surface-muted": mix(p.surface, 72),
    "--surface-elevated": dark ? mix(p.surface, 94, "#ffffff") : p.surface,
    "--bg-hover": mix(p.text, dark ? 7 : 5),
    "--bg-selected": mix(p.text, dark ? 11 : 8),
    "--bg-subtle": mix(p.text, dark ? 5 : 4),
    "--border": p.border,
    "--separator": mix(p.border, 78),
    "--text": p.text,
    "--text-muted": p.muted,
    "--text-dim": p.dim,
    "--text-meta": p.dim,
    "--accent": p.accent,
    "--accent-hover": dark ? mix(p.accent, 86, "#ffffff") : mix(p.accent, 86, "#000000"),
    "--accent-contrast": accentText,
    "--accent-soft": mix(p.accent, dark ? 18 : 12),
    "--accent-border": mix(p.accent, 42),
    "--focus-ring": mix(p.accent, 40),
    "--selection": mix(p.accent, dark ? 30 : 22),
    "--user-bg": p.user,
    "--assistant-bg": "transparent",
    "--tool-bg": mix(p.text, dark ? 4 : 3),
    "--scroll-thumb": mix(p.text, 22),
    "--danger": danger,
    "--success": success,
    "--warning": warning,
    "--info": p.accent,
    "--shadow-control": `0 1px 2px ${mix(shadowInk, dark ? 28 : 5)}`,
    "--shadow-composer": `0 1px 2px ${mix(shadowInk, dark ? 30 : 4)}, 0 6px 24px ${mix(shadowInk, dark ? 26 : 6)}`,
    "--shadow-popover": `0 14px 40px ${mix(shadowInk, dark ? 46 : 13)}, 0 2px 8px ${mix(shadowInk, dark ? 30 : 6)}`,
    "--shadow-dialog": `0 26px 72px ${mix(shadowInk, dark ? 60 : 20)}, 0 4px 16px ${mix(shadowInk, dark ? 38 : 8)}`,
    "--plus-fill": fill,
    "--plus-fill-hover": dark ? mix(fill, 88, "#ffffff") : mix(fill, 86, "#000000"),
    "--plus-fill-text": p.fillText ?? (p.fill ? "#ffffff" : accentText),
    "--plus-marker": p.marker ?? mix(p.accent, 80, p.muted),
    "--plus-tint": p.marker ?? p.accent,
    "--plus-code-bg": p.code,
    "--plus-code-header": p.codeHeader ?? mix(p.text, dark ? 5 : 4, p.code),
    "--plus-code-border": mix(p.text, dark ? 13 : 11),
    "--plus-code-text": p.codeText ?? p.text,
    "--plus-inline-code": p.inlineCode,
    "--plus-inline-code-bg": p.inlineCodeBg ?? mix(p.inlineCode, dark ? 14 : 9),
    "--plus-backdrop": mix(dark ? "#000000" : p.text, dark ? 50 : 30),
  };
  for (const key of SYNTAX_KEYS) tokens[`--plus-syn-${key}`] = syntax[key];
  return tokens;
}

/** Mode-independent tokens: typography and corner radius. */
export function sharedTokens(def: ThemeDefinition): Record<string, string> {
  const tokens: Record<string, string> = {};
  const t = def.typography;
  if (t?.reading) tokens["--plus-reading-font"] = t.reading;
  if (t?.heading) tokens["--plus-heading-font"] = t.heading;
  if (t?.bold) tokens["--plus-bold-font"] = t.bold;
  if (t?.readingSize) tokens["--plus-reading-size"] = `${t.readingSize}px`;
  if (t?.readingLeading) tokens["--plus-reading-leading"] = String(t.readingLeading);
  if (t?.thinkingItalic) tokens["--plus-thinking-style"] = "italic";
  if (typeof def.radius === "number") {
    const r = Math.max(0, Math.min(16, Math.round(def.radius)));
    tokens["--radius-sm"] = `${Math.max(0, r - 2)}px`;
    tokens["--radius-md"] = `${r}px`;
    tokens["--radius-lg"] = `${r + 4}px`;
    tokens["--radius-xl"] = `${r + 10}px`;
    tokens["--plus-radius"] = `${r}px`;
  }
  return tokens;
}

function block(selector: string, tokens: Record<string, string>): string {
  return `${selector}{${Object.entries(tokens).map(([name, value]) => `${name}:${value}`).join(";")}}`;
}

/** CSS for a definition under the given light / dark root selectors, stacked on the base. */
export function compileThemeCss(raw: ThemeDefinition, lightSelector: string, darkSelector: string): string {
  const out: string[] = [];
  const def = resolveThemeDefinition(raw);
  const shared = sharedTokens(def);
  const light = def.light ? { ...shared, ...paletteTokens(def.light, false) } : shared;
  if (Object.keys(light).length) out.push(block(lightSelector, light));
  if (def.dark) out.push(block(darkSelector, paletteTokens(def.dark, true)));
  return out.join("\n");
}

/**
 * CSS for every built-in theme. Light rules carry (0,2,1) specificity and
 * dark rules (0,3,1), above upstream :root/html.dark and above custom.css
 * palettes written on html:root / html.dark:root.
 */
export function builtinThemesCss(themes: readonly BuiltinTheme[] = BUILTIN_THEMES): string {
  // The base first: every clean-style page starts as Plus, so a CSS-only theme
  // on the clean base (or a theme that leaves things out) stacks on it.
  const base = compileThemeCss(BASE_THEME, BASE_LIGHT_SELECTOR, BASE_DARK_SELECTOR);
  return [base, ...themes
    // The native base is upstream's look: nothing stacks on it.
    .filter((theme) => theme.base === "clean")
    .map((theme) => compileThemeCss(theme, `html[data-plus-theme="${theme.id}"]:root`, `html.dark[data-plus-theme="${theme.id}"]:root`))
    .filter(Boolean)].join("\n");
}

/** Where the base's tokens apply: any page on the clean style, at the same specificity themes use (themes come later and win). */
export const BASE_LIGHT_SELECTOR = 'html[data-plus-style="clean"]:root';
export const BASE_DARK_SELECTOR = 'html.dark[data-plus-style="clean"]:root';

/** Selectors a custom theme's generated tokens use (only one is ever active). */
export const USER_THEME_LIGHT_SELECTOR = "html[data-plus-theme]:root";
export const USER_THEME_DARK_SELECTOR = "html.dark[data-plus-theme]:root";

/** Final CSS of a custom theme: generated tokens first, then its own CSS. */
export function compileUserThemeCss(def: ThemeDefinition | undefined, css: string): string {
  const generated = def ? compileThemeCss(def, USER_THEME_LIGHT_SELECTOR, USER_THEME_DARK_SELECTOR) : "";
  return generated ? `${generated}\n${css}` : css;
}

/** A copy of a definition safe to store: only known fields with sane values. */
export function sanitizeThemeDefinition(value: unknown): ThemeDefinition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const colour = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim().toLowerCase() : undefined);
  const fontList = (v: unknown) => (typeof v === "string" ? v.replace(/[;{}<>\\]/g, "").trim().slice(0, 300) || undefined : undefined);
  const palette = (raw: unknown): ThemePalette | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const p = raw as Record<string, unknown>;
    const required = ["bg", "panel", "workbench", "surface", "text", "muted", "dim", "accent", "border", "user", "code", "inlineCode"] as const;
    const out: Record<string, unknown> = {};
    for (const key of required) {
      const c = colour(p[key]);
      if (!c) return undefined;
      out[key] = c;
    }
    for (const key of ["accentText", "fill", "fillText", "codeHeader", "codeText", "inlineCodeBg", "marker", "danger", "success", "warning"] as const) {
      const c = colour(p[key]);
      if (c) out[key] = c;
    }
    if (typeof p.isDark === "boolean") out.isDark = p.isDark;
    if (p.syntax && typeof p.syntax === "object") {
      const syntax: Partial<SyntaxPalette> = {};
      for (const key of SYNTAX_KEYS) {
        const c = colour((p.syntax as Record<string, unknown>)[key]);
        if (c) syntax[key] = c;
      }
      out.syntax = syntax;
    }
    return out as unknown as ThemePalette;
  };
  const def: ThemeDefinition = {};
  const light = palette(input.light);
  const dark = palette(input.dark);
  if (light) def.light = light;
  if (dark) def.dark = dark;
  if (input.typography && typeof input.typography === "object") {
    const t = input.typography as Record<string, unknown>;
    const typography: ThemeTypography = {};
    const reading = fontList(t.reading);
    const heading = fontList(t.heading);
    const bold = fontList(t.bold);
    if (reading) typography.reading = reading;
    if (heading) typography.heading = heading;
    if (bold) typography.bold = bold;
    if (typeof t.readingSize === "number" && t.readingSize >= 11 && t.readingSize <= 24) typography.readingSize = Math.round(t.readingSize * 2) / 2;
    if (typeof t.readingLeading === "number" && t.readingLeading >= 1.2 && t.readingLeading <= 2.2) typography.readingLeading = t.readingLeading;
    if (t.thinkingItalic === true) typography.thinkingItalic = true;
    if (Object.keys(typography).length) def.typography = typography;
  }
  if (typeof input.radius === "number" && input.radius >= 0 && input.radius <= 16) def.radius = Math.round(input.radius);
  return def.light || def.dark || def.typography || def.radius !== undefined ? def : undefined;
}

/** Definition of a built-in theme, as a starting point for a custom theme. */
export function builtinDefinition(theme: BuiltinTheme): ThemeDefinition {
  const syntaxFull = (p: ThemePalette | undefined, dark: boolean) => (p ? { ...p, syntax: deriveSyntax(p, dark) } : undefined);
  const fallback = findBuiltinTheme(DEFAULT_THEME_ID)!;
  return JSON.parse(JSON.stringify({
    light: syntaxFull(theme.light ?? fallback.light, false),
    dark: syntaxFull(theme.dark ?? fallback.dark, true),
    typography: theme.typography,
    radius: theme.radius,
  })) as ThemeDefinition;
}

/** CSS body offered to new custom themes: an annotated place for extras. */
export const CUSTOM_THEME_CSS_HINT = `/* 这里写额外的 CSS（可选）。颜色、字体、圆角请在上面的调色板里改。
   可用变量举例：--accent --plus-fill --plus-marker --plus-code-bg
   --plus-syn-keyword --plus-reading-font --plus-heading-font --radius-md */
`;

const CSS_VAR_TO_PALETTE: ReadonlyArray<[string, keyof ThemePalette]> = [
  ["--bg", "bg"], ["--bg-panel", "panel"], ["--workbench-bg", "workbench"], ["--surface", "surface"],
  ["--text", "text"], ["--text-muted", "muted"], ["--text-dim", "dim"], ["--accent", "accent"],
  ["--accent-contrast", "accentText"], ["--border", "border"], ["--user-bg", "user"],
  ["--plus-code-bg", "code"], ["--plus-inline-code", "inlineCode"], ["--plus-fill", "fill"],
  ["--plus-marker", "marker"], ["--danger", "danger"], ["--success", "success"], ["--warning", "warning"],
];

/**
 * Best-effort palette from a CSS theme that sets the app's variables (for
 * example a theme made from the old template, or a custom.css palette):
 * light from `html:root` / `:root`, dark from `html.dark:root` / `html.dark`.
 * Fields it cannot find come from the default theme.
 */
export function definitionFromCss(css: string): ThemeDefinition {
  const fallback = findBuiltinTheme(DEFAULT_THEME_ID)!;
  const blocks = (pattern: RegExp) => [...css.matchAll(pattern)].map((match) => match[1]).join(";");
  const lightText = blocks(/(?:^|[\s,}])(?:html)?:root\s*\{([^}]*)\}/g);
  const darkText = blocks(/html\.dark(?::root)?\s*\{([^}]*)\}/g);
  const read = (text: string, base: ThemePalette): ThemePalette => {
    const out: Record<string, unknown> = { ...base, syntax: undefined };
    for (const [variable, key] of CSS_VAR_TO_PALETTE) {
      const match = new RegExp(`${variable}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\b`).exec(text);
      if (match) out[key] = match[1].toLowerCase();
    }
    delete out.syntax;
    return out as unknown as ThemePalette;
  };
  return { light: read(lightText, fallback.light!), dark: read(darkText, fallback.dark!) };
}
