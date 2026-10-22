import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { modelDotColor } = await jiti.import("./model-dot.ts");

test("model dot: the model id decides, so relayed providers still match", () => {
  const claude = modelDotColor("claude", "claude-opus-5-5");
  assert.equal(modelDotColor("cpa", "claude-sonnet-5-5"), claude);
  assert.equal(modelDotColor("magpie", "workbuddy/deepseek-v4.1-flash"), modelDotColor("deepseek", "deepseek-chat"));
  assert.equal(modelDotColor("antigravity", "gemini-4-argon-high"), modelDotColor("google", "gemini-2.5-pro"));
  assert.notEqual(claude, modelDotColor("magpie", "ai-studio/gemini-4-argon"));
  assert.equal(modelDotColor("openai", "gpt-5"), modelDotColor("azure", "o3"));
});

test("model dot: unknown or missing models get the neutral dot", () => {
  assert.equal(modelDotColor("local", "my-finetune"), "var(--text-dim)");
  assert.equal(modelDotColor(undefined, undefined), "var(--text-dim)");
});
