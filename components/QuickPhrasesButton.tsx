"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isImeComposing } from "@/lib/ime";
import { scaleVar } from "@/lib/plus-design-scale";
import {
  addCustomQuickPhrase,
  getBuiltinQuickPhrases,
  readCustomQuickPhrases,
  removeCustomQuickPhrase,
  type QuickPhraseItem,
} from "@/lib/quick-phrases";

interface QuickPhrasesButtonProps {
  onInsert: (text: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Plus: Quick Phrases (⚡ 快捷短语) toolbar button and popover in the composer.
 */
export function QuickPhrasesButton({ onInsert, disabled = false, compact = false }: QuickPhrasesButtonProps) {
  const { locale } = useI18n();
  const isMobile = useIsMobile();
  const isTw = locale === "zh-TW";
  const isZh = locale.startsWith("zh");
  const tr = (zhCN: string, zhTW: string, en: string) => (isTw ? zhTW : isZh ? zhCN : en);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [customPhrases, setCustomPhrases] = useState<QuickPhraseItem[]>(() => readCustomQuickPhrases());

  useEffect(() => {
    if (!open) return;
    setCustomPhrases(readCustomQuickPhrases());
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isImeComposing(event)) {
        setOpen(false);
        setAdding(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (adding) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [adding]);

  const builtinPhrases = getBuiltinQuickPhrases(locale);
  const allPhrases = [...customPhrases, ...builtinPhrases];

  const handleSaveCustom = () => {
    const trimmed = draftContent.trim();
    if (!trimmed) return;
    const next = addCustomQuickPhrase(trimmed);
    setCustomPhrases(next);
    setDraftContent("");
    setAdding(false);
  };

  const handleDeleteCustom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = removeCustomQuickPhrase(id);
    setCustomPhrases(next);
  };

  const label = tr("快捷短语", "快捷短語", "Quick phrases");

  return (
    <div
      ref={rootRef}
      className="composer-quick-phrases"
      style={{ position: "relative", order: 5 }}
    >
      <button
        type="button"
        className="native-toolbar-button composer-quick-phrases-button"
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          padding: compact ? "0 6px" : "8px 10px",
          width: compact ? 32 : undefined,
          height: 32,
          background: open ? "var(--bg-hover)" : "none",
          border: "none",
          borderRadius: 8,
          color: "var(--text-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: scaleVar("fs", 1),
          opacity: disabled ? 0.5 : 1,
          transition: "background 0.12s, color 0.12s",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        {!compact && (
          <span className="composer-quick-phrases-label" style={{ whiteSpace: "nowrap" }}>
            {label}
          </span>
        )}
      </button>

      {open && (
        <div
          className="app-menu native-popover composer-quick-phrases-menu"
          role="menu"
          aria-label={label}
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            ...(isMobile ? { left: 0 } : { right: 0 }),
            zIndex: 120,
            width: 300,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "min(60vh, 380px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "var(--bg)",
            border: "var(--hairline) solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 -4px 16px rgba(0,0,0,0.12)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "7px 10px",
              borderBottom: "var(--hairline) solid var(--border)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: scaleVar("fs", 1), fontWeight: 600, color: "var(--text-muted)" }}>
              {label}
            </span>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              style={{
                border: "none",
                background: "none",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: scaleVar("fs", 1),
                fontWeight: 500,
                padding: "2px 4px",
                borderRadius: 4,
              }}
            >
              {adding
                ? tr("取消", "取消", "Cancel")
                : tr("+ 添加常用短语", "+ 新增常用短語", "+ Add phrase")}
            </button>
          </div>

          {adding && (
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "8px 10px",
                borderBottom: "var(--hairline) solid var(--border)",
                background: "var(--bg-subtle, var(--bg-panel))",
                flexShrink: 0,
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                onKeyDown={(e) => {
                  if (isImeComposing(e)) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveCustom();
                  }
                }}
                placeholder={tr("输入常用提示词后按回车…", "輸入常用提示詞後按 Enter…", "Type phrase and press Enter…")}
                aria-label={tr("输入常用提示词", "輸入常用提示詞", "New quick phrase")}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "4px 8px",
                  border: "var(--hairline) solid var(--border)",
                  borderRadius: 5,
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: scaleVar("fs", 1),
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleSaveCustom}
                disabled={!draftContent.trim()}
                style={{
                  padding: "4px 10px",
                  border: "none",
                  borderRadius: 5,
                  background: "var(--accent)",
                  color: "var(--plus-fill-text, #fff)",
                  cursor: draftContent.trim() ? "pointer" : "not-allowed",
                  opacity: draftContent.trim() ? 1 : 0.5,
                  fontSize: scaleVar("fs", 1),
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                {tr("保存", "儲存", "Save")}
              </button>
            </div>
          )}

          <div
            className="app-menu-list"
            style={{
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              padding: 4,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {allPhrases.map((phrase) => (
              <div
                key={phrase.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 6,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  title={phrase.content}
                  onClick={() => {
                    setOpen(false);
                    setAdding(false);
                    onInsert(phrase.content);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                    padding: "6px 8px",
                    border: "none",
                    borderRadius: 6,
                    background: "transparent",
                    color: "var(--text)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: scaleVar("fs", 2),
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span
                    style={{
                      width: "100%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {phrase.content}
                  </span>
                </button>
                {!phrase.builtin && (
                  <button
                    type="button"
                    title={tr("删除此常用短语", "刪除此常用短語", "Delete phrase")}
                    aria-label={tr("删除此常用短语", "刪除此常用短語", "Delete phrase")}
                    onClick={(e) => handleDeleteCustom(phrase.id, e)}
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "none",
                      borderRadius: 4,
                      background: "transparent",
                      color: "var(--text-dim)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
