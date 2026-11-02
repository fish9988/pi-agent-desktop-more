import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../", import.meta.url)) },
  moduleCache: false,
});
const {
  DEFAULT_WSL_PREFERENCES,
  readWslPreferences,
  usesWslShellCommands,
  writeWslPreferences,
} = await jiti.import("./wsl-preferences.ts");

async function tempSettings(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pi-web-wsl-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, "settings.json");
}

test("an absent or unreadable settings file keeps the native shell", async (t) => {
  const settingsPath = await tempSettings(t);
  assert.deepEqual(readWslPreferences(settingsPath), DEFAULT_WSL_PREFERENCES);
  assert.deepEqual(DEFAULT_WSL_PREFERENCES, { backend: "native", distro: "", shellCommands: false });

  await writeFile(settingsPath, "{not json", "utf8");
  assert.deepEqual(readWslPreferences(settingsPath), DEFAULT_WSL_PREFERENCES);

  await writeFile(settingsPath, JSON.stringify({ terminalBackend: "vmware" }), "utf8");
  assert.equal(readWslPreferences(settingsPath).backend, "native");
});

test("each key is merged on its own so the switch and dropdown never clobber", async (t) => {
  const settingsPath = await tempSettings(t);
  writeWslPreferences({ backend: "wsl" }, settingsPath);
  writeWslPreferences({ distro: " Ubuntu-24.04 " }, settingsPath);
  writeWslPreferences({ shellCommands: true }, settingsPath);
  assert.deepEqual(readWslPreferences(settingsPath), {
    backend: "wsl",
    distro: "Ubuntu-24.04",
    shellCommands: true,
  });

  const stored = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.equal(stored.version, 1);
  assert.equal(stored.terminalBackend, "wsl");
  assert.equal(stored.terminalWslDistro, "Ubuntu-24.04");
  assert.equal(stored.terminalWslShellCommands, true);
});

test("an invalid backend is refused instead of written", async (t) => {
  const settingsPath = await tempSettings(t);
  await writeFile(settingsPath, JSON.stringify({ terminalBackend: "wsl" }), "utf8");
  assert.throws(() => writeWslPreferences({ backend: "vmware" }, settingsPath), /Invalid terminal backend/);
  assert.equal(readWslPreferences(settingsPath).backend, "wsl");
});

test("`!cmd` needs both the WSL backend and the shell-command switch", () => {
  assert.equal(usesWslShellCommands({ backend: "wsl", distro: "", shellCommands: true }), true);
  assert.equal(usesWslShellCommands({ backend: "wsl", distro: "", shellCommands: false }), false);
  assert.equal(usesWslShellCommands({ backend: "native", distro: "", shellCommands: true }), false);
});
