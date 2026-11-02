import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../", import.meta.url)) },
  moduleCache: false,
});
const { createWslBashOperations, resolveProjectBashOperations } = await jiti.import("./wsl-bash.ts");
const { usesWslShellCommands } = await jiti.import("./wsl-preferences.ts");

function fakeChild(pid = 4242) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function harness(overrides = {}) {
  const calls = [];
  const killed = [];
  const child = fakeChild();
  const operations = createWslBashOperations({
    distro: "Ubuntu-24.04",
    platform: "win32",
    spawnProcess: (file, args, options) => {
      calls.push({ file, args, options });
      return child;
    },
    killTree: (pid) => killed.push(pid),
    ...overrides,
  });
  return { operations, calls, killed, child };
}

test("a shell command runs through wsl.exe in the translated directory", async () => {
  const { operations, calls, child } = harness();
  const chunks = [];
  const execution = operations.exec("echo 'a b' && pwd", "C:\\a b\\my repo", {
    onData: (data) => chunks.push(data),
    env: { PATH: "C:\\Windows" },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "wsl.exe");
  assert.deepEqual(calls[0].args, [
    "-d", "Ubuntu-24.04", "--cd", "/mnt/c/a b/my repo", "--exec", "bash", "-lc", "echo 'a b' && pwd",
  ]);
  assert.equal(calls[0].options.env.WSL_UTF8, "1");
  assert.equal(calls[0].options.env.PATH, "C:\\Windows");
  assert.deepEqual(calls[0].options.stdio, ["ignore", "pipe", "pipe"]);
  // No Windows cwd: --cd already sets the Linux one.
  assert.equal(calls[0].options.cwd, undefined);

  child.stdout.emit("data", Buffer.from("a b\n"));
  child.stderr.emit("data", Buffer.from("warn\n"));
  child.emit("close", 7, null);
  assert.deepEqual(await execution, { exitCode: 7 });
  assert.deepEqual(chunks.map((chunk) => chunk.toString()), ["a b\n", "warn\n"]);
});

test("the default distro passes no -d", async () => {
  const { operations, calls, child } = harness({ distro: null });
  const execution = operations.exec("pwd", "C:\\repo", { onData: () => {} });
  assert.deepEqual(calls[0].args, ["--cd", "/mnt/c/repo", "--exec", "bash", "-lc", "pwd"]);
  child.emit("close", 0, null);
  assert.deepEqual(await execution, { exitCode: 0 });
});

test("a killed relay keeps the shell convention of a failed command", async () => {
  const { operations, child } = harness();
  const execution = operations.exec("sleep 100", "C:\\repo", { onData: () => {} });
  child.emit("close", null, "SIGKILL");
  assert.deepEqual(await execution, { exitCode: 137 });
});

test("abort kills the whole wsl.exe tree and rejects like the local shell", async () => {
  const { operations, killed, child } = harness();
  const controller = new AbortController();
  const execution = operations.exec("sleep 100", "C:\\repo", { onData: () => {}, signal: controller.signal });
  controller.abort();
  await assert.rejects(execution, /aborted/);
  assert.deepEqual(killed, [4242]);
  // A second close from the dying process must not resolve the rejection.
  child.emit("close", 0, null);
});

test("an already-aborted signal never starts wsl.exe", async () => {
  const { operations, calls } = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    operations.exec("pwd", "C:\\repo", { onData: () => {}, signal: controller.signal }),
    /aborted/,
  );
  assert.equal(calls.length, 0);
});

test("a timeout kills the tree and reports pi's timeout error shape", async () => {
  const { operations, killed, child } = harness();
  const execution = operations.exec("sleep 100", "C:\\repo", { onData: () => {}, timeout: 0.02 });
  await assert.rejects(execution, /timeout:0\.02/);
  assert.deepEqual(killed, [4242]);
  child.emit("close", 0, null);
});

test("a cwd WSL cannot reach is refused before spawning", async () => {
  const { operations, calls } = harness();
  await assert.rejects(
    operations.exec("pwd", "\\\\server\\share\\repo", { onData: () => {} }),
    /无法在 WSL 中运行命令.*UNC/,
  );
  assert.equal(calls.length, 0);
});

test("WSL shell commands are Windows-only and a spawn failure rejects", async () => {
  const linux = createWslBashOperations({ platform: "linux" });
  await assert.rejects(linux.exec("pwd", "/home/x", { onData: () => {} }), /Windows/);

  const broken = createWslBashOperations({
    platform: "win32",
    spawnProcess: () => { throw new Error("spawn wsl.exe ENOENT"); },
  });
  await assert.rejects(broken.exec("pwd", "C:\\repo", { onData: () => {} }), /ENOENT/);

  const { operations, child } = harness();
  const execution = operations.exec("pwd", "C:\\repo", { onData: () => {} });
  child.emit("error", new Error("relay died"));
  await assert.rejects(execution, /relay died/);
});

test("`!cmd` uses WSL only when both the backend and the shell-command switch are on", async () => {
  assert.equal(usesWslShellCommands({ backend: "wsl", distro: "", shellCommands: true }), true);
  assert.equal(usesWslShellCommands({ backend: "wsl", distro: "", shellCommands: false }), false);
  assert.equal(usesWslShellCommands({ backend: "native", distro: "", shellCommands: true }), false);

  // The wrapper rejects an unreachable cwd with the WSL message only on the WSL path.
  const wsl = resolveProjectBashOperations({ preferences: { backend: "wsl", distro: "Debian", shellCommands: true } });
  await assert.rejects(wsl.exec("pwd", "\\\\server\\share\\repo", { onData: () => {} }), /无法在 WSL 中运行命令/);

  const local = resolveProjectBashOperations({ preferences: { backend: "wsl", distro: "Debian", shellCommands: false } });
  await assert.rejects(local.exec("pwd", "\\\\server\\share\\repo", { onData: () => {} }), (error) => {
    assert.doesNotMatch(error.message, /无法在 WSL 中运行命令/);
    return true;
  });
});
