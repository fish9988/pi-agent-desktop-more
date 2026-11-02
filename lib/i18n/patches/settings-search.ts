import type { Locale } from "../types";

/**
 * Plus: the Settings page search box. Kept out of lib/i18n/locale-plugins.ts,
 * which other Plus patches also edit; `lib/i18n/locale-plugins.ts` registers
 * this patch at startup.
 *
 * The placeholder reuses the existing `plus.settings.search` key rather than
 * adding a duplicate here, so the box reads correctly even before this patch is
 * registered. Keys are read through `t("plus.settings.search…")` in
 * components/SettingsPanel.tsx.
 */
export const patch: Record<Locale, { set: Record<string, string> }> = {
  "en": {
    set: {
      "plus.settings.searchSummary": "{count} matching settings",
      "plus.settings.searchEmpty": "No matching settings",
      "plus.settings.searchHint": "↑↓ to choose · Enter to go",
    },
  },
  "zh-CN": {
    set: {
      "plus.settings.searchSummary": "{count} 项匹配",
      "plus.settings.searchEmpty": "没有匹配的设置项",
      "plus.settings.searchHint": "↑↓ 选择 · Enter 前往",
    },
  },
  "zh-TW": {
    set: {
      "plus.settings.searchSummary": "{count} 項符合",
      "plus.settings.searchEmpty": "沒有符合的設定項目",
      "plus.settings.searchHint": "↑↓ 選擇 · Enter 前往",
    },
  },
};
