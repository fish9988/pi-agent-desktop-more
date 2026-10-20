import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { compileUserThemeCss, sanitizeThemeDefinition, type ThemeBase, type ThemeDefinition } from "./plus-theme-catalog";

/**
 * Plus: imported themes, one CSS file each under
 * `<agentDir>/desktop/plus-themes/<id>.css`. The first line holds the
 * metadata as a comment so a theme file is self-contained and can be
 * copied between machines:
 *
 *   /* plus-theme: {"name":"Claude","base":"native"} *\/
 *
 * Themes made with the palette editor also carry a "definition" (palette,
 * typography, radius) in that header; the CSS body then holds only extras
 * and the served CSS is the generated tokens followed by the body.
 */

export interface UserThemeMeta {
  id: string;
  name: string;
  base: ThemeBase;
  updatedAt: number;
  size: number;
  /** Colours picked from the CSS for the card preview, when found. */
  swatch: { bg?: string; panel?: string; accent?: string; text?: string };
  /** Dark-mode card preview, for palette themes. */
  swatchDark?: { bg?: string; panel?: string; accent?: string; text?: string };
  /** Edited with the palette editor. */
  hasPalette: boolean;
}

export interface UserTheme extends UserThemeMeta {
  /** The theme's own CSS (extras when a definition exists). */
  css: string;
  definition?: ThemeDefinition;
  /** What actually gets applied: generated tokens + css. */
  compiled: string;
}

export const MAX_THEME_BYTES = 1024 * 1024;
const ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const HEADER_PATTERN = /^\/\*\s*plus-theme:\s*(\{.*?\})\s*\*\/\r?\n?/;

export class ThemeError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function themesDir(agentDir: string): string {
  return path.join(agentDir, "desktop", "plus-themes");
}

export function isValidThemeId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function normalizeThemeName(raw: unknown): string {
  if (typeof raw !== "string") throw new ThemeError("Theme name is required");
  const name = raw.replace(/[\r\n*/]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) throw new ThemeError("Theme name is required");
  return name;
}

export function normalizeBase(raw: unknown): ThemeBase {
  return raw === "clean" ? "clean" : "native";
}

/** Split a stored file into metadata and the CSS body. */
export function parseThemeFile(text: string): { name?: string; base?: ThemeBase; definition?: ThemeDefinition; css: string } {
  const match = HEADER_PATTERN.exec(text);
  if (!match) return { css: text };
  try {
    const meta = JSON.parse(match[1]) as { name?: unknown; base?: unknown; definition?: unknown };
    return {
      name: typeof meta.name === "string" ? meta.name : undefined,
      base: normalizeBase(meta.base),
      definition: sanitizeThemeDefinition(meta.definition),
      css: text.slice(match[0].length),
    };
  } catch {
    return { css: text };
  }
}

export function serializeThemeFile(name: string, base: ThemeBase, css: string, definition?: ThemeDefinition): string {
  // "*/" cannot occur in the JSON: names drop "*" and "/", colours and font
  // lists are sanitised, but escape defensively anyway.
  const meta = JSON.stringify(definition ? { name, base, definition } : { name, base }).replace(/\*\//g, "*\\u002f");
  return `/* plus-theme: ${meta} */\n${css}`;
}

function firstValue(css: string, variable: string): string | undefined {
  const match = new RegExp(`${variable.replace(/-/g, "\\-")}\\s*:\\s*([^;}{]+)`).exec(css);
  const value = match?.[1]?.replace(/!important/i, "").trim();
  return value && !/var\(/.test(value) && value.length < 80 ? value : undefined;
}

export function themeSwatch(css: string): UserThemeMeta["swatch"] {
  return {
    bg: firstValue(css, "--workbench-bg") ?? firstValue(css, "--bg"),
    panel: firstValue(css, "--bg-panel") ?? firstValue(css, "--bg"),
    accent: firstValue(css, "--accent"),
    text: firstValue(css, "--text"),
  };
}

export function slugifyThemeName(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40);
  const suffix = randomBytes(3).toString("hex");
  return ascii ? `${ascii}-${suffix}` : `theme-${suffix}`;
}

function checkCss(css: unknown): string {
  if (typeof css !== "string") throw new ThemeError("css must be a string");
  if (Buffer.byteLength(css, "utf8") > MAX_THEME_BYTES) throw new ThemeError("A theme is limited to 1 MB", 413);
  return css;
}

async function readTheme(dir: string, id: string): Promise<UserTheme> {
  if (!isValidThemeId(id)) throw new ThemeError("Invalid theme id");
  const file = path.join(dir, `${id}.css`);
  let text: string;
  let stat;
  try {
    [text, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
  } catch {
    throw new ThemeError("Theme not found", 404);
  }
  const parsed = parseThemeFile(text);
  const def = parsed.definition;
  const fromPalette = (p: ThemeDefinition["light"]) => (p ? { bg: p.workbench, panel: p.panel, accent: p.fill ?? p.accent, text: p.text } : undefined);
  return {
    id,
    name: parsed.name ?? id,
    base: def ? "clean" : parsed.base ?? "native",
    css: parsed.css,
    definition: def,
    compiled: compileUserThemeCss(def, parsed.css),
    updatedAt: Math.round(stat.mtimeMs),
    size: stat.size,
    swatch: fromPalette(def?.light) ?? themeSwatch(parsed.css),
    swatchDark: fromPalette(def?.dark),
    hasPalette: Boolean(def),
  };
}

async function writeAtomic(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, text, "utf8");
  await fs.rename(temp, file);
}

export async function listUserThemes(dir: string): Promise<UserThemeMeta[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const themes: UserThemeMeta[] = [];
  for (const name of names) {
    if (!name.endsWith(".css")) continue;
    const id = name.slice(0, -4);
    if (!isValidThemeId(id)) continue;
    try {
      const { css: _css, compiled: _compiled, definition: _definition, ...meta } = await readTheme(dir, id);
      themes.push(meta);
    } catch {
      // unreadable file: skip
    }
  }
  return themes.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUserTheme(dir: string, id: string): Promise<UserTheme> {
  return readTheme(dir, id);
}

export interface ThemeInput {
  name?: unknown;
  base?: unknown;
  css?: unknown;
  /** Palette definition; `null` on update removes it. */
  definition?: unknown;
}

export async function createUserTheme(dir: string, input: ThemeInput): Promise<UserTheme> {
  const name = normalizeThemeName(input.name);
  const definition = sanitizeThemeDefinition(input.definition);
  const base = definition ? "clean" : normalizeBase(input.base);
  const css = checkCss(input.css ?? "");
  const id = slugifyThemeName(name);
  await writeAtomic(path.join(dir, `${id}.css`), serializeThemeFile(name, base, css, definition));
  return readTheme(dir, id);
}

export async function updateUserTheme(dir: string, id: string, patch: ThemeInput): Promise<UserTheme> {
  const current = await readTheme(dir, id);
  const name = patch.name === undefined ? current.name : normalizeThemeName(patch.name);
  const definition = patch.definition === undefined ? current.definition : patch.definition === null ? undefined : sanitizeThemeDefinition(patch.definition);
  const base = definition ? "clean" : patch.base === undefined ? current.base : normalizeBase(patch.base);
  const css = patch.css === undefined ? current.css : checkCss(patch.css);
  await writeAtomic(path.join(dir, `${id}.css`), serializeThemeFile(name, base, css, definition));
  return readTheme(dir, id);
}

export async function deleteUserTheme(dir: string, id: string): Promise<void> {
  if (!isValidThemeId(id)) throw new ThemeError("Invalid theme id");
  try {
    await fs.unlink(path.join(dir, `${id}.css`));
  } catch {
    throw new ThemeError("Theme not found", 404);
  }
}

/** mtime-size fingerprint for hot reload, or "none". */
export async function userThemeVersion(dir: string, id: string): Promise<string> {
  if (!isValidThemeId(id)) return "none";
  try {
    const stat = await fs.stat(path.join(dir, `${id}.css`));
    return `${Math.round(stat.mtimeMs)}-${stat.size}`;
  } catch {
    return "none";
  }
}
