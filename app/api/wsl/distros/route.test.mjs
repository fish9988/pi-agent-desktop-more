import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("../../../../", import.meta.url)) },
  moduleCache: false,
});
const { GET } = await jiti.import("./route.ts");
const { clearWslDistroCache } = await jiti.import("../../../../lib/wsl-distros.ts");

test("GET /api/wsl/distros answers a list the settings dropdown can use", async (t) => {
  clearWslDistroCache();
  t.after(() => clearWslDistroCache());

  const response = await GET();
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(typeof body.available, "boolean");
  assert.ok(Array.isArray(body.distros));
  assert.ok(body.defaultDistro === null || typeof body.defaultDistro === "string");
  assert.ok(body.error === null || typeof body.error === "string");
  for (const distro of body.distros) {
    assert.equal(typeof distro.name, "string");
    assert.equal(typeof distro.isDefault, "boolean");
  }

  if (process.platform !== "win32") {
    // CI hosts have no wsl.exe; the route still answers 200 so the settings
    // panel can explain why instead of showing a failed fetch.
    assert.equal(body.available, false);
    assert.deepEqual(body.distros, []);
    assert.match(body.error, /Windows/);
  } else if (body.available) {
    assert.equal(body.error, null);
    assert.ok(body.distros.some((distro) => distro.name === body.defaultDistro));
  }
});
