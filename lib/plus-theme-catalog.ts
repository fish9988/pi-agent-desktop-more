/**
 * Plus built-in themes. Each theme is a compact palette for light and dark;
 * the full token set (hover, selection, focus, chat colours…) is derived here
 * so every theme covers the same variables and stays consistent.
 *
 * The generated CSS is server-rendered into <head> (no flash on start).
 */

export type ThemeBase = "clean" | "native";

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
  accent: string;
  /** Text on an accent fill; defaults to white (light) / the canvas (dark). */
  accentText?: string;
  border: string;
  /** User message bubble. */
  user: string;
  /** Code block background. */
  code: string;
  /** Inline `code` text colour. */
  inlineCode: string;
  danger?: string;
  success?: string;
  warning?: string;
}

export interface BuiltinTheme {
  id: string;
  name: { en: string; zh: string; tw?: string };
  base: ThemeBase;
  /** Absent for "native": upstream colours and custom.css apply untouched. */
  light?: ThemePalette;
  dark?: ThemePalette;
}

export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  {
    id: "clean",
    name: { en: "Clean", zh: "简洁", tw: "簡潔" },
    base: "clean",
    light: { bg: "#f4f4f5", panel: "#f4f4f5", workbench: "#fbfbfc", surface: "#ffffff", text: "#18181b", muted: "#52525b", dim: "#6b6b74", accent: "#5b4fe0", border: "#e4e4e8", user: "#f0f0f3", code: "#f6f6f8", inlineCode: "#4b3fd1" },
    dark: { bg: "#161618", panel: "#161618", workbench: "#1b1b1e", surface: "#222226", text: "#f4f4f5", muted: "#b4b4bb", dim: "#8e8e97", accent: "#8f86ff", border: "#2e2e34", user: "#26262b", code: "#141416", inlineCode: "#b3adff" },
  },
  {
    id: "native",
    name: { en: "Native", zh: "原生", tw: "原生" },
    base: "native",
  },
  {
    id: "claude",
    name: { en: "Claude", zh: "Claude 陶土", tw: "Claude 陶土" },
    base: "clean",
    light: { bg: "#f2f0e8", panel: "#f2f0e8", workbench: "#faf9f5", surface: "#ffffff", text: "#141413", muted: "#5e5d59", dim: "#6f6e68", accent: "#c15f3c", border: "#e3dfd3", user: "#efece3", code: "#f5f2ea", inlineCode: "#b85636" },
    dark: { bg: "#1f1e1d", panel: "#1f1e1d", workbench: "#262624", surface: "#30302e", text: "#f5f4ef", muted: "#c2c0b6", dim: "#9c9a92", accent: "#d97757", accentText: "#ffffff", border: "#3e3d39", user: "#353432", code: "#1f1e1d", inlineCode: "#e0896a" },
  },
  {
    id: "github",
    name: { en: "GitHub", zh: "GitHub", tw: "GitHub" },
    base: "clean",
    light: { bg: "#f6f8fa", panel: "#f6f8fa", workbench: "#ffffff", surface: "#ffffff", text: "#1f2328", muted: "#59636e", dim: "#6e7781", accent: "#0969da", border: "#d1d9e0", user: "#f6f8fa", code: "#f6f8fa", inlineCode: "#0550ae" },
    dark: { bg: "#010409", panel: "#010409", workbench: "#0d1117", surface: "#151b23", text: "#f0f6fc", muted: "#9198a1", dim: "#8b949e", accent: "#4493f8", accentText: "#ffffff", border: "#3d444d", user: "#151b23", code: "#151b23", inlineCode: "#79c0ff" },
  },
  {
    id: "nord",
    name: { en: "Nord", zh: "北极 Nord", tw: "北極 Nord" },
    base: "clean",
    light: { bg: "#e5e9f0", panel: "#e5e9f0", workbench: "#eceff4", surface: "#f8f9fb", text: "#2e3440", muted: "#4c566a", dim: "#5f6b80", accent: "#5e81ac", border: "#d3d9e3", user: "#e5e9f0", code: "#e5e9f0", inlineCode: "#4c6a91" },
    dark: { bg: "#272c36", panel: "#272c36", workbench: "#2e3440", surface: "#3b4252", text: "#eceff4", muted: "#d8dee9", dim: "#a3acbd", accent: "#88c0d0", accentText: "#2e3440", border: "#434c5e", user: "#3b4252", code: "#272c36", inlineCode: "#8fbcbb" },
  },
  {
    id: "solarized",
    name: { en: "Solarized", zh: "Solarized", tw: "Solarized" },
    base: "clean",
    light: { bg: "#eee8d5", panel: "#eee8d5", workbench: "#fdf6e3", surface: "#fffbf0", text: "#073642", muted: "#586e75", dim: "#657b83", accent: "#268bd2", border: "#e0d9c1", user: "#eee8d5", code: "#f5efdc", inlineCode: "#cb4b16" },
    dark: { bg: "#00212b", panel: "#00212b", workbench: "#002b36", surface: "#073642", text: "#eee8d5", muted: "#93a1a1", dim: "#839496", accent: "#2aa198", accentText: "#002b36", border: "#0e4b5a", user: "#073642", code: "#00212b", inlineCode: "#b58900" },
  },
  {
    id: "catppuccin",
    name: { en: "Catppuccin", zh: "Catppuccin", tw: "Catppuccin" },
    base: "clean",
    light: { bg: "#e6e9ef", panel: "#e6e9ef", workbench: "#eff1f5", surface: "#ffffff", text: "#4c4f69", muted: "#5c5f77", dim: "#6c6f85", accent: "#8839ef", border: "#ccd0da", user: "#e6e9ef", code: "#e6e9ef", inlineCode: "#d20f39" },
    dark: { bg: "#181825", panel: "#181825", workbench: "#1e1e2e", surface: "#2a2a3c", text: "#cdd6f4", muted: "#bac2de", dim: "#a6adc8", accent: "#cba6f7", accentText: "#1e1e2e", border: "#313244", user: "#313244", code: "#181825", inlineCode: "#f5c2e7" },
  },
  {
    id: "tokyonight",
    name: { en: "Tokyo Night", zh: "东京之夜", tw: "東京之夜" },
    base: "clean",
    light: { bg: "#e9e9ef", panel: "#e9e9ef", workbench: "#f4f4f7", surface: "#ffffff", text: "#343b58", muted: "#4c5374", dim: "#6a6f87", accent: "#2e7de9", border: "#d5d6db", user: "#e9e9ef", code: "#e9e9ef", inlineCode: "#9854f1" },
    dark: { bg: "#16161e", panel: "#16161e", workbench: "#1a1b26", surface: "#24283b", text: "#c0caf5", muted: "#a9b1d6", dim: "#7f88b0", accent: "#7aa2f7", accentText: "#1a1b26", border: "#2f3549", user: "#24283b", code: "#16161e", inlineCode: "#bb9af7" },
  },
  {
    id: "rosepine",
    name: { en: "Rosé Pine", zh: "玫瑰松", tw: "玫瑰松" },
    base: "clean",
    light: { bg: "#f2e9e1", panel: "#f2e9e1", workbench: "#faf4ed", surface: "#fffaf3", text: "#575279", muted: "#6e6a86", dim: "#797593", accent: "#286983", border: "#e4dcd3", user: "#f2e9e1", code: "#f4ede8", inlineCode: "#b4637a" },
    dark: { bg: "#16141f", panel: "#16141f", workbench: "#191724", surface: "#26233a", text: "#e0def4", muted: "#c3c0dc", dim: "#908caa", accent: "#c4a7e7", accentText: "#191724", border: "#2e2b44", user: "#26233a", code: "#16141f", inlineCode: "#ebbcba" },
  },
  {
    id: "gruvbox",
    name: { en: "Gruvbox", zh: "Gruvbox 复古", tw: "Gruvbox 復古" },
    base: "clean",
    light: { bg: "#f2e5bc", panel: "#f2e5bc", workbench: "#fbf1c7", surface: "#fffbe8", text: "#3c3836", muted: "#504945", dim: "#7c6f64", accent: "#af3a03", border: "#e0d0a6", user: "#ebdbb2", code: "#f2e5bc", inlineCode: "#9d0006" },
    dark: { bg: "#1d2021", panel: "#1d2021", workbench: "#282828", surface: "#32302f", text: "#ebdbb2", muted: "#d5c4a1", dim: "#a89984", accent: "#fe8019", accentText: "#1d2021", border: "#3c3836", user: "#32302f", code: "#1d2021", inlineCode: "#fabd2f" },
  },
  {
    id: "sage",
    name: { en: "Sage (eye care)", zh: "护眼绿", tw: "護眼綠" },
    base: "clean",
    light: { bg: "#e3ecdf", panel: "#e3ecdf", workbench: "#eef4ea", surface: "#f7fbf4", text: "#1f2a1f", muted: "#46574a", dim: "#5f6f62", accent: "#3d7a4f", border: "#cfdcc9", user: "#dfe9da", code: "#e6eee2", inlineCode: "#2f6b44" },
    dark: { bg: "#131814", panel: "#131814", workbench: "#1a211c", surface: "#222b25", text: "#e3ece2", muted: "#b3c2b5", dim: "#8a9b8d", accent: "#7fc795", accentText: "#131814", border: "#2e3a31", user: "#26302a", code: "#131814", inlineCode: "#9ad5ab" },
  },
  {
    id: "graphite",
    name: { en: "Graphite", zh: "石墨黑白", tw: "石墨黑白" },
    base: "clean",
    light: { bg: "#efefef", panel: "#efefef", workbench: "#fafafa", surface: "#ffffff", text: "#111111", muted: "#4a4a4a", dim: "#6a6a6a", accent: "#111111", border: "#dddddd", user: "#ececec", code: "#f2f2f2", inlineCode: "#111111" },
    dark: { bg: "#0b0b0b", panel: "#0b0b0b", workbench: "#141414", surface: "#1c1c1c", text: "#ededed", muted: "#b5b5b5", dim: "#8a8a8a", accent: "#ededed", accentText: "#111111", border: "#2a2a2a", user: "#1f1f1f", code: "#0b0b0b", inlineCode: "#ededed" },
  },
];

export const DEFAULT_THEME_ID = "clean";

export function findBuiltinTheme(id: string): BuiltinTheme | undefined {
  return BUILTIN_THEMES.find((theme) => theme.id === id);
}

const mix = (color: string, percent: number, other = "transparent") => `color-mix(in srgb, ${color} ${percent}%, ${other})`;

/** Every token a palette sets, as `name: value` pairs. */
export function paletteTokens(p: ThemePalette, dark: boolean): Record<string, string> {
  const danger = p.danger ?? (dark ? "#ff6961" : "#d92d20");
  const success = p.success ?? (dark ? "#30d158" : "#248a3d");
  const warning = p.warning ?? (dark ? "#ffd60a" : "#b87503");
  return {
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
    "--accent-contrast": p.accentText ?? (dark ? p.workbench : "#ffffff"),
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
    "--plus-code-bg": p.code,
    "--plus-inline-code": p.inlineCode,
    "--plus-inline-code-bg": mix(p.inlineCode, dark ? 14 : 9),
  };
}

function block(selector: string, tokens: Record<string, string>): string {
  return `${selector}{${Object.entries(tokens).map(([name, value]) => `${name}:${value}`).join(";")}}`;
}

/**
 * CSS for every built-in palette. Light rules carry (0,2,1) specificity and
 * dark rules (0,3,1), above upstream :root/html.dark and custom.css palettes
 * written on html:root / html.dark:root.
 */
export function builtinThemesCss(themes: readonly BuiltinTheme[] = BUILTIN_THEMES): string {
  const out: string[] = [];
  for (const theme of themes) {
    if (theme.light) out.push(block(`html[data-plus-theme="${theme.id}"]:root`, paletteTokens(theme.light, false)));
    if (theme.dark) out.push(block(`html.dark[data-plus-theme="${theme.id}"]:root`, paletteTokens(theme.dark, true)));
  }
  return out.join("\n");
}

/** CSS text for a built-in theme, as a starting point for a custom theme. */
export function themeTemplateCss(theme: BuiltinTheme): string {
  const lines = [
    `/* Based on the built-in "${theme.name.en}" theme. Edit freely. */`,
    "",
  ];
  if (theme.light) {
    lines.push("html:root {", ...Object.entries(paletteTokens(theme.light, false)).map(([k, v]) => `  ${k}: ${v};`), "}", "");
  }
  if (theme.dark) {
    lines.push("html.dark:root {", ...Object.entries(paletteTokens(theme.dark, true)).map(([k, v]) => `  ${k}: ${v};`), "}", "");
  }
  if (!theme.light && !theme.dark) {
    lines.push(":root {", "  /* --accent: #5b4fe0; */", "}", "");
  }
  return lines.join("\n");
}
