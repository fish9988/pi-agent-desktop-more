/**
 * Plus: Quick Phrases (快捷短语) for the chat composer.
 *
 * Provides 8 built-in high-frequency engineering phrases plus user-defined
 * custom phrases persisted in localStorage (`pi-plus:quick-phrases`) and
 * mirrored to `plus-prefs` (`pi-plus-quick-phrases` + `/api/plus-prefs`).
 */

export const QUICK_PHRASES_STORAGE_KEY = "pi-plus:quick-phrases";
export const QUICK_PHRASES_PREF_MIRROR_KEY = "pi-plus-quick-phrases";
export const MAX_CUSTOM_QUICK_PHRASES = 50;
export const MAX_QUICK_PHRASE_TITLE_LENGTH = 48;
export const MAX_QUICK_PHRASE_CONTENT_LENGTH = 1000;

export interface QuickPhraseItem {
  id: string;
  title: string;
  content: string;
  builtin?: boolean;
}

export const BUILTIN_QUICK_PHRASES: readonly QuickPhraseItem[] = [
  {
    id: "builtin:continue",
    title: "继续",
    content: "继续",
    builtin: true,
  },
  {
    id: "builtin:summarize-progress",
    title: "总结进展与待办",
    content: "请总结当前进展与剩余待办",
    builtin: true,
  },
  {
    id: "builtin:fix-last-error",
    title: "检查并修复报错",
    content: "请检查并修复刚才的报错",
    builtin: true,
  },
  {
    id: "builtin:run-tests",
    title: "运行测试并确认",
    content: "运行相关测试并确认通过",
    builtin: true,
  },
  {
    id: "builtin:review-edge-cases",
    title: "审查边界漏洞",
    content: "请审查刚刚修改的代码是否有边界漏洞",
    builtin: true,
  },
  {
    id: "builtin:explain-plainly",
    title: "通俗解释",
    content: "请用通俗直白的话解释一下",
    builtin: true,
  },
  {
    id: "builtin:plan-first",
    title: "先给方案不改代码",
    content: "先给出修改方案和影响范围，不要直接改代码",
    builtin: true,
  },
  {
    id: "builtin:commit-and-doc",
    title: "提交并更新文档",
    content: "把刚才的改动提交并更新状态文档",
    builtin: true,
  },
];

const BUILTIN_QUICK_PHRASES_ZH_TW: readonly QuickPhraseItem[] = [
  {
    id: "builtin:continue",
    title: "繼續",
    content: "繼續",
    builtin: true,
  },
  {
    id: "builtin:summarize-progress",
    title: "總結進展與待辦",
    content: "請總結目前進展與剩餘待辦",
    builtin: true,
  },
  {
    id: "builtin:fix-last-error",
    title: "檢查並修復報錯",
    content: "請檢查並修復剛才的報錯",
    builtin: true,
  },
  {
    id: "builtin:run-tests",
    title: "執行測試並確認",
    content: "執行相關測試並確認通過",
    builtin: true,
  },
  {
    id: "builtin:review-edge-cases",
    title: "審查邊界漏洞",
    content: "請審查剛剛修改的程式碼是否有邊界漏洞",
    builtin: true,
  },
  {
    id: "builtin:explain-plainly",
    title: "通俗解釋",
    content: "請用通俗直白的話解釋一下",
    builtin: true,
  },
  {
    id: "builtin:plan-first",
    title: "先給方案不改程式碼",
    content: "先給出修改方案和影響範圍，不要直接改程式碼",
    builtin: true,
  },
  {
    id: "builtin:commit-and-doc",
    title: "提交並更新文件",
    content: "把剛才的改動提交並更新狀態文件",
    builtin: true,
  },
];

const BUILTIN_QUICK_PHRASES_EN: readonly QuickPhraseItem[] = [
  {
    id: "builtin:continue",
    title: "Continue",
    content: "Continue",
    builtin: true,
  },
  {
    id: "builtin:summarize-progress",
    title: "Summarize progress & TODOs",
    content: "Please summarize current progress and remaining TODOs",
    builtin: true,
  },
  {
    id: "builtin:fix-last-error",
    title: "Fix the last error",
    content: "Please check and fix the error from the last step",
    builtin: true,
  },
  {
    id: "builtin:run-tests",
    title: "Run tests & verify",
    content: "Run the relevant tests and confirm they pass",
    builtin: true,
  },
  {
    id: "builtin:review-edge-cases",
    title: "Review edge cases",
    content: "Please review the recently modified code for edge-case bugs",
    builtin: true,
  },
  {
    id: "builtin:explain-plainly",
    title: "Explain in plain terms",
    content: "Please explain this in plain, simple terms",
    builtin: true,
  },
  {
    id: "builtin:plan-first",
    title: "Plan first without editing",
    content: "Outline the implementation plan and impact scope first without modifying code yet",
    builtin: true,
  },
  {
    id: "builtin:commit-and-doc",
    title: "Commit & update docs",
    content: "Commit the recent changes and update the status documentation",
    builtin: true,
  },
];

export function getBuiltinQuickPhrases(locale?: string): readonly QuickPhraseItem[] {
  if (!locale) return BUILTIN_QUICK_PHRASES;
  if (locale === "zh-TW") return BUILTIN_QUICK_PHRASES_ZH_TW;
  if (locale.startsWith("zh")) return BUILTIN_QUICK_PHRASES;
  return BUILTIN_QUICK_PHRASES_EN;
}

export function normalizeQuickPhrase(entry: unknown, index = 0): QuickPhraseItem | null {
  if (typeof entry === "string") {
    const content = entry.trim().slice(0, MAX_QUICK_PHRASE_CONTENT_LENGTH);
    if (!content) return null;
    return {
      id: `custom:${index}:${content.slice(0, 16)}`,
      title: content.slice(0, MAX_QUICK_PHRASE_TITLE_LENGTH),
      content,
    };
  }
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const rawContent = typeof record.content === "string"
    ? record.content
    : typeof record.text === "string"
      ? record.text
      : "";
  const content = rawContent.trim().slice(0, MAX_QUICK_PHRASE_CONTENT_LENGTH);
  if (!content) return null;
  const rawTitle = typeof record.title === "string" ? record.title.trim() : "";
  const title = (rawTitle || content).slice(0, MAX_QUICK_PHRASE_TITLE_LENGTH);
  const id = typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : `custom:${index}:${content.slice(0, 16)}`;
  return { id, title, content };
}

export function parseCustomQuickPhrases(raw: string | null | undefined): QuickPhraseItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: QuickPhraseItem[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < parsed.length; i += 1) {
      const item = normalizeQuickPhrase(parsed[i], i);
      if (!item || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      out.push(item);
      if (out.length >= MAX_CUSTOM_QUICK_PHRASES) break;
    }
    return out;
  } catch {
    return [];
  }
}

function defaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function syncPlusPrefs(serialized: string | null): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  try {
    void fetch("/api/plus-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefs: {
          [QUICK_PHRASES_STORAGE_KEY]: serialized,
          [QUICK_PHRASES_PREF_MIRROR_KEY]: serialized,
        },
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore offline / test environment errors
  }
}

export function readCustomQuickPhrases(
  storage: Pick<Storage, "getItem"> | null = defaultStorage(),
): QuickPhraseItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(QUICK_PHRASES_STORAGE_KEY)
      ?? storage.getItem(QUICK_PHRASES_PREF_MIRROR_KEY);
    return parseCustomQuickPhrases(raw);
  } catch {
    return [];
  }
}

export function writeCustomQuickPhrases(
  items: readonly QuickPhraseItem[],
  storage: Pick<Storage, "setItem" | "removeItem"> | null = defaultStorage(),
): QuickPhraseItem[] {
  const normalized = items
    .map((item, idx) => normalizeQuickPhrase(item, idx))
    .filter((item): item is QuickPhraseItem => item !== null)
    .slice(0, MAX_CUSTOM_QUICK_PHRASES);
  const serialized = JSON.stringify(normalized);
  if (storage) {
    try {
      storage.setItem(QUICK_PHRASES_STORAGE_KEY, serialized);
      storage.setItem(QUICK_PHRASES_PREF_MIRROR_KEY, serialized);
    } catch {
      // ignore quota / private mode
    }
  }
  syncPlusPrefs(serialized);
  return normalized;
}

export function addCustomQuickPhrase(
  input: { title?: string; content: string } | string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = defaultStorage(),
): QuickPhraseItem[] {
  const current = readCustomQuickPhrases(storage);
  const rawContent = typeof input === "string" ? input : input.content;
  const content = rawContent.trim().slice(0, MAX_QUICK_PHRASE_CONTENT_LENGTH);
  if (!content) return current;
  const rawTitle = typeof input === "string" ? "" : (input.title ?? "").trim();
  const title = (rawTitle || content).slice(0, MAX_QUICK_PHRASE_TITLE_LENGTH);
  const newItem: QuickPhraseItem = {
    id: `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    content,
  };
  return writeCustomQuickPhrases([newItem, ...current], storage);
}

export function removeCustomQuickPhrase(
  id: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = defaultStorage(),
): QuickPhraseItem[] {
  const current = readCustomQuickPhrases(storage);
  const next = current.filter((item) => item.id !== id);
  return writeCustomQuickPhrases(next, storage);
}

export function getAllQuickPhrases(
  locale?: string,
  storage: Pick<Storage, "getItem"> | null = defaultStorage(),
): QuickPhraseItem[] {
  return [...readCustomQuickPhrases(storage), ...getBuiltinQuickPhrases(locale)];
}
