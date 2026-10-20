/**
 * Plus appearance layer: an interface style on top of light/dark, an accent
 * colour, UI font, and whether the shared custom.css applies.
 *
 * Everything is applied as attributes / inline custom properties on <html>,
 * so it composes with the light/dark switch, and an inline init script sets
 * it before first paint (no flash on start).
 */

export type PlusStyle = "native" | "clean";
export type PlusFont = "system" | "inter" | "harmony" | "misans" | "serif";

export interface PlusThemeSettings {
  style: PlusStyle;
  /** Hex colour, or "" for the style's own accent. */
  accent: string;
  font: PlusFont;
  /** Apply ~/.pi/agent/desktop/custom.css (shared with upstream Pi Agent). */
  customCss: boolean;
}

export const PLUS_THEME_STORAGE_KEY = "pi-plus-theme";

export const DEFAULT_PLUS_THEME: PlusThemeSettings = {
  style: "clean",
  accent: "",
  font: "system",
  customCss: true,
};

export const PLUS_STYLES: readonly PlusStyle[] = ["clean", "native"];
export const PLUS_FONTS: readonly PlusFont[] = ["system", "inter", "harmony", "misans", "serif"];

/** Accent presets offered next to the colour picker. */
export const PLUS_ACCENT_PRESETS: readonly string[] = [
  "#5b4fe0", // violet (Magpie)
  "#2563eb", // blue
  "#0f9d8a", // teal
  "#16a34a", // green
  "#d97706", // amber
  "#c15f3c", // clay
  "#db2777", // pink
  "#18181b", // graphite
];

export const PLUS_FONT_STACKS: Record<PlusFont, string | null> = {
  system: null,
  inter: "\"Inter\", \"Inter Variable\", \"Segoe UI Variable\", \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", sans-serif",
  harmony: "\"HarmonyOS Sans SC\", \"HarmonyOS Sans\", \"Segoe UI Variable\", \"PingFang SC\", \"Microsoft YaHei UI\", sans-serif",
  misans: "\"MiSans\", \"MiSans VF\", \"Segoe UI Variable\", \"PingFang SC\", \"Microsoft YaHei UI\", sans-serif",
  serif: "Georgia, \"Noto Serif SC\", \"Source Han Serif SC\", \"Songti SC\", \"SimSun\", serif",
};

const HEX = /^#[0-9a-f]{6}$/i;

export function normalizePlusTheme(value: unknown): PlusThemeSettings {
  const input = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof PlusThemeSettings, unknown>>;
  return {
    style: PLUS_STYLES.includes(input.style as PlusStyle) ? input.style as PlusStyle : DEFAULT_PLUS_THEME.style,
    accent: typeof input.accent === "string" && HEX.test(input.accent) ? input.accent.toLowerCase() : "",
    font: PLUS_FONTS.includes(input.font as PlusFont) ? input.font as PlusFont : DEFAULT_PLUS_THEME.font,
    customCss: typeof input.customCss === "boolean" ? input.customCss : DEFAULT_PLUS_THEME.customCss,
  };
}

export function parseStoredPlusTheme(raw: string | null): PlusThemeSettings {
  if (!raw) return DEFAULT_PLUS_THEME;
  try {
    return normalizePlusTheme(JSON.parse(raw));
  } catch {
    return DEFAULT_PLUS_THEME;
  }
}

/** Inline custom properties for an accent colour; empty when unset. */
export function accentProperties(accent: string): Record<string, string> {
  if (!HEX.test(accent)) return {};
  return {
    "--accent": accent,
    "--accent-hover": `color-mix(in srgb, ${accent} 86%, black)`,
    "--accent-contrast": "#ffffff",
    "--accent-soft": `color-mix(in srgb, ${accent} 12%, transparent)`,
    "--accent-border": `color-mix(in srgb, ${accent} 42%, transparent)`,
    "--focus-ring": `color-mix(in srgb, ${accent} 40%, transparent)`,
    "--selection": `color-mix(in srgb, ${accent} 24%, transparent)`,
  };
}

const ACCENT_PROPERTY_NAMES = Object.keys(accentProperties("#000000"));

/** Apply settings to <html> and the custom.css <link>. Browser only. */
export function applyPlusTheme(settings: PlusThemeSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.plusStyle = settings.style;
  root.dataset.plusFont = settings.font;
  for (const name of ACCENT_PROPERTY_NAMES) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(accentProperties(settings.accent))) root.style.setProperty(name, value);
  const stack = PLUS_FONT_STACKS[settings.font];
  if (stack) root.style.setProperty("--plus-font-ui", stack);
  else root.style.removeProperty("--plus-font-ui");
  const link = document.querySelector<HTMLLinkElement>("link[data-custom-css]");
  if (link) link.disabled = !settings.customCss;
}

/**
 * Runs in <head> before first paint; mirrors applyPlusTheme without imports.
 * Keep the two in sync (lib/plus-theme.test.mjs checks the shared keys).
 */
export const PLUS_THEME_INIT_SCRIPT = `(function(){try{var d=${JSON.stringify(DEFAULT_PLUS_THEME)};var s={};try{s=JSON.parse(localStorage.getItem(${JSON.stringify(PLUS_THEME_STORAGE_KEY)})||"{}")||{}}catch(e){}var r=document.documentElement;var st=${JSON.stringify(PLUS_STYLES)}.indexOf(s.style)>=0?s.style:d.style;r.dataset.plusStyle=st;var f=${JSON.stringify(PLUS_FONTS)}.indexOf(s.font)>=0?s.font:d.font;r.dataset.plusFont=f;var fonts=${JSON.stringify(PLUS_FONT_STACKS)};if(fonts[f])r.style.setProperty("--plus-font-ui",fonts[f]);var a=typeof s.accent==="string"&&/^#[0-9a-f]{6}$/i.test(s.accent)?s.accent:"";if(a){r.style.setProperty("--accent",a);r.style.setProperty("--accent-hover","color-mix(in srgb, "+a+" 86%, black)");r.style.setProperty("--accent-contrast","#ffffff");r.style.setProperty("--accent-soft","color-mix(in srgb, "+a+" 12%, transparent)");r.style.setProperty("--accent-border","color-mix(in srgb, "+a+" 42%, transparent)");r.style.setProperty("--focus-ring","color-mix(in srgb, "+a+" 40%, transparent)");r.style.setProperty("--selection","color-mix(in srgb, "+a+" 24%, transparent)")}if(s.customCss===false){var l=document.querySelector("link[data-custom-css]");if(l)l.disabled=true}}catch(e){}})();`;
