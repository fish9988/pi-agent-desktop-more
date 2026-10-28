import assert from "node:assert/strict";
import test from "node:test";
import { discoverTerminalShells } from "./terminal-shells.ts";

function discover(platform, env, files, registered = "") {
  const available = new Set(files.map(path => platform === "win32" ? path.toLowerCase() : path));
  return discoverTerminalShells({
    platform,
    env,
    executable: path => available.has(platform === "win32" ? path.toLowerCase() : path),
    registeredShells: () => registered,
  });
}

const cmd = "C:\\Windows\\System32\\cmd.exe";
const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";

test("Windows detects executable paths with spaces and prefers PowerShell 7", () => {
  const result = discover("win32", { Path: '"C:\\Program Files\\PowerShell\\7";C:\\Windows\\System32', COMSPEC: cmd }, [cmd, powershell, pwsh]);
  assert.equal(result.defaultPath, pwsh);
  assert.deepEqual(result.shells.map(shell => shell.label), ["PowerShell 7", "Windows PowerShell", "CMD"]);
  assert.deepEqual(result.shells[0].args, ["-NoLogo"]);
  assert.deepEqual(result.shells[2].args, []);
});

test("Windows falls back to built-in PowerShell, then CMD", () => {
  assert.equal(discover("win32", {}, [cmd, powershell]).defaultPath, powershell);
  assert.equal(discover("win32", {}, [cmd]).defaultPath, cmd);
});

test("Windows finds native Git Bash but excludes WindowsApps aliases and relative PATH entries", () => {
  const alias = "C:\\Users\\test\\WindowsApps\\pwsh.exe";
  const git = "D:\\Tools\\Git\\cmd\\git.exe";
  const bash = "D:\\Tools\\Git\\bin\\bash.exe";
  const result = discover("win32", { PATH: ".;C:\\Users\\test\\WindowsApps;D:\\Tools\\Git\\cmd" }, [alias, "pwsh.exe", cmd, git, bash]);
  assert.equal(result.defaultPath, cmd);
  assert.equal(result.shells.find(shell => shell.path === bash)?.label, "Git Bash");
  assert.ok(!result.shells.some(shell => shell.path === alias));
});
