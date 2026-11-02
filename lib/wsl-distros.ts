import type { WslDistro, WslDistroList } from "./wsl-types";
import { decodeWslOutput, runWsl, type WslRunResult } from "./wsl-process";

// `wsl.exe -l -q` / `-l -v` give the installed distributions. Both print a
// UTF-16LE, CRLF-terminated list on most Windows builds (and UTF-8 when
// WSL_UTF8=1), so parsing goes through decodeWslOutput() and then treats every
// line as one name.

export type WslListRunner = (args: string[], timeoutMs: number) => Promise<WslRunResult>;

export const defaultWslListRunner: WslListRunner = (args, timeoutMs) => runWsl(args, { timeoutMs });

/** A distribution name is a registry key: letters, digits, `.`, `_`, `-`. */
function isDistroName(value: string): boolean {
  return /^[\w.-]+$/.test(value) && value.toUpperCase() !== "NAME";
}

function lines(text: string): string[] {
  return text
    .replace(/\u0000/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** `wsl.exe -l -q`: one name per line, no header. */
export function parseWslDistroList(text: string): string[] {
  const names: string[] = [];
  for (const line of lines(text)) {
    if (isDistroName(line) && !names.includes(line)) names.push(line);
  }
  return names;
}

/**
 * `wsl.exe -l -v`: a `NAME STATE VERSION` table whose default row is marked
 * with `*`. The header is localized, so it is skipped by requiring the first
 * field to look like a distro name rather than by matching "NAME".
 */
export function parseWslVerboseList(text: string): { distros: WslDistro[]; defaultDistro: string | null } {
  const distros: WslDistro[] = [];
  let defaultDistro: string | null = null;
  for (const line of lines(text)) {
    const isDefault = line.startsWith("*");
    const body = isDefault ? line.slice(1).trim() : line;
    const name = body.split(/\s+/)[0] ?? "";
    if (!isDistroName(name)) continue;
    if (distros.some((distro) => distro.name === name)) continue;
    distros.push({ name, isDefault });
    if (isDefault) defaultDistro = name;
  }
  return { distros, defaultDistro };
}

export interface ListWslDistrosOptions {
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  runner?: WslListRunner;
  /** Cache lifetime; 0 disables the cache. */
  cacheMs?: number;
  now?: () => number;
}

interface WslDistroCacheEntry {
  expiresAt: number;
  value: WslDistroList;
}

declare global {
  var __piWslDistroCache: WslDistroCacheEntry | undefined;
}

const DISTRO_CACHE_MS = 30_000;

function failure(error: string): WslDistroList {
  return { available: false, distros: [], defaultDistro: null, error };
}

function readableFailure(result: WslRunResult): string {
  if (result.error) return result.error;
  const stderr = decodeWslOutput(result.stderr).trim();
  if (stderr) return stderr.split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? stderr;
  return `wsl.exe 退出码 ${result.code ?? "unknown"}`;
}

/**
 * Installed distributions plus the default one, for the settings dropdown.
 * Never throws: a missing wsl.exe is reported as `available: false` with a
 * message the settings panel can show.
 */
export async function listWslDistros(options: ListWslDistrosOptions = {}): Promise<WslDistroList> {
  const {
    platform = process.platform,
    timeoutMs = 10_000,
    runner = defaultWslListRunner,
    cacheMs = DISTRO_CACHE_MS,
    now = Date.now,
  } = options;

  if (platform !== "win32") return failure("WSL 只在 Windows 上可用");

  const cached = globalThis.__piWslDistroCache;
  if (cacheMs > 0 && cached && cached.expiresAt > now()) return cached.value;

  let result: WslDistroList;
  const verbose = await runner(["-l", "-v"], timeoutMs);
  if (!verbose.error && verbose.code === 0) {
    const parsed = parseWslVerboseList(decodeWslOutput(verbose.stdout));
    result = parsed.distros.length
      ? {
        available: true,
        distros: parsed.distros,
        defaultDistro: parsed.defaultDistro ?? parsed.distros[0].name,
        error: null,
      }
      : failure("没有已安装的 WSL 发行版");
  } else {
    // Windows 10 builds before `-l -v` existed (and a few WSL 1 setups) only
    // answer `-l -q`; that list has no default marker, so the first entry is
    // used as WSL itself would.
    const quiet = await runner(["-l", "-q"], timeoutMs);
    if (!quiet.error && quiet.code === 0) {
      const names = parseWslDistroList(decodeWslOutput(quiet.stdout));
      result = names.length
        ? {
          available: true,
          distros: names.map((name, index) => ({ name, isDefault: index === 0 })),
          defaultDistro: names[0],
          error: null,
        }
        : failure("没有已安装的 WSL 发行版");
    } else {
      result = failure(readableFailure(quiet.error ? quiet : verbose));
    }
  }

  if (cacheMs > 0) {
    globalThis.__piWslDistroCache = { expiresAt: now() + cacheMs, value: result };
  }
  return result;
}

/** Test hook: drop the cached listing. */
export function clearWslDistroCache(): void {
  globalThis.__piWslDistroCache = undefined;
}
