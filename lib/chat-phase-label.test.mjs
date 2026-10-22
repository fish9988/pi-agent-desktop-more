import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { phaseLabel, lastSlashCommand } = await jiti.import("./chat-phase-label.ts");
const t = (key, params) => (params ? `${key}(${Object.values(params).join(",")})` : key);

test("phase label: a running slash command is named, and a waiting panel is said", () => {
  const phase = { kind: "running_command" };
  assert.equal(phaseLabel(phase, t), "chat.runningCommand");
  assert.equal(phaseLabel(phase, t, false, { name: null }), "chat.runningCommand");
  assert.equal(phaseLabel(phase, t, false, { name: "/smart-compact" }), "plus.runningSlashCommand(/smart-compact)");
  assert.equal(phaseLabel(phase, t, false, { name: "/smart-compact", awaitingPanel: true }), "plus.runningSlashCommand(/smart-compact) · plus.waitingForPanel");
  assert.equal(phaseLabel(phase, t, true, { name: "/x" }), "chat.compacting", "compaction still wins");
});

test("last slash command: only when the latest user turn is a command", () => {
  assert.equal(lastSlashCommand([{ role: "user", content: "/smart-compact" }, { role: "assistant", content: [] }]), "/smart-compact");
  assert.equal(lastSlashCommand([{ role: "user", content: [{ type: "text", text: "  /skill:review now" }] }]), "/skill:review");
  assert.equal(lastSlashCommand([{ role: "user", content: "/old" }, { role: "user", content: "hello" }]), null);
  assert.equal(lastSlashCommand([{ role: "user", content: "path /etc/hosts" }]), null);
  assert.equal(lastSlashCommand([]), null);
});
