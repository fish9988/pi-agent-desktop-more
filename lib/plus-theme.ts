/**
 * Plus appearance settings: theme (built-in or custom), accent, three font
 * families (interface / chat / code) and whether the shared custom.css is
 * layered on top of the theme.
 *
 * Applied as attributes and inline custom properties on <html>; an inline init
 * script repeats this before first paint, including an imported theme's CSS
 * cached in localStorage, so nothing flashes on start.
 */

import { DEFAULT_THEME_ID, findBuiltinTheme, type ThemeBase } from "./plus-theme-catalog";

export interface PlusThemeSettings {
  /** Built-in theme id, or `user:<id>` for an imported theme. */
  theme: string;
  /** Hex colour, or "" for the theme's own accent. */
  accent: string;
  /** Font family names (comma list allowed); "" keeps the theme default. */
  uiFont: string;
  chatFont: string;
  codeFont: string;
  /**
   * Layer ~/.pi/agent/desktop/custom.css (shared with upstream Pi Agent) over
   * the theme. Off by default: a theme owns the whole look, and custom.css
   * can be turned into a theme of its own instead.
   */
  customCssOverlay: boolean;
}

export const PLUS_THEME_STORAGE_KEY = "pi-plus-theme";
/** Cached CSS + base of the active imported theme, read by the init script. */
export const PLUS_USER_THEME_CACHE_KEY = "pi-plus-user-theme-cache";
export const PLUS_USER_THEME_STYLE_ID = "plus-user-theme";
export const USER_THEME_PREFIX = "user:";

export const DEFAULT_PLUS_THEME: PlusThemeSettings = {
  theme: DEFAULT_THEME_ID,
  accent: "",
  uiFont: "",
  chatFont: "",
  codeFont: "",
  customCssOverlay: false,
};

/** Accent presets offered next to the colour picker. */
export const PLUS_ACCENT_PRESETS: readonly string[] = [
  "#5b4fe0", "#2563eb", "#0f9d8a", "#16a34a", "#d97706", "#c15f3c", "#db2777", "#18181b",
];

export type FontRole = "ui" | "chat" | "code";

/** Fallbacks appended after the chosen family. */
export const FONT_FALLBACKS: Record<FontRole, string> = {
  ui: "\"Segoe UI Variable\", \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", \"Noto Sans SC\", sans-serif",
  chat: "\"Segoe UI Variable\", \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", \"Noto Sans SC\", sans-serif",
  code: "\"Cascadia Code\", \"JetBrains Mono\", Consolas, \"Microsoft YaHei UI\", monospace",
};

/** Quick picks shown at the top of each font picker. */
export const FONT_SUGGESTIONS: Record<FontRole, readonly string[]> = {
  ui: ["Inter", "Segoe UI Variable", "Microsoft YaHei UI", "HarmonyOS Sans SC", "MiSans", "LXGW WenKai"],
  chat: ["Georgia, Noto Serif SC, SimSun", "LXGW WenKai", "Microsoft YaHei", "Source Han Serif SC", "Inter"],
  code: ["Cascadia Code", "JetBrains Mono", "Fira Code", "Consolas", "Maple Mono NF CN", "Sarasa Mono SC"],
};

const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace"]);
const HEX = /^#[0-9a-f]{6}$/i;
const THEME_ID = /^(?:[a-z0-9-]{1,40}|user:[a-z0-9-]{1,64})$/;

/** Family list the user picked, cleaned of anything that is not a name. */
export function sanitizeFontValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .split(",")
    .map((part) => part.replace(/["'\\;{}<>()]/g, "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(", ")
    .slice(0, 300);
}

/** CSS font-family for a role, or null when the theme default applies. */
export function fontStack(value: string, role: FontRole): string | null {
  const clean = sanitizeFontValue(value);
  if (!clean) return null;
  const families = clean.split(",").map((part) => part.trim()).map((name) => (GENERIC_FAMILIES.has(name.toLowerCase()) ? name : `"${name}"`));
  return `${families.join(", ")}, ${FONT_FALLBACKS[role]}`;
}

export function isUserTheme(theme: string): boolean {
  return theme.startsWith(USER_THEME_PREFIX);
}

interface LegacySettings {
  style?: unknown;
  font?: unknown;
}

const LEGACY_FONTS: Record<string, string> = {
  inter: "Inter",
  harmony: "HarmonyOS Sans SC",
  misans: "MiSans",
  serif: "Georgia, Noto Serif SC, SimSun",
};

export function normalizePlusTheme(value: unknown): PlusThemeSettings {
  const input = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof PlusThemeSettings, unknown>> & LegacySettings;
  // v1 stored { style: "clean" | "native", font: preset }.
  const legacyTheme = input.style === "clean" || input.style === "native" ? input.style : undefined;
  const legacyFont = typeof input.font === "string" ? LEGACY_FONTS[input.font] ?? "" : "";
  const themeValue = typeof input.theme === "string" ? input.theme : legacyTheme;
  const theme = typeof themeValue === "string" && THEME_ID.test(themeValue) && (isUserTheme(themeValue) || findBuiltinTheme(themeValue))
    ? themeValue
    : DEFAULT_PLUS_THEME.theme;
  return {
    theme,
    accent: typeof input.accent === "string" && HEX.test(input.accent) ? input.accent.toLowerCase() : "",
    uiFont: sanitizeFontValue(input.uiFont ?? legacyFont),
    chatFont: sanitizeFontValue(input.chatFont),
    codeFont: sanitizeFontValue(input.codeFont),
    // v2's `customCss` defaulted to true and leaked custom.css into every
    // theme; it is deliberately not migrated.
    customCssOverlay: input.customCssOverlay === true,
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
    "--plus-fill": accent,
    "--plus-fill-hover": `color-mix(in srgb, ${accent} 86%, black)`,
    "--plus-fill-text": "#ffffff",
    "--plus-marker": `color-mix(in srgb, ${accent} 80%, var(--text-muted))`,
    "--plus-tint": accent,
    "--plus-inline-code": accent,
    "--plus-inline-code-bg": `color-mix(in srgb, ${accent} 10%, transparent)`,
  };
}

const ACCENT_PROPERTY_NAMES = Object.keys(accentProperties("#000000"));
/** Accent properties beyond the upstream ones, in accentExtra() order (init script). */
const ACCENT_EXTRA_KEYS = ["--plus-fill", "--plus-fill-hover", "--plus-fill-text", "--plus-marker", "--plus-tint", "--plus-inline-code", "--plus-inline-code-bg"];

export interface UserThemeCache {
  id: string;
  base: ThemeBase;
  css: string;
}

export function readUserThemeCache(): UserThemeCache | null {
  try {
    const raw = window.localStorage.getItem(PLUS_USER_THEME_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<UserThemeCache> : null;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.css !== "string") return null;
    return { id: parsed.id, base: parsed.base === "clean" ? "clean" : "native", css: parsed.css };
  } catch {
    return null;
  }
}

export function writeUserThemeCache(cache: UserThemeCache | null): void {
  try {
    if (cache) window.localStorage.setItem(PLUS_USER_THEME_CACHE_KEY, JSON.stringify(cache));
    else window.localStorage.removeItem(PLUS_USER_THEME_CACHE_KEY);
  } catch {
    // Best-effort: a theme too large for storage only loses the first-paint cache.
  }
}

/** Put the imported theme's CSS into its <style>, last in <head>. */
export function setUserThemeCss(css: string | null): void {
  if (typeof document === "undefined") return;
  let style = document.getElementById(PLUS_USER_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (css === null) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = PLUS_USER_THEME_STYLE_ID;
  }
  // Keep it after the custom.css <link> so the theme wins at equal specificity.
  document.head.appendChild(style);
  if (style.textContent !== css) style.textContent = css;
}

/**
 * Switch the shared custom.css <link> on or off.
 *
 * `link.disabled` alone is not enough: a sheet that was already loading when
 * the attribute was set (the link starts loading during HTML parsing, before
 * the init script runs) still applies, so custom.css leaked into every theme.
 * The sheet itself is disabled too, now and on every later load.
 */
export function setCustomCssEnabled(enabled: boolean): void {
  if (typeof document === "undefined") return;
  const link = document.querySelector<HTMLLinkElement>("link[data-custom-css]");
  if (!link) return;
  link.dataset.plusOff = enabled ? "0" : "1";
  link.disabled = !enabled;
  if (link.sheet) link.sheet.disabled = !enabled;
  if (!link.dataset.plusGuard) {
    link.dataset.plusGuard = "1";
    link.addEventListener("load", () => {
      if (link.sheet) link.sheet.disabled = link.dataset.plusOff === "1";
    });
  }
}

/**
 * Apply settings to <html> and the custom.css <link>. `userBase` is the base
 * of the active imported theme when known. Browser only.
 */
export function applyPlusTheme(settings: PlusThemeSettings, userBase?: ThemeBase): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const builtin = findBuiltinTheme(settings.theme);
  root.dataset.plusTheme = settings.theme;
  const cached = readUserThemeCache();
  const cachedBase = cached && settings.theme === `${USER_THEME_PREFIX}${cached.id}` ? cached.base : undefined;
  root.dataset.plusStyle = builtin?.base ?? userBase ?? cachedBase ?? "native";
  for (const name of ACCENT_PROPERTY_NAMES) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(accentProperties(settings.accent))) root.style.setProperty(name, value);
  const roles: Array<[FontRole, string]> = [["ui", settings.uiFont], ["chat", settings.chatFont], ["code", settings.codeFont]];
  for (const [role, value] of roles) {
    const stack = fontStack(value, role);
    if (stack) {
      root.style.setProperty(`--plus-font-${role}`, stack);
      root.dataset[`plus${role[0].toUpperCase()}${role.slice(1)}Font`] = "";
    } else {
      root.style.removeProperty(`--plus-font-${role}`);
      delete root.dataset[`plus${role[0].toUpperCase()}${role.slice(1)}Font`];
    }
  }
  if (!isUserTheme(settings.theme)) setUserThemeCss(null);
  setCustomCssEnabled(settings.customCssOverlay);
}

/**
 * Runs in <head> before first paint; mirrors applyPlusTheme without imports.
 * `bases` maps built-in ids to their base.
 */
export function plusThemeInitScript(bases: Record<string, ThemeBase>): string {
  return `(function(){try{var r=document.documentElement;var s={};try{s=JSON.parse(localStorage.getItem(${JSON.stringify(PLUS_THEME_STORAGE_KEY)})||"{}")||{}}catch(e){}var B=${JSON.stringify(bases)};var t=typeof s.theme==="string"?s.theme:(s.style==="native"||s.style==="clean"?s.style:${JSON.stringify(DEFAULT_THEME_ID)});var u=t.indexOf(${JSON.stringify(USER_THEME_PREFIX)})===0;if(!u&&!B[t])t=${JSON.stringify(DEFAULT_THEME_ID)};r.dataset.plusTheme=t;var base=B[t]||"native";if(u){try{var c=JSON.parse(localStorage.getItem(${JSON.stringify(PLUS_USER_THEME_CACHE_KEY)})||"null");if(c&&c.id===t.slice(5)&&typeof c.css==="string"){base=c.base==="clean"?"clean":"native";var st=document.createElement("style");st.id=${JSON.stringify(PLUS_USER_THEME_STYLE_ID)};st.textContent=c.css;document.head.appendChild(st)}}catch(e){}}r.dataset.plusStyle=base;function accentExtra(a){return [a,"color-mix(in srgb, "+a+" 86%, black)","#ffffff","color-mix(in srgb, "+a+" 80%, var(--text-muted))",a,a,"color-mix(in srgb, "+a+" 10%, transparent)"]}var F=${JSON.stringify(FONT_FALLBACKS)};var G=${JSON.stringify([...GENERIC_FAMILIES])};function stack(v,k){if(typeof v!=="string")return null;var p=v.split(",").map(function(x){return x.replace(/["'\\\\;{}<>()]/g,"").trim()}).filter(Boolean);if(!p.length)return null;return p.map(function(n){return G.indexOf(n.toLowerCase())>=0?n:'"'+n+'"'}).join(", ")+", "+F[k]}var L={inter:"Inter",harmony:"HarmonyOS Sans SC",misans:"MiSans",serif:"Georgia, Noto Serif SC, SimSun"};var R=[["ui","Ui",s.uiFont!=null?s.uiFont:L[s.font]],["chat","Chat",s.chatFont],["code","Code",s.codeFont]];for(var i=0;i<R.length;i++){var v=stack(R[i][2],R[i][0]);if(v){r.style.setProperty("--plus-font-"+R[i][0],v);r.dataset["plus"+R[i][1]+"Font"]=""}}var a=typeof s.accent==="string"&&/^#[0-9a-f]{6}$/i.test(s.accent)?s.accent:"";if(a){r.style.setProperty("--accent",a);r.style.setProperty("--accent-hover","color-mix(in srgb, "+a+" 86%, black)");r.style.setProperty("--accent-contrast","#ffffff");r.style.setProperty("--accent-soft","color-mix(in srgb, "+a+" 12%, transparent)");r.style.setProperty("--accent-border","color-mix(in srgb, "+a+" 42%, transparent)");r.style.setProperty("--focus-ring","color-mix(in srgb, "+a+" 40%, transparent)");r.style.setProperty("--selection","color-mix(in srgb, "+a+" 24%, transparent)");var A=${JSON.stringify(ACCENT_EXTRA_KEYS)};var X=accentExtra(a);for(var j=0;j<A.length;j++)r.style.setProperty(A[j],X[j])}var l=document.querySelector("link[data-custom-css]");if(l){var off=s.customCssOverlay!==true;l.dataset.plusOff=off?"1":"0";l.dataset.plusGuard="1";l.addEventListener("load",function(){if(l.sheet)l.sheet.disabled=l.dataset.plusOff==="1"});if(off){l.disabled=true;if(l.sheet)l.sheet.disabled=true}}}catch(e){}})();`;
}
