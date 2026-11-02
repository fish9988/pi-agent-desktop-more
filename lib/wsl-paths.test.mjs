import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../", import.meta.url)) },
  moduleCache: false,
});
const {
  isWslUncPath,
  windowsToWslPath,
  wslToWindowsPath,
  wslUncDistro,
} = await jiti.import("./wsl-paths.ts");

function wsl(input) {
  const result = windowsToWslPath(input);
  assert.equal(result.ok, true, `${input}: ${result.reason}`);
  return result;
}

function win(input, distro) {
  const result = wslToWindowsPath(input, distro);
  assert.equal(result.ok, true, `${input}: ${result.reason}`);
  return result.path;
}

test("Windows drive paths become /mnt/<drive> and keep spaces and CJK", () => {
  assert.equal(wsl("C:\\a b\\c").path, "/mnt/c/a b/c");
  assert.equal(wsl("C:/a b/c").path, "/mnt/c/a b/c");
  assert.equal(wsl("D:\\repo\\sub\\").path, "/mnt/d/repo/sub");
  assert.equal(wsl("C:\\项目\\文件.txt").path, "/mnt/c/项目/文件.txt");
  assert.equal(wsl("C:\\").path, "/mnt/c");
  assert.equal(wsl("c:\\Users\\lai").path, "/mnt/c/Users/lai");
});

test("a lower-case drive letter maps to the same /mnt mount", () => {
  assert.equal(wsl("d:\\Pi Agent Plus").path, "/mnt/d/Pi Agent Plus");
  assert.deepEqual(wsl("d:\\x"), wsl("D:\\x"));
});

test("WSL UNC paths become Linux paths and report their distro", () => {
  assert.equal(isWslUncPath("\\\\wsl.localhost\\Ubuntu-24.04\\home\\x"), true);
  assert.equal(isWslUncPath("\\\\wsl$\\Ubuntu-24.04\\home\\x"), true);
  assert.equal(isWslUncPath("\\\\server\\share"), false);
  assert.equal(wslUncDistro("\\\\wsl.localhost\\Ubuntu-24.04\\home\\x"), "Ubuntu-24.04");

  assert.deepEqual(wsl("\\\\wsl.localhost\\Ubuntu-24.04\\home\\x"), { ok: true, path: "/home/x", distro: "Ubuntu-24.04" });
  assert.deepEqual(wsl("\\\\wsl$\\Ubuntu-24.04\\home\\x"), { ok: true, path: "/home/x", distro: "Ubuntu-24.04" });
  assert.deepEqual(wsl("\\\\wsl.localhost\\Ubuntu-24.04"), { ok: true, path: "/", distro: "Ubuntu-24.04" });
  assert.equal(wsl("//wsl.localhost/Ubuntu-24.04/home/x").path, "/home/x");
});

test("a long-path prefix does not change the location", () => {
  assert.equal(wsl("\\\\?\\C:\\a b").path, "/mnt/c/a b");
  assert.equal(wsl("\\\\?\\UNC\\wsl.localhost\\Ubuntu\\home").path, "/home");
});

test("an already-POSIX path passes through so a stored WSL cwd still works", () => {
  assert.equal(wsl("/mnt/c/repo").path, "/mnt/c/repo");
  assert.equal(wsl("/home/lai/repo/").path, "/home/lai/repo");
  assert.equal(wsl("/").path, "/");
});

test("paths WSL cannot reach are refused with a reason", () => {
  const share = windowsToWslPath("\\\\server\\share\\dir");
  assert.equal(share.ok, false);
  assert.match(share.reason, /UNC/);
  assert.equal(windowsToWslPath("relative\\dir").ok, false);
  assert.equal(windowsToWslPath("C:").ok, false);
  assert.equal(windowsToWslPath("   ").ok, false);
});

test("Linux paths translate back for display", () => {
  assert.equal(win("/mnt/c/a b/c"), "C:\\a b\\c");
  assert.equal(win("/mnt/d/"), "D:\\");
  assert.equal(win("/mnt/d/Pi Agent Plus"), "D:\\Pi Agent Plus");
  assert.equal(win("/home/x", "Ubuntu-24.04"), "\\\\wsl.localhost\\Ubuntu-24.04\\home\\x");
  assert.equal(win("/mnt/c/x"), "C:\\x");
  assert.equal(win("\\\\wsl.localhost\\Ubuntu\\home\\x"), "\\\\wsl.localhost\\Ubuntu\\home\\x");
  assert.equal(win("C:\\already"), "C:\\already");
  assert.equal(wslToWindowsPath("/home/x").ok, false);
  assert.equal(wslToWindowsPath("//relative/x").ok, false);
});

test("translation round-trips for drive paths", () => {
  for (const [windowsPath, linuxPath] of [
    ["C:\\a b\\c", "/mnt/c/a b/c"],
    ["D:\\Pi Agent Plus\\sub", "/mnt/d/Pi Agent Plus/sub"],
    ["E:\\", "/mnt/e"],
  ]) {
    assert.equal(wsl(windowsPath).path, linuxPath);
    assert.equal(win(linuxPath), windowsPath);
  }
});
