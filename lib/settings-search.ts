/**
 * Settings search: the index behind the Settings page's search box plus the
 * pure matching/scoring used by it.
 *
 * The index is built from the settings page itself, never from a second copy of
 * its labels. `SETTINGS_ROW_SELECTORS` names the row containers the settings
 * panels already render (`.settings-chat-option`, `.settings-option`,
 * `.config-field`, …), and `SettingsPanel` reads each row's label out of that
 * row's own markup at search time; a row may also carry `data-settings-item` /
 * `data-settings-label` when its text cannot be read from the structure. So a
 * label added to a panel is searchable without touching this file.
 *
 * Matching rules:
 * - case-insensitive, and a plain substring match, so Chinese needs nothing
 *   special (no pinyin initial letters);
 * - the query is split on whitespace and every word must match (AND);
 * - a hit in the label scores above a hit in the description, and a section's
 *   extra keywords score below both.
 */

/** One searchable row. `hint` is the muted description line, `keywords` words that are not shown. */
export interface SettingsSearchItem {
  sectionId: string;
  itemId: string;
  label: string;
  hint?: string;
  keywords?: string;
}

/** One row of the results list. `label`/`hint` keep their original casing. */
export interface SettingsSearchResult {
  sectionId: string;
  itemId: string;
  label: string;
  hint: string;
  score: number;
}

/** An item with its lower-cased fields precomputed, plus its DOM order. */
export interface IndexedSettingsItem {
  item: SettingsSearchItem;
  label: string;
  hint: string;
  keywords: string;
  order: number;
}

export interface SettingsSearchIndex {
  items: IndexedSettingsItem[];
}

export interface MatchSegment {
  text: string;
  matched: boolean;
}

/**
 * The row containers a settings panel already renders, scanned in this order when
 * a query is active. Nested matches keep the innermost row, so a
 * `.settings-general-section` is only used when it holds no finer-grained row
 * (its `.settings-general-heading` is a row of its own), and a collapsed row
 * hidden with `hidden` or CSS is still indexed because the scan ignores layout.
 * `button[aria-expanded][aria-controls]` catches disclosure rows such as Models'
 * "Advanced settings" whose content is not rendered while collapsed.
 */
export const SETTINGS_ROW_SELECTORS: readonly string[] = [
  "[data-settings-item]",
  ".settings-general-heading",
  ".settings-chat-option",
  ".settings-option",
  ".settings-theme-option",
  ".settings-language-option",
  ".settings-update-card",
  ".config-field",
  ".config-detail-grid-row",
  ".config-section-title",
  ".config-sidebar-item",
  ".config-sidebar-group-label",
  "button[aria-expanded][aria-controls]",
  ".settings-general-section",
];

const SCORE_LABEL_EXACT = 120;
const SCORE_LABEL_PREFIX = 90;
const SCORE_LABEL_INCLUDES = 60;
const SCORE_HINT_INCLUDES = 25;
const SCORE_KEYWORD_INCLUDES = 12;
/** Every word landed in the label: the row is about the query, not near it. */
const SCORE_ALL_WORDS_IN_LABEL = 20;

/** Whitespace-separated, lower-cased words; an empty query yields no words. */
export function searchWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Precompute the lower-cased fields of every item once per scan.
 * @param items the item list collected from the settings page
 * @returns the index `searchSettings()` reads
 */
export function buildSettingsIndex(items: readonly SettingsSearchItem[]): SettingsSearchIndex {
  return {
    items: items.map((item, order) => ({
      item,
      label: item.label.toLowerCase(),
      hint: (item.hint ?? "").toLowerCase(),
      keywords: (item.keywords ?? "").toLowerCase(),
      order,
    })),
  };
}

function wordScore(word: string, entry: IndexedSettingsItem): number {
  if (entry.label === word) return SCORE_LABEL_EXACT;
  if (entry.label.startsWith(word)) return SCORE_LABEL_PREFIX;
  if (entry.label.includes(word)) return SCORE_LABEL_INCLUDES;
  if (entry.hint.includes(word)) return SCORE_HINT_INCLUDES;
  if (entry.keywords.includes(word)) return SCORE_KEYWORD_INCLUDES;
  return -1;
}

/**
 * Every item whose label, hint or keywords contain all words of `query`.
 * Label hits sort above hint hits, and DOM order breaks ties.
 * @param index the index from `buildSettingsIndex()`
 * @param query the raw search box value; whitespace only means "no query"
 * @param limit optional cap on the number of results
 */
export function searchSettings(index: SettingsSearchIndex, query: string, limit = Number.POSITIVE_INFINITY): SettingsSearchResult[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  const scored: { result: SettingsSearchResult; order: number }[] = [];
  for (const entry of index.items) {
    let score = 0;
    let wordsInLabel = 0;
    let matched = true;
    for (const word of words) {
      const wordScoreValue = wordScore(word, entry);
      if (wordScoreValue < 0) {
        matched = false;
        break;
      }
      score += wordScoreValue;
      if (wordScoreValue >= SCORE_LABEL_INCLUDES) wordsInLabel += 1;
    }
    if (!matched) continue;
    if (wordsInLabel === words.length) score += SCORE_ALL_WORDS_IN_LABEL;
    scored.push({
      order: entry.order,
      result: {
        sectionId: entry.item.sectionId,
        itemId: entry.item.itemId,
        label: entry.item.label,
        hint: entry.item.hint ?? "",
        score,
      },
    });
  }
  scored.sort((left, right) => right.result.score - left.result.score || left.order - right.order);
  const results = scored.map((entry) => entry.result);
  return Number.isFinite(limit) ? results.slice(0, Math.max(0, limit)) : results;
}

/**
 * Split `text` into runs that do and do not match the query, for `<mark>`.
 * Matching is the same case-insensitive substring rule as `searchSettings()`.
 * @param text the label to split
 * @param query the raw search box value
 */
export function splitMatchSegments(text: string, query: string): MatchSegment[] {
  const words = searchWords(query);
  if (words.length === 0 || text.length === 0) return [{ text, matched: false }];
  const lower = text.toLowerCase();
  // Lower-casing can change a string's length (ß, İ); the offsets would no
  // longer line up, so show the label unmarked rather than cut in the wrong place.
  if (lower.length !== text.length) return [{ text, matched: false }];
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(word, from);
      if (at < 0) break;
      marks.fill(true, at, at + word.length);
      from = at + 1;
    }
  }
  if (!marks.some(Boolean)) return [{ text, matched: false }];
  const segments: MatchSegment[] = [];
  let start = 0;
  for (let index = 1; index <= text.length; index += 1) {
    if (index === text.length || marks[index] !== marks[start]) {
      segments.push({ text: text.slice(start, index), matched: marks[start] });
      start = index;
    }
  }
  return segments;
}
