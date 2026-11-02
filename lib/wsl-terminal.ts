import { resolveTerminalShell } from "./terminal-settings";
import type { TerminalShell } from "./terminal-shells";
import { listWslDistros } from "./wsl-distros";
import { decodeWslOutput, runWsl, WSL_EXECUTABLE } from "./wsl-process";
import { windowsToWslPath } from "./wsl-paths";
import { readWslPreferences } from "./wsl-preferences";
import type { TerminalBackendInfo, TerminalLaunchPlan, WslDistroList, WslPreferences } from "./wsl-types";

// Choosing the shell behind one workspace terminal tab.
//
// The terminal itself stays a node-pty session (ConPTY on Windows): a WSL
// terminal is `wsl.exe -d <distro> --cd <linux cwd>` with no `--exec`, which
// hands the PTY to the distro's interactive shell. Everything WSL-specific is
// decided here, before the PTY exists, so a broken WSL never leaves a dead tab:
// each failure answers a native-shell plan plus a readable `warning`.

const READY_CACHE_MS = 60_000;
const READY_TIMEOUT_MS = 20_000;
const LIST_TIMEOUT_MS = 10_000;
// Printed by the probe after a successful cd. `wsl.exe --cd` to a missing
// directory does NOT fail: it reports the chdir on stderr, exits 0 and then runs
// the command from wherever it could start, so neither the exit code nor the
// sentinel alone proves the workspace is reachable. The probe therefore repeats
// the cd inside bash and only prints the sentinel after it succeeded.
const READY_SENTINEL = "__PI_WSL_READY__";

/** POSIX single-quote: `it's` → `'it'\''s'`. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

declare global {
  var __piWslReadyCache: Map<string, number> | undefined;
}

export interface WslProbe {
  list: () => Promise<WslDistroList>;
  /** null when a shell can start in `linuxCwd`; otherwise the readable reason. */
  canEnter: (distro: string | null, linuxCwd: string) => Promise<string | null>;
}

function readyCache(): Map<string, number> {
  if (!globalThis.__piWslReadyCache) globalThis.__piWslReadyCache = new Map();
  return globalThis.__piWslReadyCache;
}

/** Test hook: forget which directories already proved reachable. */
export function clearWslReadyCache(): void {
  globalThis.__piWslReadyCache = undefined;
}

export function wslInteractiveArgs(distro: string | null | undefined, linuxCwd: string): string[] {
  return [...(distro ? ["-d", distro] : []), "--cd", linuxCwd];
}

/** One-shot command form: `wsl.exe --cd <dir> --exec bash -lc <cmd>`. */
export function wslCommandArgs(distro: string | null | undefined, linuxCwd: string, command: string): string[] {
  return [...(distro ? ["-d", distro] : []), "--cd", linuxCwd, "--exec", "bash", "-lc", command];
}

export function defaultWslProbe(options: {
  listTimeoutMs?: number;
  readyTimeoutMs?: number;
  /** Injected in tests; defaults to the real wsl.exe runner. */
  run?: typeof runWsl;
} = {}): WslProbe {
  const { listTimeoutMs = LIST_TIMEOUT_MS, readyTimeoutMs = READY_TIMEOUT_MS, run = runWsl } = options;
  return {
    list: () => listWslDistros({ timeoutMs: listTimeoutMs }),
    async canEnter(distro, linuxCwd) {
      const key = `${distro ?? ""}\u0000${linuxCwd}`;
      const cache = readyCache();
      const cached = cache.get(key);
      if (cached !== undefined && cached > Date.now()) return null;

      const result = await run(
        [...wslInteractiveArgs(distro, linuxCwd), "--exec", "bash", "-lc", `cd ${shellQuote(linuxCwd)} && { pwd; echo ${READY_SENTINEL}; }`],
        { timeoutMs: readyTimeoutMs },
      );
      const stdout = decodeWslOutput(result.stdout);
      if (!result.error && stdout.includes(READY_SENTINEL)) {
        cache.set(key, Date.now() + READY_CACHE_MS);
        return null;
      }
      const stderr = decodeWslOutput(result.stderr)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-1)[0];
      if (result.error) return result.error;
      return `WSL 无法进入工作目录 ${linuxCwd}${stderr ? `（${stderr}）` : ""}`;
    },
  };
}

export function nativeTerminalLaunch(cwd: string, shell: TerminalShell = resolveTerminalShell()): TerminalLaunchPlan {
  return { file: shell.path, args: shell.args, cwd, backend: { kind: "native" } };
}

function sameDistro(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export interface ResolveTerminalLaunchOptions {
  preferences?: WslPreferences;
  /** Injected in tests; defaults to the real shell discovery. */
  native?: () => TerminalShell;
  probe?: WslProbe;
  platform?: NodeJS.Platform;
}

/**
 * Decide how one terminal tab starts. Never throws for WSL problems and never
 * silently switches backends: a fallback keeps the native shell and says why.
 */
export async function resolveTerminalLaunch(
  cwd: string,
  options: ResolveTerminalLaunchOptions = {},
): Promise<TerminalLaunchPlan> {
  const preferences = options.preferences ?? readWslPreferences();
  const nativeShell = options.native ?? resolveTerminalShell;

  const fallback = (reason: string): TerminalLaunchPlan => {
    const shell = nativeShell();
    return {
      file: shell.path,
      args: shell.args,
      cwd,
      backend: { kind: "native", warning: `WSL 后端不可用，已回退到 ${shell.label}：${reason}` },
    };
  };

  if (preferences.backend !== "wsl") return nativeTerminalLaunch(cwd, nativeShell());
  if ((options.platform ?? process.platform) !== "win32") return fallback("WSL 只在 Windows 上可用");

  const probe = options.probe ?? defaultWslProbe();
  let distros: WslDistroList;
  try {
    distros = await probe.list();
  } catch (error) {
    return fallback(error instanceof Error ? error.message : String(error));
  }
  if (!distros.available) return fallback(distros.error ?? "未检测到 WSL 发行版");

  if (preferences.distro && !distros.distros.some((distro) => sameDistro(distro.name, preferences.distro))) {
    return fallback(`发行版 ${preferences.distro} 未安装`);
  }

  const translated = windowsToWslPath(cwd);
  if (!translated.ok) return fallback(translated.reason);

  // A `\\wsl.localhost\<distro>\...` cwd names its own distro; otherwise an
  // explicit choice wins and "" follows the WSL default.
  const distro = translated.distro ?? (preferences.distro || null);
  const displayDistro = distro ?? distros.defaultDistro ?? distros.distros[0]?.name ?? "";
  const backend: TerminalBackendInfo = { kind: "wsl", distro: displayDistro, linuxCwd: translated.path };

  const problem = await probe.canEnter(distro, translated.path);
  if (problem) return fallback(problem);

  return {
    file: WSL_EXECUTABLE,
    args: wslInteractiveArgs(distro, translated.path),
    cwd,
    backend,
  };
}
