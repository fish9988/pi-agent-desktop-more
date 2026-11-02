/**
 * Metric formatting for the session-stats panel (components/SessionStatsPanel.tsx)
 * and anything else that prints token counts, money or percentages.
 *
 * The panel used to print raw `toLocaleString()` values next to `$0.8056` and
 * `335,067,209` in one uniform monospace grid, so no number showed its scale and
 * nothing lined up. Everything here rounds for reading; callers keep the exact
 * value in a `title`, so no precision is lost.
 *
 * Pure functions, no imports — unit tested directly by
 * components/SessionStatsPanel.test.mjs.
 */

const UNITS: ReadonlyArray<{ limit: number; suffix: string; decimals: number }> = [
  { limit: 1e12, suffix: "T", decimals: 2 },
  { limit: 1e9, suffix: "B", decimals: 2 },
  { limit: 1e6, suffix: "M", decimals: 2 },
  { limit: 1e3, suffix: "k", decimals: 1 },
];

/** `"1.20"` → `"1.2"`, `"3.00"` → `"3"`; whole numbers stay whole. */
function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/**
 * A count for reading at a glance: 999 → `999`, 1234 → `1.2k`,
 * 1_234_567 → `1.23M`, 320_909_760 → `320.91M`.
 *
 * Rounding is checked for overflow, so 999_999 prints `1M`, never `1000k`.
 */
export function formatCompactCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  if (magnitude < 1000) return `${sign}${Math.round(magnitude)}`;
  for (let index = 0; index < UNITS.length; index++) {
    const unit = UNITS[index];
    if (magnitude < unit.limit) continue;
    const scaled = trimZeros((magnitude / unit.limit).toFixed(unit.decimals));
    if (Number(scaled) >= 1000 && index > 0) {
      const bigger = UNITS[index - 1];
      return `${sign}${trimZeros((magnitude / bigger.limit).toFixed(bigger.decimals))}${bigger.suffix}`;
    }
    return `${sign}${scaled}${unit.suffix}`;
  }
  return `${sign}${Math.round(magnitude)}`;
}

/** The untouched number, grouped for the locale: 13_242_423 → `13,242,423`. */
export function formatExactCount(value: number, locale = "en-US"): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString(locale);
}

/**
 * Money short enough for a tile: 0 → `$0`, below a cent → `<$0.01`,
 * below a dollar keeps mill resolution (`$0.806`), above it two decimals,
 * thousands grouped. `formatUsdExact` is what a `title` shows.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  if (magnitude === 0) return "$0";
  if (magnitude < 0.01) return `${sign}<$0.01`;
  if (magnitude < 1) return `${sign}$${magnitude.toFixed(3)}`;
  if (magnitude < 1000) return `${sign}$${magnitude.toFixed(2)}`;
  return `${sign}$${Math.round(magnitude).toLocaleString("en-US")}`;
}

/** The billed amount as pi reports it, for tooltips: `$0.8056`. */
export function formatUsdExact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toFixed(4)}`;
}

/** Percent: 34.25 → `34.2%` by default, `34%` with `fractionDigits: 0`; `—` when unknown. */
export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(fractionDigits)}%`;
}

/**
 * Active time as the panel headlines it: `2h 14m`, `14m 3s`, `3s`.
 * Seconds are dropped once hours are shown, so the tile stays short.
 */
export function formatActiveDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/** Every unit, for the tooltip behind the active-time tile: `2h 14m 7s`. */
export function formatExactDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Cost breakdown keys are `provider/modelId`, and a model id may itself hold a
 * slash (`magpie/ai-studio/gemini-4-argon`). The provider is shown as a dim tag
 * and the model id on its own, so the long path stops eating the row.
 */
export function splitModelKey(key: string): { provider: string; model: string } {
  const index = key.indexOf("/");
  if (index <= 0 || index === key.length - 1) return { provider: "", model: key };
  return { provider: key.slice(0, index), model: key.slice(index + 1) };
}

/**
 * Shortens in the middle, where long model ids differ only by a vendor prefix:
 * `anthropic/claude-son…20250929`. The result is exactly `max` characters, and
 * the untruncated string stays available as a `title`.
 */
export function truncateMiddle(text: string, max = 32): string {
  if (!Number.isFinite(max) || max <= 1 || text.length <= max) return text;
  const tail = Math.max(1, Math.floor((max - 1) * 0.4));
  const head = Math.max(1, max - 1 - tail);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/**
 * Bar width for one row against the largest one. A nonzero value always keeps a
 * visible sliver (2%), so "small but billed" never looks like "free".
 */
export function barWidthPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.min(100, Math.round((value / max) * 100)));
}
