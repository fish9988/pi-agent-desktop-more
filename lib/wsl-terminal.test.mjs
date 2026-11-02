import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../", import.meta.url)) },
  moduleCache: false,
});
const {
  clearWslReadyCache,
  defaultWslProbe,
  nativeTerminalLaunch,
  resolveTerminalLaunch,
  wslCommandArgs,
  wslInteractiveArgs,
} = await jiti.import("./wsl-terminal.ts");

const POWERSHELL = { path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe", args: ["-NoLogo"], label: "PowerShell 7" };
const native = () => POWERSHELL;

function probe(overrides = {}) {
  return {
    list: async () => ({
      available: true,
      distros: [
        { name: "Ubuntu-24.04", isDefault: true },
        { name: "Debian", isDefault: false },
      ],
      defaultDistro: "Ubuntu-24.04",
      error: null,
    }),
    canEnter: async () => null,
    ...overrides,
  };
}

const preferences = (patch = {}) => ({ backend: "wsl", distro: "", shellCommands: false, ...patch });

test("without the WSL backend the plan is exactly the native shell", async () => {
  const plan = await resolveTerminalLaunch("C:\\repo", {
    preferences: preferences({ backend: "native" }),
    native,
    probe: probe(),
  });
  assert.deepEqual(plan, {
    file: POWERSHELL.path,
    args: ["-NoLogo"],
    cwd: "C:\\repo",
    backend: { kind: "native" },
  });
});

test("the WSL backend starts wsl.exe in the translated directory", async () => {
  clearWslReadyCache();
  const entered = [];
  const plan = await resolveTerminalLaunch("C:\\a b\\my repo", {
    preferences: preferences(),
    native,
    probe: probe({
      canEnter: async (distro, linuxCwd) => { entered.push([distro, linuxCwd]); return null; },
    }),
  });
  assert.equal(plan.file, "wsl.exe");
  // "" follows the WSL default distribution, so no -d is passed.
  assert.deepEqual(plan.args, ["--cd", "/mnt/c/a b/my repo"]);
  assert.equal(plan.cwd, "C:\\a b\\my repo");
  assert.deepEqual(plan.backend, { kind: "wsl", distro: "Ubuntu-24.04", linuxCwd: "/mnt/c/a b/my repo" });
  assert.deepEqual(entered, [[null, "/mnt/c/a b/my repo"]]);
});

test("another drive translates too and an explicit distro is passed with -d", async () => {
  const plan = await resolveTerminalLaunch("D:\\Pi Agent Plus", {
    preferences: preferences({ distro: "Debian" }),
    native,
    probe: probe(),
  });
  assert.deepEqual(plan.args, ["-d", "Debian", "--cd", "/mnt/d/Pi Agent Plus"]);
  assert.equal(plan.backend.distro, "Debian");
  assert.equal(plan.backend.linuxCwd, "/mnt/d/Pi Agent Plus");
});

test("a \\\\wsl.localhost cwd names its own distro and keeps its Linux path", async () => {
  const entered = [];
  const plan = await resolveTerminalLaunch("\\\\wsl.localhost\\Ubuntu-24.04\\home\\lai\\repo", {
    preferences: preferences({ distro: "Debian" }),
    native,
    probe: probe({ canEnter: async (distro) => { entered.push(distro); return null; } }),
  });
  assert.deepEqual(plan.args, ["-d", "Ubuntu-24.04", "--cd", "/home/lai/repo"]);
  assert.equal(plan.backend.distro, "Ubuntu-24.04");
  assert.equal(plan.backend.linuxCwd, "/home/lai/repo");
  assert.deepEqual(entered, ["Ubuntu-24.04"]);
});

test("WSL problems fall back to the native shell with a readable warning", async () => {
  const cases = [
    {
      name: "wsl.exe missing",
      probe: probe({ list: async () => ({ available: false, distros: [], defaultDistro: null, error: "spawn wsl.exe ENOENT" }) }),
      cwd: "C:\\repo",
      expected: /ENOENT/,
    },
    {
      name: "selected distro gone",
      probe: probe(),
      prefs: { distro: "Arch" },
      cwd: "C:\\repo",
      expected: /Arch/,
    },
    {
      name: "cwd is a network share",
      probe: probe(),
      cwd: "\\\\server\\share\\repo",
      expected: /UNC/,
    },
    {
      name: "cannot enter the directory",
      probe: probe({ canEnter: async () => "WSL 无法进入目录 /mnt/c/repo（退出码 0）" }),
      cwd: "C:\\repo",
      expected: /无法进入目录/,
    },
    {
      name: "listing throws",
      probe: probe({ list: async () => { throw new Error("boom"); } }),
      cwd: "C:\\repo",
      expected: /boom/,
    },
    {
      name: "not Windows",
      probe: probe(),
      cwd: "C:\\repo",
      platform: "linux",
      expected: /Windows/,
    },
  ];

  for (const scenario of cases) {
    const plan = await resolveTerminalLaunch(scenario.cwd, {
      preferences: preferences(scenario.prefs ?? {}),
      native,
      probe: scenario.probe,
      platform: scenario.platform ?? "win32",
    });
    assert.equal(plan.file, POWERSHELL.path, scenario.name);
    assert.deepEqual(plan.args, ["-NoLogo"], scenario.name);
    assert.equal(plan.backend.kind, "native", scenario.name);
    assert.match(plan.backend.warning, scenario.expected, scenario.name);
    assert.match(plan.backend.warning, /PowerShell 7/, scenario.name);
  }
});

test("a native-shell failure still throws instead of hiding the problem", async () => {
  await assert.rejects(
    () => resolveTerminalLaunch("C:\\repo", {
      preferences: preferences(),
      native: () => { throw new Error("The selected terminal is unavailable."); },
      probe: probe({ list: async () => ({ available: false, distros: [], defaultDistro: null, error: "no wsl" }) }),
    }),
    /selected terminal is unavailable/,
  );
});

test("the probe repeats the cd inside bash because --cd alone exits 0 on a missing directory", async () => {
  clearWslReadyCache();
  const calls = [];
  const runResult = (overrides) => ({
    code: 0,
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    error: null,
    timedOut: false,
    ...overrides,
  });

  const ready = defaultWslProbe({
    run: async (args) => {
      calls.push(args);
      return runResult({ stdout: Buffer.from("/mnt/c/it's here\n__PI_WSL_READY__\n") });
    },
  });
  assert.equal(await ready.canEnter("Debian", "/mnt/c/it's here"), null);
  assert.deepEqual(calls[0].slice(0, 7), ["-d", "Debian", "--cd", "/mnt/c/it's here", "--exec", "bash", "-lc"]);
  // A single quote in the workspace path must not break the inner cd.
  assert.equal(calls[0][7], "cd '/mnt/c/it'\\''s here' && { pwd; echo __PI_WSL_READY__; }");

  // Cached: the second terminal in the same directory costs no wsl.exe call.
  assert.equal(await ready.canEnter("Debian", "/mnt/c/it's here"), null);
  assert.equal(calls.length, 1);
  clearWslReadyCache();
});

test("a probe without the sentinel reports why the directory is unusable", async () => {
  clearWslReadyCache();
  const probe = defaultWslProbe({
    run: async () => ({
      code: 0,
      // wsl.exe still runs the command from a fallback directory when --cd
      // fails, so only the inner cd's sentinel proves the path was entered.
      stdout: Buffer.from("/home/lai\n"),
      stderr: Buffer.from("<3>WSL ERROR: CreateProcessCommon:867: chdir(/mnt/c/gone) failed 2\n"),
      error: null,
      timedOut: false,
    }),
  });
  const problem = await probe.canEnter(null, "/mnt/c/gone");
  assert.match(problem, /无法进入工作目录 \/mnt\/c\/gone/);
  assert.match(problem, /chdir\(\/mnt\/c\/gone\) failed/);

  const broken = defaultWslProbe({
    run: async () => ({ code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: "spawn wsl.exe ENOENT", timedOut: false }),
  });
  assert.equal(await broken.canEnter(null, "/mnt/c/x"), "spawn wsl.exe ENOENT");
});

test("nativeTerminalLaunch and the invocation builders are the single source of args", () => {
  assert.deepEqual(nativeTerminalLaunch("C:\\repo", POWERSHELL), {
    file: POWERSHELL.path,
    args: ["-NoLogo"],
    cwd: "C:\\repo",
    backend: { kind: "native" },
  });
  assert.deepEqual(wslInteractiveArgs("Ubuntu-24.04", "/mnt/c/x"), ["-d", "Ubuntu-24.04", "--cd", "/mnt/c/x"]);
  assert.deepEqual(wslInteractiveArgs(null, "/home/x"), ["--cd", "/home/x"]);
  assert.deepEqual(
    wslCommandArgs("Ubuntu-24.04", "/mnt/c/x", "echo 'a b'"),
    ["-d", "Ubuntu-24.04", "--cd", "/mnt/c/x", "--exec", "bash", "-lc", "echo 'a b'"],
  );
  assert.deepEqual(wslCommandArgs("", "/mnt/c/x", "pwd"), ["--cd", "/mnt/c/x", "--exec", "bash", "-lc", "pwd"]);
});
