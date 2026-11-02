import { spawn } from "node:child_process";

export const WSL_EXECUTABLE = "wsl.exe";

/**
 * wsl.exe writes its own output in UTF-16LE on most builds, which turns into
 * mojibake in a UTF-8 terminal. `WSL_UTF8=1` makes listings and error messages
 * UTF-8; decoding still accepts UTF-16 because older WSL builds ignore it.
 */
export function wslEnvironment(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, WSL_UTF8: "1" };
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
