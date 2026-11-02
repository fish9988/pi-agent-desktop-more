/**
 * Fork i18n patch: per-answer branch pager and the per-line tool arguments.
 *
 * Kept out of `lib/i18n/locale-plugins.ts` and `lib/i18n/messages/*` so the
 * upstream message files stay in their upstream shape. The registry owner
 * merges `patch[locale].set` into the locale plugin (same contract as the
 * `FORK_MESSAGE_PATCHES` layer). Every key here is `plus.branch.*` or
 * `plus.tool.*`.
 */
import type { Locale } from "../types";

export const patch: Record<Locale, { set: Record<string, string> }> = {
  "en": {
    "set": {
      "plus.branch.group": "Switch branch",
      "plus.branch.prev": "Previous branch",
      "plus.branch.next": "Next branch",
      "plus.branch.switchTo": "Switch to {label}",
      "plus.branch.locked": "Branches can't be switched while the session is running",
      "plus.tool.arguments": "Arguments",
    },
  },
  "zh-CN": {
    "set": {
      "plus.branch.group": "切换分支",
      "plus.branch.prev": "上一个分支",
      "plus.branch.next": "下一个分支",
      "plus.branch.switchTo": "切换到 {label}",
      "plus.branch.locked": "会话运行期间不能切换分支",
      "plus.tool.arguments": "参数",
    },
  },
  "zh-TW": {
    "set": {
      "plus.branch.group": "切換分支",
      "plus.branch.prev": "上一個分支",
      "plus.branch.next": "下一個分支",
      "plus.branch.switchTo": "切換到 {label}",
      "plus.branch.locked": "工作階段執行期間不能切換分支",
      "plus.tool.arguments": "參數",
    },
  },
};
