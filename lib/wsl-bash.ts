import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { constants as osConstants } from "node:os";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { createProjectCommandBashOperations } from "./project-command-env";
import { killWslProcessTree, wslEnvironment, WSL_EXECUTABLE } from "./wsl-process";
import { windowsToWslPath, type WslPathResult } from "./wsl-paths";
import { readWslPreferences, usesWslShellCommands } from "./wsl-preferences";
import { wslCommandArgs } from "./wsl-terminal";
import type { WslPreferences } from "./wsl-types";

// `!cmd` in the composer is pi's own `executeBash` with these operations, so a
// WSL shell command is the same RPC with `wsl.exe --cd <linux dir> --exec bash
// -lc <cmd>` in place of the local shell. Output streaming, exit codes, abort
// and timeouts keep pi's contract; only the process being started changes.

const MAX_TIMEOUT_MS = 2_147_483_647;

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

/**
 * The operations pi should use for `!cmd`: the unchanged local ones unless the
 * WSL backend is selected and "run shell commands in WSL" is on. The wrapper
 * keeps pi-web's environment sanitising and abort-settle behaviour.
 */
export function resolveProjectBashOperations(
  options: { shellPath?: string; preferences?: WslPreferences } = {},
): BashOperations {
  const preferences = options.preferences ?? readWslPreferences();
  if (!usesWslShellCommands(preferences)) {
    return createProjectCommandBashOperations({ shellPath: options.shellPath });
  }
  return createProjectCommandBashOperations({
    shellPath: options.shellPath,
    // Inside WSL a Windows `\.pi\agent\bin` entry on PATH would be a junk
    // directory; commands reach Windows binaries through WSL interop instead.
    agentBinDir: "",
    localOperations: createWslBashOperations({ distro: preferences.distro || null }),
  });
}
