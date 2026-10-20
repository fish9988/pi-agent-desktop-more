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
  /** Base corner radius in px for controls and cards (default 9). */
  radius?: number;
}

export interface BuiltinTheme extends ThemeDefinition {
  id: string;
  name: { en: string; zh: string; tw?: string };
  base: ThemeBase;
  description?: { en: string; zh: string };
}

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
    id: "clean",
    name: { en: "Clean", zh: "简洁", tw: "簡潔" },
    description: { en: "Neutral greys, violet accent", zh: "中性灰 + 紫色强调" },
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
    id: "native",
    name: { en: "Native", zh: "原生", tw: "原生" },
    description: { en: "Upstream Pi Agent look, untouched", zh: "官方 Pi Agent 原样" },
    base: "native",
  },
  {
    id: "claude",
    name: { en: "Claude", zh: "Claude 陶土", tw: "Claude 陶土" },
    description: { en: "Warm paper, clay accent, serif reading", zh: "暖奶油纸 + 陶土橙，衬线阅读" },
    base: "clean",
    typography: { reading: SERIF_READING, heading: SERIF_READING, readingSize: 15, readingLeading: 1.72, thinkingItalic: true },
    radius: 9,
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
    name: { en: "GitHub", zh: "GitHub", tw: "GitHub" },
    description: { en: "GitHub Primer colours", zh: "GitHub 官方配色" },
    base: "clean",
    radius: 6,
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
    name: { en: "Nord", zh: "北极 Nord", tw: "北極 Nord" },
    description: { en: "Arctic blue-grey", zh: "北极冷蓝灰" },
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
  {
    id: "solarized",
    name: { en: "Solarized", zh: "Solarized", tw: "Solarized" },
    description: { en: "Ethan Schoonover's classic", zh: "经典低对比护眼配色" },
    base: "clean",
    light: {
      bg: "#eee8d5", panel: "#eee8d5", workbench: "#fdf6e3", surface: "#fffbf0", text: "#073642", muted: "#586e75", dim: "#657b83",
      accent: "#268bd2", border: "#e0d9c1", user: "#eee8d5", code: "#f5efdc", codeHeader: "#eee8d5", codeText: "#586e75", inlineCode: "#cb4b16", marker: "#b58900",
      danger: "#dc322f", success: "#859900", warning: "#b58900",
      syntax: s("#93a1a1", "#859900", "#2aa198", "#d33682", "#268bd2", "#b58900", "#268bd2", "#657b83", "#657b83", "#268bd2", "#b58900", "#dc322f", "#6c71c4", "#859900", "#dc322f"),
    },
    dark: {
      bg: "#00212b", panel: "#00212b", workbench: "#002b36", surface: "#073642", text: "#eee8d5", muted: "#93a1a1", dim: "#839496",
      accent: "#2aa198", accentText: "#002b36", fill: "#268bd2", border: "#0e4b5a", user: "#073642", code: "#00212b", codeHeader: "#05323d", codeText: "#93a1a1", inlineCode: "#b58900", marker: "#b58900",
      danger: "#dc322f", success: "#859900", warning: "#b58900",
      syntax: s("#586e75", "#859900", "#2aa198", "#d33682", "#268bd2", "#b58900", "#268bd2", "#93a1a1", "#93a1a1", "#268bd2", "#b58900", "#dc322f", "#6c71c4", "#859900", "#dc322f"),
    },
  },
  {
    id: "catppuccin",
    name: { en: "Catppuccin", zh: "Catppuccin", tw: "Catppuccin" },
    description: { en: "Latte by day, Mocha by night", zh: "日用 Latte，夜用 Mocha，柔和粉彩" },
    base: "clean",
    radius: 11,
    light: {
      bg: "#e6e9ef", panel: "#e6e9ef", workbench: "#eff1f5", surface: "#ffffff", text: "#4c4f69", muted: "#5c5f77", dim: "#6c6f85",
      accent: "#8839ef", border: "#ccd0da", user: "#e6e9ef", code: "#e6e9ef", codeHeader: "#dce0e8", inlineCode: "#d20f39", marker: "#ea76cb",
      danger: "#d20f39", success: "#40a02b", warning: "#df8e1d",
      syntax: s("#8c8fa1", "#8839ef", "#40a02b", "#fe640b", "#1e66f5", "#df8e1d", "#1e66f5", "#04a5e5", "#7c7f93", "#1e66f5", "#df8e1d", "#ea76cb", "#4c4f69", "#40a02b", "#d20f39"),
    },
    dark: {
      bg: "#181825", panel: "#181825", workbench: "#1e1e2e", surface: "#2a2a3c", text: "#cdd6f4", muted: "#bac2de", dim: "#a6adc8",
      accent: "#cba6f7", accentText: "#1e1e2e", border: "#313244", user: "#313244", code: "#181825", codeHeader: "#232334", inlineCode: "#f5c2e7", marker: "#f5c2e7",
      danger: "#f38ba8", success: "#a6e3a1", warning: "#f9e2af",
      syntax: s("#9399b2", "#cba6f7", "#a6e3a1", "#fab387", "#89b4fa", "#f9e2af", "#89b4fa", "#89dceb", "#9399b2", "#89b4fa", "#f9e2af", "#f5c2e7", "#cdd6f4", "#a6e3a1", "#f38ba8"),
    },
  },
  {
    id: "tokyonight",
    name: { en: "Tokyo Night", zh: "东京之夜", tw: "東京之夜" },
    description: { en: "Neon city night", zh: "霓虹夜色" },
    base: "clean",
    light: {
      bg: "#e9e9ef", panel: "#e9e9ef", workbench: "#f4f4f7", surface: "#ffffff", text: "#343b58", muted: "#4c5374", dim: "#6a6f87",
      accent: "#2e7de9", border: "#d5d6db", user: "#e9e9ef", code: "#e9e9ef", codeHeader: "#dfe0e7", codeText: "#3760bf", inlineCode: "#9854f1", marker: "#9854f1",
      danger: "#c64343", success: "#587539", warning: "#8c6c3e",
      syntax: s("#7b82a6", "#9854f1", "#587539", "#b15c00", "#2e7de9", "#007197", "#387068", "#006a83", "#6172b0", "#f52a65", "#8c6c3e", "#2e5857", "#3760bf", "#587539", "#c64343"),
    },
    dark: {
      bg: "#16161e", panel: "#16161e", workbench: "#1a1b26", surface: "#24283b", text: "#c0caf5", muted: "#a9b1d6", dim: "#7f88b0",
      accent: "#7aa2f7", accentText: "#1a1b26", border: "#2f3549", user: "#24283b", code: "#16161e", codeHeader: "#1f2335", inlineCode: "#bb9af7", marker: "#bb9af7",
      danger: "#f7768e", success: "#9ece6a", warning: "#e0af68",
      syntax: s("#6b75a8", "#bb9af7", "#9ece6a", "#ff9e64", "#7aa2f7", "#2ac3de", "#73daca", "#89ddff", "#a9b1d6", "#f7768e", "#e0af68", "#b4f9f8", "#c0caf5", "#9ece6a", "#f7768e"),
    },
  },
  {
    id: "rosepine",
    name: { en: "Rosé Pine", zh: "玫瑰松", tw: "玫瑰松" },
    description: { en: "Soho vibes, muted rose", zh: "低饱和玫瑰色" },
    base: "clean",
    radius: 11,
    typography: { heading: "Georgia, \"Noto Serif SC\", \"Source Han Serif SC\", \"SimSun\", serif" },
    light: {
      bg: "#f2e9e1", panel: "#f2e9e1", workbench: "#faf4ed", surface: "#fffaf3", text: "#575279", muted: "#6e6a86", dim: "#797593",
      accent: "#286983", border: "#e4dcd3", user: "#f2e9e1", code: "#f4ede8", codeHeader: "#ece2d9", inlineCode: "#b4637a", marker: "#d7827e",
      danger: "#b4637a", success: "#56949f", warning: "#c4801f",
      syntax: s("#797593", "#286983", "#c4801f", "#b4637a", "#c06a66", "#56949f", "#56949f", "#797593", "#797593", "#56949f", "#907aa9", "#b4637a", "#575279", "#56949f", "#b4637a"),
    },
    dark: {
      bg: "#16141f", panel: "#16141f", workbench: "#191724", surface: "#26233a", text: "#e0def4", muted: "#c3c0dc", dim: "#908caa",
      accent: "#c4a7e7", accentText: "#191724", fill: "#ebbcba", fillText: "#191724", border: "#2e2b44", user: "#26233a", code: "#16141f", codeHeader: "#211f30", inlineCode: "#ebbcba", marker: "#ebbcba",
      danger: "#eb6f92", success: "#9ccfd8", warning: "#f6c177",
      syntax: s("#908caa", "#3e8fb0", "#f6c177", "#ebbcba", "#ebbcba", "#9ccfd8", "#9ccfd8", "#908caa", "#908caa", "#9ccfd8", "#c4a7e7", "#eb6f92", "#e0def4", "#9ccfd8", "#eb6f92"),
    },
  },
  {
    id: "gruvbox",
    name: { en: "Gruvbox", zh: "Gruvbox 复古", tw: "Gruvbox 復古" },
    description: { en: "Retro groove, warm contrast", zh: "复古暖色高对比" },
    base: "clean",
    radius: 6,
    light: {
      bg: "#f2e5bc", panel: "#f2e5bc", workbench: "#fbf1c7", surface: "#fffbe8", text: "#3c3836", muted: "#504945", dim: "#7c6f64",
      accent: "#af3a03", border: "#e0d0a6", user: "#ebdbb2", code: "#f2e5bc", codeHeader: "#ebdbb2", inlineCode: "#9d0006", marker: "#d65d0e",
      danger: "#9d0006", success: "#79740e", warning: "#b57614",
      syntax: s("#7c6f64", "#9d0006", "#79740e", "#8f3f71", "#427b58", "#b57614", "#076678", "#af3a03", "#7c6f64", "#076678", "#b57614", "#af3a03", "#3c3836", "#79740e", "#9d0006"),
    },
    dark: {
      bg: "#1d2021", panel: "#1d2021", workbench: "#282828", surface: "#32302f", text: "#ebdbb2", muted: "#d5c4a1", dim: "#a89984",
      accent: "#fe8019", accentText: "#1d2021", border: "#3c3836", user: "#32302f", code: "#1d2021", codeHeader: "#2a2827", inlineCode: "#fabd2f", marker: "#fe8019",
      danger: "#fb4934", success: "#b8bb26", warning: "#fabd2f",
      syntax: s("#928374", "#fb4934", "#b8bb26", "#d3869b", "#8ec07c", "#fabd2f", "#83a598", "#fe8019", "#a89984", "#83a598", "#fabd2f", "#fe8019", "#ebdbb2", "#b8bb26", "#fb4934"),
    },
  },
  {
    id: "sage",
    name: { en: "Sage (eye care)", zh: "护眼绿", tw: "護眼綠" },
    description: { en: "Soft green paper for long reading", zh: "柔和绿纸，长时间阅读" },
    base: "clean",
    light: {
      bg: "#e3ecdf", panel: "#e3ecdf", workbench: "#eef4ea", surface: "#f7fbf4", text: "#1f2a1f", muted: "#46574a", dim: "#5f6f62",
      accent: "#3d7a4f", border: "#cfdcc9", user: "#dfe9da", code: "#e6eee2", codeHeader: "#dae5d5", inlineCode: "#2f6b44", marker: "#5c9a6c",
      danger: "#a33a3a", success: "#2f6b44", warning: "#8a6a1f",
      syntax: s("#7d8c80", "#2f6b44", "#8a6a1f", "#a0522d", "#2d6a8a", "#6b5a9a", "#2d6a8a", "#46574a", "#5f6f62", "#2f6b44", "#8a6a1f", "#a0522d", "#1f2a1f", "#2f6b44", "#a33a3a"),
    },
    dark: {
      bg: "#131814", panel: "#131814", workbench: "#1a211c", surface: "#222b25", text: "#e3ece2", muted: "#b3c2b5", dim: "#8a9b8d",
      accent: "#7fc795", accentText: "#131814", border: "#2e3a31", user: "#26302a", code: "#131814", codeHeader: "#1d251f", inlineCode: "#9ad5ab", marker: "#7fc795",
      danger: "#f08a8a", success: "#9ad5ab", warning: "#e0c48a",
      syntax: s("#7d8f80", "#9ad5ab", "#e0c48a", "#f0a77a", "#8cc7e0", "#c2b0e8", "#8cc7e0", "#b3c2b5", "#8a9b8d", "#9ad5ab", "#e0c48a", "#f0a77a", "#e3ece2", "#9ad5ab", "#f08a8a"),
    },
  },
  {
    id: "graphite",
    name: { en: "Graphite", zh: "石墨黑白", tw: "石墨黑白" },
    description: { en: "Monochrome, ink on paper", zh: "纯黑白，墨水感" },
    base: "clean",
    radius: 6,
    light: {
      bg: "#efefef", panel: "#efefef", workbench: "#fafafa", surface: "#ffffff", text: "#111111", muted: "#4a4a4a", dim: "#6a6a6a",
      accent: "#111111", border: "#dddddd", user: "#ececec", code: "#f2f2f2", codeHeader: "#e8e8e8", inlineCode: "#111111", inlineCodeBg: "#ebebeb", marker: "#8a8a8a",
      danger: "#a33a3a", success: "#2d6a2d", warning: "#7a5a00",
      syntax: s("#8a8a8a", "#000000", "#4a4a4a", "#4a4a4a", "#1a1a1a", "#1a1a1a", "#333333", "#666666", "#777777", "#000000", "#444444", "#444444", "#222222", "#2d6a2d", "#a33a3a"),
    },
    dark: {
      bg: "#0b0b0b", panel: "#0b0b0b", workbench: "#141414", surface: "#1c1c1c", text: "#ededed", muted: "#b5b5b5", dim: "#8a8a8a",
      accent: "#ededed", accentText: "#111111", border: "#2a2a2a", user: "#1f1f1f", code: "#0b0b0b", codeHeader: "#181818", inlineCode: "#ededed", inlineCodeBg: "#262626", marker: "#8a8a8a",
      danger: "#f08a8a", success: "#8fd18f", warning: "#e0c070",
      syntax: s("#7a7a7a", "#ffffff", "#c8c8c8", "#c8c8c8", "#f0f0f0", "#f0f0f0", "#d0d0d0", "#a0a0a0", "#909090", "#ffffff", "#c0c0c0", "#c0c0c0", "#e0e0e0", "#8fd18f", "#f08a8a"),
    },
  },
];

export const DEFAULT_THEME_ID = "clean";

export function findBuiltinTheme(id: string): BuiltinTheme | undefined {
  return BUILTIN_THEMES.find((theme) => theme.id === id);
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
export function paletteTokens(p: ThemePalette, dark: boolean): Record<string, string> {
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

/** CSS for a definition under the given light / dark root selectors. */
export function compileThemeCss(def: ThemeDefinition, lightSelector: string, darkSelector: string): string {
  const out: string[] = [];
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
  return themes
    .map((theme) => compileThemeCss(theme, `html[data-plus-theme="${theme.id}"]:root`, `html.dark[data-plus-theme="${theme.id}"]:root`))
    .filter(Boolean)
    .join("\n");
}

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
    if (reading) typography.reading = reading;
    if (heading) typography.heading = heading;
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
