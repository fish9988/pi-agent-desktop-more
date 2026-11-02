"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { appNotify } from "@/lib/notification-store";

interface Props {
  value: string;
  onReplace: (text: string) => void;
  model?: { provider: string; modelId: string } | null;
  sessionId?: string;
  disabled?: boolean;
}

/**
 * Plus: "optimise prompt" button inside the composer. Rewrites the draft
 * with the composer's model; while the text is still the rewritten version
 * the button turns into "undo" and restores the original draft.
 */
export function PromptOptimizeButton({ value, onReplace, model, sessionId, disabled }: Props) {
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ original: string; optimized: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const canUndo = undo !== null && value === undo.optimized;
  const isEmpty = !busy && !canUndo && !value.trim();
  const isDisabled = (Boolean(disabled) && !busy) || isEmpty;

  const run = async () => {
    if (isEmpty || (disabled && !busy)) return;
    if (busy) {
      abortRef.current?.abort();
      return;
    }
    if (canUndo) {
      onReplace(undo.original);
      setUndo(null);
      return;
    }
    const original = value;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const response = await fetch("/api/prompt-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: original, provider: model?.provider, modelId: model?.modelId, sessionId }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({})) as { text?: string; error?: string; model?: string };
      if (!response.ok || !body.text) throw new Error(body.error || `HTTP ${response.status}`);
      onReplace(body.text);
      setUndo({ original, optimized: body.text });
      appNotify.success({
        message: t("composer.optimizeDone", { model: body.model ?? "" }),
        action: { label: t("composer.optimizeUndo"), run: () => { onReplace(original); setUndo(null); } },
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      appNotify.error({ message: t("composer.optimizeFailed", { error: error instanceof Error ? error.message : String(error) }) });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const emptyHint = locale === "zh-TW"
    ? "輸入內容後可一鍵優化提示詞"
    : locale.startsWith("zh")
      ? "输入内容后可一键优化提示词"
      : "Enter text to optimize prompt";
  const label = busy
    ? t("composer.optimizeCancel")
    : canUndo
      ? t("composer.optimizeUndo")
      : isEmpty
        ? emptyHint
        : t("composer.optimize");
  return (
    <button
      type="button"
      className={`native-toolbar-button composer-optimize-button${busy ? " is-busy" : ""}${canUndo ? " is-undo" : ""}${isEmpty ? " is-empty" : ""}`}
      onClick={() => void run()}
      disabled={isDisabled}
      title={label}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        padding: 0,
        flexShrink: 0,
        alignSelf: "flex-end",
        borderRadius: "var(--plus-r-card, 8px)",
        opacity: isDisabled ? 0.42 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
    >
      {busy ? (
        <svg className="composer-optimize-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
      ) : canUndo ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l1.8 4.6L18.5 9.5l-4.7 1.9L12 16l-1.8-4.6L5.5 9.5l4.7-1.9z" />
          <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        </svg>
      )}
    </button>
  );
}
