// Plus: the session-stats card (components/SessionStatsPanel.tsx).
// Source assertions, in the style of components/SettingsPanel.test.mjs: the
// formatting itself is imported and called, the layout is pinned by markers so
// the hierarchy (headline numbers → sections → details) cannot quietly regress.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  barWidthPercent,
  formatActiveDuration,
  formatCompactCount,
  formatExactCount,
  formatExactDuration,
  formatPercent,
  formatUsd,
  formatUsdExact,
  splitModelKey,
  truncateMiddle,
} = await jiti.import("../lib/metrics-format.ts");
const { forkLocalePlugins } = await jiti.import("../lib/i18n/locale-plugins.ts");

const read = async (path) => (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const panelSource = await read("./SessionStatsPanel.tsx");
const plusCss = await read("../app/plus.css");
// Only the block this panel owns: everything from its header comment on.
// The section runs until the next Plus section marker: appended sections further
// down belong to other features and have their own ratchets.
const statsStart = plusCss.indexOf("/* -- Plus: session stats panel");
const statsEnd = plusCss.indexOf("/* -- Plus:", statsStart + 1);
const statsCssRaw = plusCss.slice(statsStart);
// Comments are not declarations: an issue number like "(#1324)" is not a colour.
const statsCss = statsCssRaw.replace(/\/\*[\s\S]*?\*\//g, "");
const messagesByLocale = Object.fromEntries(forkLocalePlugins.map(({ id, messages }) => [id, messages]));

test("counts are formatted for scale, from the same rule at every magnitude", () => {
  assert.equal(formatCompactCount(0), "0");
  assert.equal(formatCompactCount(999), "999");
  assert.equal(formatCompactCount(1000), "1k");
  assert.equal(formatCompactCount(1234), "1.2k");
  assert.equal(formatCompactCount(999_949), "999.9k");
  assert.equal(formatCompactCount(1_234_567), "1.23M");
  assert.equal(formatCompactCount(320_909_760), "320.91M");
  // 999,999 must not round into "1000k".
  assert.equal(formatCompactCount(999_999), "1M");
  assert.equal(formatCompactCount(1_000_000_000), "1B");
  assert.equal(formatCompactCount(-1234), "-1.2k");
  assert.equal(formatCompactCount(Number.NaN), "—");
});

test("the exact value is always reachable through formatExactCount", () => {
  assert.equal(formatExactCount(13_242_423), "13,242,423");
  assert.equal(formatExactCount(0), "0");
  assert.equal(formatExactCount(Number.NaN), "—");
  // The panel prints the grouped number in the summary and in a title, never only the rounded one.
  assert.match(panelSource, /const exactCount = \(value: number\) => formatExactCount\(value, locale\)/);
  assert.match(panelSource, /totalTitle=\{exactCount\(tokens\.total\)\}/);
});

test("the card is a stack of topic cards, each head first", () => {
  const tokensAt = panelSource.indexOf('icon="token"');
  const sessionAt = panelSource.indexOf('icon="session"');
  assert.ok(tokensAt > 0 && sessionAt > tokensAt, "Token 用量 renders before 会话统计");
  // Every card is the same shape: icon + title + optional summary, then rows.
  assert.match(panelSource, /function StatsCard\(\{ icon, title, total, totalTitle, children \}/);
  assert.match(panelSource, /className="plus-stats-card-head"/);
  assert.match(panelSource, /className="plus-stats-card-rows"/);
  assert.match(statsCss, /\.plus-stats-card \{[^}]*border: var\(--hairline, 1px\) solid var\(--border\)/);
  assert.match(statsCss, /\.plus-stats-card-rows \{[^}]*border-top: var\(--hairline, 1px\) solid var\(--border\)/);
  // A ledger reads best with full numbers: rows are tabular, right-aligned, never wrapped.
  assert.match(statsCss, /\.plus-stats-kv-value \{[^}]*font-variant-numeric: tabular-nums/);
  assert.match(statsCss, /\.plus-stats-kv-value \{[^}]*text-align: right/);
  assert.match(statsCss, /\.plus-stats-kv-value \{[^}]*white-space: nowrap/);
  // Tokens are printed in full, with the unit, not compacted.
  assert.match(panelSource, /const count = \(value: number\) => `\$\{exactCount\(value\)\} tok`/);
});

test("money never loses the sub-cent distinction", () => {
  assert.equal(formatUsd(0), "$0");
  assert.equal(formatUsd(0.0004), "<$0.01");
  assert.equal(formatUsd(0.0099), "<$0.01");
  assert.equal(formatUsd(0.8056), "$0.806");
  assert.equal(formatUsd(12.345), "$12.35");
  assert.equal(formatUsd(1234.5), "$1,235");
  assert.equal(formatUsdExact(0.8056), "$0.8056");
  assert.match(panelSource, /formatUsd\(entry\.cost\)/);
  assert.match(panelSource, /title=\{formatUsdExact\(entry\.cost\)\}/);
});

test("percentages and durations keep one readable shape", () => {
  assert.equal(formatPercent(34), "34.0%");
  assert.equal(formatPercent(34.25), "34.3%");
  assert.equal(formatPercent(34.25, 0), "34%");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatActiveDuration(0), "0s");
  assert.equal(formatActiveDuration(42_000), "42s");
  assert.equal(formatActiveDuration(65_000), "1m 5s");
  assert.equal(formatActiveDuration(3_600_000), "1h 0m");
  assert.equal(formatExactDuration(3_607_000), "1h 0m 7s");
  assert.equal(formatExactDuration(67_000), "1m 7s");
});

test("a provider path is folded into a readable name, long ids lose their middle", () => {
  assert.deepEqual(splitModelKey("magpie/ai-studio/gemini-4-argon"), { provider: "magpie", model: "ai-studio/gemini-4-argon" });
  assert.deepEqual(splitModelKey("zenmux"), { provider: "", model: "zenmux" });
  assert.deepEqual(splitModelKey("provider/"), { provider: "", model: "provider/" });
  assert.equal(truncateMiddle("short", 32), "short");
  const truncated = truncateMiddle("anthropic/claude-sonnet-4-5-20250929", 24);
  assert.equal(truncated.length, 24);
  assert.match(truncated, /…/);
  assert.ok(truncated.startsWith("anthropic/"), truncated);
  assert.ok(truncated.endsWith("20250929"), truncated);
});

test("bars are normalised to the largest row and never hide a billed row", () => {
  assert.equal(barWidthPercent(0, 10), 0);
  assert.equal(barWidthPercent(10, 10), 100);
  assert.equal(barWidthPercent(5, 10), 50);
  assert.equal(barWidthPercent(0.001, 10), 2);
  assert.equal(barWidthPercent(4, 0), 0);
  assert.match(panelSource, /style=\{\{ width: `\$\{width\}%` \}\}/);
});

test("cost by model is ranked, bar-normalised and folds the free rows away", () => {
  assert.match(panelSource, /\.sort\(\(a, b\) => b\.cost - a\.cost\)/);
  assert.match(panelSource, /const billed = breakdown\.filter\(\(entry\) => entry\.cost > 0\)/);
  assert.match(panelSource, /const free = breakdown\.filter\(\(entry\) => entry\.cost <= 0\)/);
  assert.match(panelSource, /barWidthPercent\(entry\.cost, maxCost\)/);
  assert.match(panelSource, /<details className="plus-stats-more">/);
  assert.match(panelSource, /translate\("plus\.stats\.otherModels", \{ count: free\.length \}\)/);
  // The unattributed bucket keeps its own name instead of showing "Tools/…" as a model.
  assert.match(panelSource, /unattributed \? translate\("session\.unattributedUsage"\)/);
});

test("the cards keep the same shape and order", () => {
  const tokensAt = panelSource.indexOf('icon="token"');
  const sessionAt = panelSource.indexOf('icon="session"');
  const costAt = panelSource.indexOf('icon="cost"');
  const filesAt = panelSource.indexOf('icon="files"');
  assert.ok(tokensAt > 0 && sessionAt > tokensAt, "Token 用量 renders before 会话统计");
  assert.ok(costAt > sessionAt && filesAt > costAt, "cost comes before session & files");
  // Every card is the same shape: icon + title + optional summary, then rows.
  assert.match(panelSource, /function StatsCard\(\{ icon, title, total, totalTitle, children \}/);
  assert.match(panelSource, /className="plus-stats-card-head"/);
  assert.match(panelSource, /className="plus-stats-card-rows"/);
  assert.match(statsCss, /\.plus-stats-card \{[^}]*border: var\(--hairline, 1px\) solid var\(--border\)/);
  assert.match(statsCss, /\.plus-stats-card-rows \{[^}]*border-top: var\(--hairline, 1px\) solid var\(--border\)/);
  // A ledger reads best with full numbers: rows are tabular, right-aligned, never wrapped.
  assert.match(statsCss, /\.plus-stats-kv-value \{[^}]*font-variant-numeric: tabular-nums/);
  assert.match(statsCss, /\.plus-stats-kv-value \{[^}]*text-align: right/);
  assert.match(statsCss, /\.plus-stats-kv-value \{[^}]*white-space: nowrap/);
  // Tokens are printed in full, with the unit, not compacted.
  assert.match(panelSource, /const count = \(value: number\) => `\$\{exactCount\(value\)\} tok`/);
});

test("cache warming reads as a sentence, never as pi's internal state", () => {
  assert.doesNotMatch(panelSource, /waiting for first request/i);
  assert.doesNotMatch(panelSource, /status\.reason/);
  assert.doesNotMatch(panelSource, /session\.cacheWarmingInactive/);
  assert.match(panelSource, /function cacheSentence/);
  for (const key of ["cacheOff", "cacheUnavailable", "cacheStopped", "cacheRefreshing", "cacheRunning", "cacheIdle", "cacheHit"]) {
    assert.match(panelSource, new RegExp(`plus\\.stats\\.${key}`), `${key} is used`);
  }
});

test("paths and ids stay monospace, ellipsized and copyable", () => {
  assert.match(statsCss, /\.plus-stats-copy-value \{[^}]*font-family:var\(--font-mono\)/);
  assert.match(statsCss, /\.plus-stats-copy-value \{[^}]*text-overflow: ellipsis/);
  assert.match(statsCss, /\.plus-stats-copy-value\.is-start-ellipsis \{\s*direction: rtl;\s*text-align: left;\s*\}/);
  assert.match(panelSource, /copyRow\(translate\("session\.file"\), sessionStats\.sessionFile, "file", true\)/);
  assert.match(panelSource, /copyRow\(translate\("session\.id"\), sessionStats\.sessionId, "id"\)/);
  // The git branch sits with the project folder, as one line.
  assert.match(panelSource, /copyRow\(translate\("session\.projectDir"\), projectDir, "projectDir", true\)/);
  assert.match(panelSource, /plus-stats-branch-row[\s\S]{0,400}translate\("session\.gitBranch"\)/);
});

test("the panel is presentational: no fetching, no shell state", () => {
  assert.doesNotMatch(panelSource, /\bfetch\(/);
  assert.doesNotMatch(panelSource, /agentStatusUrl|topPanelPos|setInterval/);
  // Its own copy feedback only; the shell passes data in through props.
  assert.match(panelSource, /const \[copiedField, setCopiedField\] = useState<SessionCopyField \| null>\(null\)/);
  assert.match(panelSource, /session\?\.isWorktree \? session\.cwd : null/);
});

test("every plus.stats.* key exists in all three locales", () => {
  const used = new Set([...panelSource.matchAll(/"plus\.stats\.([\w.]+)"/g)].map((match) => `plus.stats.${match[1]}`));
  assert.ok(used.size >= 12, `only ${used.size} plus.stats keys used`);
  for (const [locale, messages] of Object.entries(messagesByLocale)) {
    for (const key of used) {
      assert.equal(typeof messages[key], "string", `${locale} is missing ${key}`);
      assert.ok(messages[key].length > 0, `${locale} has an empty ${key}`);
    }
  }
});

test("styling stays on the design scale and adds no literal colour or :has()", () => {
  for (const match of statsCss.matchAll(/font-size:\s*([0-9.]+)px/g)) {
    assert.ok([12, 13, 14, 16, 20].includes(Number(match[1])), `off-scale font-size ${match[1]}px`);
  }
  for (const match of statsCss.matchAll(/border-radius:\s*([0-9.]+)px/g)) {
    assert.ok([4, 8, 12, 999, 0].includes(Number(match[1])), `off-scale border-radius ${match[1]}px`);
  }
  assert.doesNotMatch(statsCss, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, "colours come from theme variables");
  assert.doesNotMatch(statsCss, /:has\(/);
  for (const selector of [
    ".plus-stats",
    ".plus-stats-card",
    ".plus-stats-card-head",
    ".plus-stats-card-icon",
    ".plus-stats-card-title",
    ".plus-stats-card-total",
    ".plus-stats-kv-label",
    ".plus-stats-kv-value",
    ".plus-stats-card-note",
    ".plus-stats-model-track",
    ".plus-stats-model-bar",
    ".plus-stats-more-summary",
    ".plus-stats-copy-row",
    ".plus-stats-branch-chip",
    ".plus-stats-copy",
  ]) {
    assert.ok(
      plusCss.includes(`${selector} {`) || plusCss.includes(`${selector},`) || plusCss.includes(`${selector}.`) || plusCss.includes(`${selector}\n`),
      `${selector} is styled`,
    );
  }
  // The shell's narrow width folds the summary under the title.
  assert.match(statsCss, /\.plus-stats\.is-mobile \.plus-stats-card-head \{ flex-wrap: wrap; \}/);
});

test("no inline font-size escapes the design scale", () => {
  const inlineSizes = [...panelSource.matchAll(/fontSize:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  for (const size of inlineSizes) assert.ok([12, 13, 14, 16, 20].includes(size), `inline fontSize ${size}`);
});
