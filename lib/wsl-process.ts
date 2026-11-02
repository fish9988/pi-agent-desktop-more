import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { constants as osConstants } from "node:os";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { windowsToWslPath, type WslPathResult } from "./wsl-paths";

export const WSL_EXECUTABLE = "wsl.exe";

const MAX_TIMEOUT_MS = 2_147_483_647;

const WSL_FORWARDED_PI_VARS: ReadonlyArray<{ name: string; entry: string }> = [
  { name: "PI_SESSION_ID", entry: "PI_SESSION_ID" },
  { name: "PI_SESSION_FILE", entry: "PI_SESSION_FILE/p" },
  { name: "PI_PROVIDER", entry: "PI_PROVIDER" },
  { name: "PI_MODEL", entry: "PI_MODEL" },
  { name: "PI_REASONING_LEVEL", entry: "PI_REASONING_LEVEL" },
];

/**
 * wsl.exe writes its own output in UTF-16LE on most builds, which turns into
 * mojibake in a UTF-8 terminal. `WSL_UTF8=1` makes listings and error messages
 * UTF-8; decoding still accepts UTF-16 because older WSL builds ignore it.
 */
export function wslEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const existingEntries = (base.WSLENV ?? "")
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
  const existingNames = new Set(existingEntries.map((part) => part.split("/")[0]));
  for (const { name, entry } of WSL_FORWARDED_PI_VARS) {
    const value = base[name];
    if (typeof value === "string" && value.length > 0 && !existingNames.has(name)) {
      existingEntries.push(entry);
      existingNames.add(name);
    }
  }
  const env: NodeJS.ProcessEnv = { ...base, WSL_UTF8: "1" };
  if (existingEntries.length > 0) {
    env.WSLENV = existingEntries.join(":");
  }
  return env;
}

/**
 * Decode what `wsl.exe` printed. A UTF-16LE stream is full of NUL bytes when the
 * text is ASCII (`-l -q` names, table headers), and a stderr message that is
 * entirely CJK still decodes as invalid UTF-8, so either signal selects UTF-16.
 */
export function decodeWslOutput(input: Buffer | string): string {
  if (typeof input === "string") return input.replace(/^\uFEFF/, "");
  if (input.length === 0) return "";
  const hasUtf16Bom = input.length >= 2 && input[0] === 0xff && input[1] === 0xfe;
  const hasUtf8Bom = input.length >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf;
  if (hasUtf16Bom) return input.subarray(2).toString("utf16le").replace(/^\uFEFF/, "");
  if (hasUtf8Bom) return input.subarray(3).toString("utf8").replace(/^\uFEFF/, "");
  const utf8 = input.toString("utf8");
  if (input.includes(0) || utf8.includes("\uFFFD")) {
    return input.toString("utf16le").replace(/^\uFEFF/, "");
  }
  return utf8.replace(/^\uFEFF/, "");
}

export interface WslRunResult {
  code: number | null;
  stdout: Buffer;
  stderr: Buffer;
  /** Spawn failure or platform refusal; null when the process actually ran. */
  error: string | null;
  timedOut: boolean;
}

/**
 * Kill `wsl.exe` and the Linux process tree behind it. Terminating the Windows
 * process alone leaves a long-running Linux child alive; `taskkill /T` reaches
 * the relay, which is what makes the Linux side exit (verified on WSL2).
 */
export function killWslProcessTree(pid: number | undefined, platform: NodeJS.Platform = process.platform): void {
  if (!pid) return;
  if (platform === "win32") {
    try {
      const killer = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
      killer.on("error", () => { /* best effort: the shell may already be gone */ });
    } catch {
      // Nothing else to do; the caller's close handler still settles.
    }
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already exited.
  }
}

export interface WslRunOptions {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  platform?: NodeJS.Platform;
}

/**
 * Run `wsl.exe` once and collect its output. Never rejects: a missing wsl.exe,
 * a timeout and a non-zero exit all come back as data, because every caller
 * (listing, `--cd` probe) has to turn them into a readable fallback anyway.
 */
export function runWsl(args: string[], options: WslRunOptions = {}): Promise<WslRunResult> {
  const { timeoutMs = 15_000, env, cwd, platform = process.platform } = options;
  if (platform !== "win32") {
    return Promise.resolve({
      code: null,
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      error: "WSL 只在 Windows 上可用",
      timedOut: false,
    });
  }

  return new Promise<WslRunResult>((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (result: WslRunResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(WSL_EXECUTABLE, args, {
        cwd,
        env: wslEnvironment(env),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      finish({
        code: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        error: error instanceof Error ? error.message : String(error),
        timedOut: false,
      });
      return;
    }

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error: Error) => {
      finish({ code: null, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), error: error.message, timedOut: false });
    });
    child.on("close", (code) => {
      finish({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), error: null, timedOut: false });
    });
    timer = setTimeout(() => {
      killWslProcessTree(child.pid, platform);
      // The close handler usually follows; settling here keeps a stuck relay
      // from blocking a settings request forever.
      finish({
        code: null,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        error: `wsl.exe 超时（${timeoutMs} ms）`,
        timedOut: true,
      });
    }, timeoutMs);
  });
}

export function wslInteractiveArgs(distro: string | null | undefined, linuxCwd: string): string[] {
  return [...(distro ? ["-d", distro] : []), "--cd", linuxCwd];
}

/** One-shot command form: `wsl.exe --cd <dir> --exec bash -lc <cmd>`. */
export function wslCommandArgs(distro: string | null | undefined, linuxCwd: string, command: string): string[] {
  return [...(distro ? ["-d", distro] : []), "--cd", linuxCwd, "--exec", "bash", "-lc", command];
}

export type WslSpawnProcess = (
  file: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface WslBashOptions {
  /** null or "" runs the WSL default distribution. */
  distro?: string | null;
  /** Injected in tests; defaults to the true Windows → Linux translation. */
  translateCwd?: (cwd: string) => WslPathResult;
  platform?: NodeJS.Platform;
  spawnProcess?: WslSpawnProcess;
  killTree?: (pid: number | undefined) => void;
}

/**
 * BashOperations that run one command inside WSL. `cwd` is the workspace cwd
 * (a Windows path) and is translated for every call, so a session in another
 * workspace or on another drive needs no extra setup.
 */
export function createWslBashOperations(options: WslBashOptions = {}): BashOperations {
  const {
    distro = null,
    translateCwd = windowsToWslPath,
    platform = process.platform,
    spawnProcess = (file, args, spawnOptions) => spawn(file, [...args], spawnOptions),
    killTree = (pid) => killWslProcessTree(pid, platform),
  } = options;

  return {
    exec(command, cwd, executionOptions) {
      const { onData, signal, timeout, env } = executionOptions;
      if (platform !== "win32") return Promise.reject(new Error("WSL 只在 Windows 上可用"));
      if (signal?.aborted) return Promise.reject(new Error("aborted"));

      const translated = translateCwd(cwd);
      if (!translated.ok) {
        return Promise.reject(new Error(`无法在 WSL 中运行命令：${translated.reason}（工作目录 ${cwd}）`));
      }
      const timeoutMs = typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0
        ? Math.min(timeout * 1000, MAX_TIMEOUT_MS)
        : undefined;
      const args = wslCommandArgs(distro, translated.path, command);

      return new Promise<{ exitCode: number | null }>((resolve, reject) => {
        let child: ChildProcess;
        try {
          child = spawnProcess(WSL_EXECUTABLE, args, {
            // No Windows cwd: `--cd` already puts the command in the Linux
            // directory, and a Windows-only cwd would fail for a WSL UNC path.
            env: wslEnvironment(env),
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          if (settled) return;
          settled = true;
          cleanup();
          killTree(child.pid);
          reject(new Error("aborted"));
        };

        child.stdout?.on("data", (chunk: Buffer) => onData(chunk));
        child.stderr?.on("data", (chunk: Buffer) => onData(chunk));
        child.on("error", (error: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        });
        child.on("close", (code: number | null, termSignal: NodeJS.Signals | null) => {
          if (settled) return;
          settled = true;
          cleanup();
          // wsl.exe exits with the Linux command's status; only a killed relay
          // has none, and then the shell convention keeps it a failure.
          resolve({ exitCode: code ?? (termSignal ? 128 + (osConstants.signals[termSignal] ?? 0) : 1) });
        });

        if (timeoutMs !== undefined) {
          timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            killTree(child.pid);
            reject(new Error(`timeout:${timeout}`));
          }, timeoutMs);
        }
        if (signal) {
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    },
  };
}
