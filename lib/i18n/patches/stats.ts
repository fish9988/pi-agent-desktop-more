import type { Locale } from "../types";

/**
 * Plus: the session-stats cards (`components/SessionStatsPanel.tsx`). Kept in its
 * own module because several Plus features add strings at the same time; the
 * registry merges every patch. Only labels that do not exist upstream live here —
 * token/cache/context/message rows reuse the existing `session.*` keys.
 */
export const patch: Record<Locale, { set: Record<string, string> }> = {
  "en": {
    set: {
      "plus.stats.cardTokens": "Token usage",
      "plus.stats.cardSession": "Session stats",
      "plus.stats.cardCost": "Cost",
      "plus.stats.cardCache": "Cache",
      "plus.stats.cardFiles": "Session & files",
      "plus.stats.cacheHitRate": "Cache hits",
      "plus.stats.uncachedInput": "Uncached input",
      "plus.stats.avgPerReplyLabel": "Per reply",
    },
  },
  "zh-CN": {
    set: {
      "plus.stats.cardTokens": "Token 用量",
      "plus.stats.cardSession": "会话统计",
      "plus.stats.cardCost": "花费",
      "plus.stats.cardCache": "缓存",
      "plus.stats.cardFiles": "会话与文件",
      "plus.stats.cacheHitRate": "缓存命中",
      "plus.stats.uncachedInput": "未缓存输入",
      "plus.stats.avgPerReplyLabel": "平均每轮",
    },
  },
  "zh-TW": {
    set: {
      "plus.stats.cardTokens": "Token 用量",
      "plus.stats.cardSession": "會話統計",
      "plus.stats.cardCost": "花費",
      "plus.stats.cardCache": "快取",
      "plus.stats.cardFiles": "會話與檔案",
      "plus.stats.cacheHitRate": "快取命中",
      "plus.stats.uncachedInput": "未快取輸入",
      "plus.stats.avgPerReplyLabel": "平均每輪",
    },
  },
};
