"use client";

import { useState } from "react";
import {
  getPasteToFileLineThreshold,
  PASTE_TO_FILE_PRESETS,
  setPasteToFileLineThreshold,
} from "@/lib/chat-attachments";
import { useI18n } from "@/hooks/useI18n";

/**
 * Settings › General › Chat: configurable line threshold for automatically
 * converting long pasted prompts into `.md` / `.txt` file attachments.
 */
export function PasteAttachmentSettingRow() {
  const { locale } = useI18n();
  const isZh = locale.startsWith("zh");
  const [threshold, setThreshold] = useState<number>(() => getPasteToFileLineThreshold());

  const applyThreshold = (next: number) => {
    const normalized = !Number.isFinite(next) || next <= 0
      ? 0
      : Math.max(5, Math.min(1000, Math.round(next)));
    setPasteToFileLineThreshold(normalized);
    setThreshold(normalized);
  };

  const title = isZh ? "长文本粘贴自动转为附件" : "Convert long paste to file attachment";
  const hint = isZh
    ? "粘贴达到设定行数的长提示词或日志时，自动转为 .md / .txt 附件卡片，不再塞满输入框"
    : "Automatically convert pasted text reaching this line count into a .md / .txt attachment chip";

  return (
    <div className="settings-chat-option settings-chat-choice-option settings-work-details-option paste-attachment-setting-row">
      <span className="settings-work-details-label">
        <span>{title}</span>
        <span className="settings-option-hint">{hint}</span>
      </span>
      <div className="settings-choice-group" role="group" aria-label={title}>
        {PASTE_TO_FILE_PRESETS.map((preset) => {
          const active = threshold === preset;
          const label = preset === 0
            ? (isZh ? "关闭" : "Off")
            : (isZh ? `${preset} 行` : `${preset} lines`);
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              className={`config-button config-button-small ${active ? "config-button-primary" : "config-button-secondary"}`}
              onClick={() => applyThreshold(preset)}
            >
              {label}
            </button>
          );
        })}
        <label className="paste-threshold-custom-label" title={isZh ? "自定义行数阈值（0 表示关闭）" : "Custom line threshold (0 = off)"}>
          <input
            type="number"
            min={0}
            max={1000}
            step={5}
            value={threshold}
            aria-label={isZh ? "自定义长粘贴行数阈值" : "Custom paste line threshold"}
            className="paste-threshold-custom-input"
            onChange={(event) => {
              const raw = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(raw)) applyThreshold(raw);
            }}
          />
          <span>{isZh ? "行" : "ln"}</span>
        </label>
      </div>
    </div>
  );
}
