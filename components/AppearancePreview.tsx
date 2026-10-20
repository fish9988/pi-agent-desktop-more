"use client";

import { useMemo } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { AgentMessage, AssistantMessage, ToolResultMessage } from "@/lib/types";
import { MessageView } from "./MessageView";
import { WorkTimeline, type WorkTimelineItem } from "./WorkTimeline";

const T0 = Date.UTC(2026, 9, 21, 6, 0, 0);

function assistant(content: unknown[], offsetSec: number, extra: Record<string, unknown> = {}): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "preview",
    provider: "preview",
    model: "preview",
    stopReason: "toolUse",
    timestamp: T0 + offsetSec * 1000,
    ...extra,
  } as unknown as AssistantMessage;
}

function result(toolCallId: string, text: string, offsetSec: number, isError = false): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName: "",
    content: [{ type: "text", text }],
    isError,
    timestamp: T0 + offsetSec * 1000,
  } as unknown as ToolResultMessage;
}

interface Sample {
  user: AgentMessage;
  steps: AssistantMessage[];
  answer: AssistantMessage;
  results: Map<string, ToolResultMessage>;
}

function buildSample(zh: boolean): Sample {
  const L = (cn: string, en: string) => (zh ? cn : en);
  const user = {
    role: "user",
    content: [{ type: "text", text: L("设置页的字体选不了，帮我看看，顺便把主题切换的问题也修一下。", "The font picker in Settings does nothing — please take a look, and fix the theme switch too.") }],
    timestamp: T0,
  } as unknown as AgentMessage;
  const steps = [
    assistant([
      { type: "thinking", thinking: L("先看看字体选择器和主题设置是怎么接起来的。", "First, see how the font picker and the theme settings are wired.") },
      { type: "toolCall", toolCallId: "p1", toolName: "grep", input: { pattern: "FontPicker", path: "C:/demo/components" } },
    ], 6),
    assistant([{ type: "toolCall", toolCallId: "p2", toolName: "read", input: { path: "C:/demo/components/FontPicker.tsx" } }], 9),
    assistant([{ type: "toolCall", toolCallId: "p3", toolName: "read", input: { path: "C:/demo/lib/plus-theme.ts" } }], 11),
    assistant([
      { type: "text", text: L("找到原因了：弹层被设置窗口挡住。改一下层级。", "Found it: the popover sits under the settings dialog. Raising it.") },
      { type: "toolCall", toolCallId: "p4", toolName: "edit", input: { path: "C:/demo/components/FontPicker.tsx", edits: [{ oldText: "zIndex: 900", newText: "zIndex: 2400" }] } },
    ], 15),
    assistant([{ type: "toolCall", toolCallId: "p5", toolName: "bash", input: { command: "cd C:/demo; npx tsc --noEmit" } }], 24),
    assistant([{ type: "toolCall", toolCallId: "p6", toolName: "bash", input: { command: "npm test -- theme" } }], 31),
  ];
  const results = new Map<string, ToolResultMessage>([
    ["p1", result("p1", "components/FontPicker.tsx:38\ncomponents/PlusAppearanceSettings.tsx:12", 7)],
    ["p2", result("p2", "export function FontPicker() { … }", 10)],
    ["p3", result("p3", "export function applyPlusTheme() { … }", 12)],
    ["p4", result("p4", "Edited 1 block.", 16)],
    ["p5", result("p5", "", 29)],
    ["p6", result("p6", L("1 个测试失败：theme switch", "1 test failed: theme switch"), 35, true)],
  ]);
  const markdown = L(
    `## 已修复字体选择器

字体弹层被设置窗口**挡住**了，原因是 \`zIndex\` 太低。改动如下：

- 弹层层级提到 \`2400\`，高于设置窗口
- 主题切换时颜色*平滑过渡*

> 小提示：粗体、标题和表头会使用「粗体与标题字体」。

| 项目 | 之前 | 之后 |
| --- | --- | --- |
| 弹层层级 | 900 | 2400 |
| 测试 | 1 个失败 | 全部通过 |

\`\`\`ts
export function raise(layer: number): number {
  // 高于设置窗口
  return Math.max(layer, 2400);
}
\`\`\``,
    `## Font picker fixed

The font popover was **hidden** behind the settings dialog because its \`zIndex\` was too low. Changes:

- Popover raised to \`2400\`, above the dialog
- Colours *fade* when the theme switches

> Tip: bold text, headings and table heads use the "Bold & heading font".

| Item | Before | After |
| --- | --- | --- |
| Popover layer | 900 | 2400 |
| Tests | 1 failing | all passing |

\`\`\`ts
export function raise(layer: number): number {
  // above the settings dialog
  return Math.max(layer, 2400);
}
\`\`\``,
  );
  const answer = assistant([{ type: "text", text: markdown }], 40, {
    stopReason: "stop",
    usage: { input: 18342, output: 1204, cacheRead: 96000, cacheWrite: 2100, totalTokens: 117646, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.0384 } },
  });
  return { user, steps, answer, results };
}

/**
 * Plus: Settings › Appearance preview. Real message, timeline and markdown
 * components on sample data, so every theme, font and size change shows here
 * exactly as it will in a chat.
 */
export function AppearancePreview() {
  const { t, locale } = useI18n();
  const sample = useMemo(() => buildSample(locale.startsWith("zh")), [locale]);
  const items = useMemo<WorkTimelineItem[]>(() => sample.steps.map((message, index) => ({
    type: "step",
    step: { key: `preview-${index}`, message, prevTimestamp: index === 0 ? T0 : sample.steps[index - 1].timestamp },
  })), [sample]);

  return (
    <div className="plus-appearance-preview chat-content" aria-label={t("plus.previewLabel")}>
      <div className="plus-appearance-preview-label">{t("plus.previewLabel")}</div>
      <MessageView message={sample.user} modelNames={{}} />
      <div className="process-details work-group is-finished is-open">
        <div className="work-group-header">
          <span className="process-details-trigger work-group-trigger" aria-hidden="true">
            <span className="work-group-title">{t("work.completedIn", { duration: "35s" })} · {t("work.toolCalls", { count: sample.steps.length })}</span>
          </span>
        </div>
        <div className="work-group-body">
          <WorkTimeline items={items} live={false} toolResults={sample.results} cwd="C:/demo" />
        </div>
      </div>
      <MessageView message={sample.answer} modelNames={{ "preview/preview": "Preview model" }} showTimestamp />
      <div className="chat-composer plus-appearance-preview-composer" aria-hidden="true">
        <span className="plus-appearance-preview-placeholder">{t("chat.messagePlaceholder")}</span>
        <span className="native-primary-button composer-send-button plus-appearance-preview-send">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="13" x2="8" y2="3.5" /><polyline points="3.5 7.5 8 3 12.5 7.5" /></svg>
        </span>
      </div>
    </div>
  );
}
