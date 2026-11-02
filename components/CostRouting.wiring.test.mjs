import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const chatInput = await read("./ChatInput.tsx");
const appShell = await read("./AppShell.tsx");
const hook = await read("../hooks/useAgentSession.ts");
const panel = await read("./SessionStatsPanel.tsx");
const rpcManager = await read("../lib/rpc-manager.ts");

test("the wrapper reports where a virtual model routed and the cache-warming state", () => {
  assert.match(rpcManager, /routedModel: this\.getRoutedModel\(\),\s*cacheWarming: this\.getCacheWarming\(\),/);
  assert.match(rpcManager, /costBreakdown: getUsageCostBreakdown\(this\.inner\.sessionManager\.getEntries\(\)/);
  // Every state sync carries them, so the composer and the panel follow each run.
  assert.match(hook, /setRoutedModel\(state\?\.routedModel \?\? null\);\s*setCacheWarming\(state\?\.cacheWarming \?\? null\);/);
});

test("the composer shows the routed model next to the selector, like pi's footer", () => {
  assert.match(chatInput, /\{routedModel && routedModelName && \(\s*<span\s*className="routed-model-hint"/);
});

test("the session panel lists cost by model and cache warming, refreshed when it opens", () => {
  // Plus: the panel itself owns the layout now (components/SessionStatsPanel.tsx),
  // so the wiring is asserted on the component and the shell only has to mount it
  // and read the live cache state when the panel opens.
  assert.match(panel, /const breakdown = \[\.\.\.\(sessionStats\.costBreakdown \?\? \[\]\)\]\.sort\(\(a, b\) => b\.cost - a\.cost\)/);
  assert.match(panel, /<StatsCard\s+\n?\s*icon="cost"/);
  assert.match(panel, /<StatsCard icon="cache" title=\{translate\("plus\.stats\.cache"\)\}>/);
  assert.match(panel, /translate\("session\.cacheWarmingSavings"\)/);
  assert.match(appShell, /<SessionStatsPanel\s+sessionStats=\{sessionStats\}/);
  // Plus: ported pi-web 4eed9e97 — the panel's state read is a status read (#1302).
  assert.match(appShell, /fetch\(agentStatusUrl\(sessionPanelSessionId\)\)/);
});
