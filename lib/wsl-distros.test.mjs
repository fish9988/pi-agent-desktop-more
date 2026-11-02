import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../", import.meta.url)) },
  moduleCache: false,
});
const {
  clearWslDistroCache,
  listWslDistros,
  parseWslDistroList,
  parseWslVerboseList,
} = await jiti.import("./wsl-distros.ts");
const { decodeWslOutput } = await jiti.import("./wsl-process.ts");

const utf16 = (text) => Buffer.from(text, "utf16le");
const runResult = (overrides) => ({
  code: 0,
  stdout: Buffer.alloc(0),
  stderr: Buffer.alloc(0),
  error: null,
  timedOut: false,
  ...overrides,
});

test("wsl.exe output decodes from UTF-16LE, UTF-8, and either BOM", () => {
  assert.equal(decodeWslOutput(utf16("Ubuntu-24.04\r\n")), "Ubuntu-24.04\r\n");
  assert.equal(decodeWslOutput(Buffer.from("Ubuntu-24.04\r\n", "utf8")), "Ubuntu-24.04\r\n");
  assert.equal(decodeWslOutput(Buffer.concat([Buffer.from([0xff, 0xfe]), utf16("ok")])), "ok");
  assert.equal(decodeWslOutput(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("ok")])), "ok");
  // A stderr message that is entirely CJK has no NUL bytes to go by.
  assert.equal(decodeWslOutput(utf16("系统找不到指定的文件。")), "系统找不到指定的文件。");
  assert.equal(decodeWslOutput(Buffer.alloc(0)), "");
});

test("`wsl.exe -l -q` parses one name per line despite CRLF and NULs", () => {
  assert.deepEqual(parseWslDistroList(decodeWslOutput(utf16("Ubuntu-24.04\r\nDebian\r\n"))), ["Ubuntu-24.04", "Debian"]);
  assert.deepEqual(parseWslDistroList("Ubuntu-24.04\r\n\r\nDebian\r\n"), ["Ubuntu-24.04", "Debian"]);
  assert.deepEqual(parseWslDistroList("  Ubuntu-24.04  \r\n"), ["Ubuntu-24.04"]);
  // A header that leaks in from verbose output is not a distribution.
  assert.deepEqual(parseWslDistroList("NAME\r\nUbuntu-24.04\r\n"), ["Ubuntu-24.04"]);
  assert.deepEqual(parseWslDistroList(""), []);
});

test("`wsl.exe -l -v` marks the default distro and skips a localized header", () => {
  const text = [
    "  名称          状态           版本",
    "* Ubuntu-24.04   Stopped        2",
    "  Debian         Running        2",
    "",
  ].join("\r\n");
  assert.deepEqual(parseWslVerboseList(decodeWslOutput(utf16(text))), {
    distros: [
      { name: "Ubuntu-24.04", isDefault: true },
      { name: "Debian", isDefault: false },
    ],
    defaultDistro: "Ubuntu-24.04",
  });

  const english = "  NAME            STATE           VERSION\r\n  Ubuntu-24.04    Stopped         2\r\n";
  assert.deepEqual(parseWslVerboseList(english), {
    distros: [{ name: "Ubuntu-24.04", isDefault: false }],
    defaultDistro: null,
  });
});

test("listing reads the verbose table first and reports the default distro", async () => {
  clearWslDistroCache();
  const calls = [];
  const result = await listWslDistros({
    platform: "win32",
    cacheMs: 0,
    runner: async (args) => {
      calls.push(args.join(" "));
      return runResult({
        stdout: utf16("  NAME STATE VERSION\r\n* Ubuntu-24.04 Stopped 2\r\n  Debian Running 2\r\n"),
      });
    },
  });
  assert.deepEqual(calls, ["-l -v"]);
  assert.equal(result.available, true);
  assert.deepEqual(result.distros, [
    { name: "Ubuntu-24.04", isDefault: true },
    { name: "Debian", isDefault: false },
  ]);
  assert.equal(result.defaultDistro, "Ubuntu-24.04");
  assert.equal(result.error, null);
});

test("an old wsl.exe without -l -v falls back to -l -q, first entry as default", async () => {
  clearWslDistroCache();
  const calls = [];
  const result = await listWslDistros({
    platform: "win32",
    cacheMs: 0,
    runner: async (args) => {
      calls.push(args.join(" "));
      if (args[1] === "-v") return runResult({ code: 1, stderr: utf16("Invalid command line option: -v") });
      return runResult({ stdout: utf16("Ubuntu-24.04\r\n") });
    },
  });
  assert.deepEqual(calls, ["-l -v", "-l -q"]);
  assert.equal(result.available, true);
  assert.deepEqual(result.distros, [{ name: "Ubuntu-24.04", isDefault: true }]);
  assert.equal(result.defaultDistro, "Ubuntu-24.04");
});

test("a missing wsl.exe or an empty list becomes a readable unavailable reason", async () => {
  clearWslDistroCache();
  const missing = await listWslDistros({
    platform: "win32",
    cacheMs: 0,
    runner: async () => runResult({ code: null, error: "spawn wsl.exe ENOENT" }),
  });
  assert.equal(missing.available, false);
  assert.deepEqual(missing.distros, []);
  assert.match(missing.error, /ENOENT/);

  const empty = await listWslDistros({
    platform: "win32",
    cacheMs: 0,
    runner: async () => runResult({ code: 0, stdout: utf16("") }),
  });
  assert.equal(empty.available, false);
  assert.match(empty.error, /发行版/);

  const refused = await listWslDistros({
    platform: "win32",
    cacheMs: 0,
    runner: async () => runResult({ code: -1, stderr: utf16("系统找不到指定的文件。\r\n错误代码： Wsl/ERROR_FILE_NOT_FOUND\r\n") }),
  });
  assert.equal(refused.available, false);
  assert.match(refused.error, /Wsl\/ERROR_FILE_NOT_FOUND/);
});

test("WSL is only probed on Windows", async () => {
  clearWslDistroCache();
  let called = false;
  const result = await listWslDistros({
    platform: "linux",
    cacheMs: 0,
    runner: async () => { called = true; return runResult(); },
  });
  assert.equal(called, false);
  assert.equal(result.available, false);
  assert.match(result.error, /Windows/);
});

test("the listing is cached so opening settings does not re-run wsl.exe", async () => {
  clearWslDistroCache();
  let runs = 0;
  let now = 1_000;
  const options = {
    platform: "win32",
    cacheMs: 30_000,
    now: () => now,
    runner: async () => {
      runs += 1;
      return runResult({ stdout: utf16("Ubuntu-24.04\r\n") });
    },
  };
  await listWslDistros(options);
  now += 10_000;
  await listWslDistros(options);
  assert.equal(runs, 1);
  now += 30_000;
  await listWslDistros(options);
  assert.equal(runs, 2);
  clearWslDistroCache();
});
