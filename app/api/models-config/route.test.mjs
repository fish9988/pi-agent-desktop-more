import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const testAgentDir = await mkdtemp(join(tmpdir(), "pi-web-models-config-route-"));
process.env.PI_CODING_AGENT_DIR = testAgentDir;

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET, PUT } = await jiti.import("./route.ts");
const modelsPath = join(testAgentDir, "models.json");

after(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  await rm(testAgentDir, { recursive: true, force: true });
});

function put(body) {
  return new Request("http://localhost/api/models-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Host: "localhost" },
    body: JSON.stringify(body),
  });
}

test("a models.json with a syntax error is reported instead of read as empty, and a save cannot replace it", async () => {
  const original = '{ "providers": { "acme": { "models": [ } } }';
  await writeFile(modelsPath, original);

  let response = await GET();
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /models\.json/);

  response = await PUT(put({ providers: {} }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /models\.json/);
  assert.equal(await readFile(modelsPath, "utf8"), original);
});

test("a commented models.json loads with its providers", async () => {
  await writeFile(modelsPath, '{\n  // local models\n  "providers": { "acme": { "models": [{ "id": "a" },] } },\n}\n');

  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { providers: { acme: { models: [{ id: "a" }] } } });
});

// Plus: ported pi-web dd8201b9 (#1288) — models[].baseUrl round-trips and pi inherits it.
test("model-level baseUrl round-trips through Save and returns to provider inheritance", async () => {
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const config = { providers: { relay: {
    baseUrl: "https://synthetic.invalid", api: "anthropic-messages", apiKey: "synthetic-not-a-key",
    models: [
      { id: "one", api: "openai-responses", baseUrl: "https://synthetic.invalid/v1", headers: { "x-example": "keep" } },
      { id: "two" },
    ],
  } } };
  // Plus: GET redacts literal apiKey values, so the echoed payload has none.
  const { apiKey: _apiKey, ...relaySaved } = config.providers.relay;
  const saved = { providers: { relay: relaySaved } };
  const options = {
    authPath: join(testAgentDir, "auth.json"),
    modelsPath,
    modelsStorePath: join(testAgentDir, "models-store.json"),
    refreshOnCreate: false,
  };
  assert.equal((await PUT(put(config))).status, 200);
  assert.deepEqual(await (await GET()).json(), saved);
  const runtime = await ModelRuntime.create(options);
  assert.equal(runtime.getError(), undefined);
  assert.equal(runtime.getModel("relay", "one").baseUrl, "https://synthetic.invalid/v1");
  assert.equal(runtime.getModel("relay", "two").baseUrl, "https://synthetic.invalid");
  assert.equal(runtime.getModel("relay", "two").api, "anthropic-messages");
  delete config.providers.relay.models[0].baseUrl;
  assert.equal((await PUT(put(config))).status, 200);
  assert.deepEqual(await (await GET()).json(), saved);
  const reset = await ModelRuntime.create(options);
  assert.equal(reset.getModel("relay", "one").baseUrl, "https://synthetic.invalid");
  assert.equal(reset.getModel("relay", "one").api, "openai-responses");
  await writeFile(modelsPath, '{ "providers": {} }\n');
});
