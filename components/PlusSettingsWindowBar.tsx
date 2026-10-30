"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/hooks/useI18n";

const STORAGE_KEY_MODE = "pi:plus:settingsWindowMode";

export type SettingsWindowMode = "float" | "dock-right";

interface Props {
  dialogRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  busy?: boolean;
}

export function PlusSettingsWindowBar({ dialogRef, onClose, busy }: Props) {
  const { locale } = useI18n();
  const isZh = locale.startsWith("zh");
  const [mode, setMode] = useState<SettingsWindowMode>(() => {
    if (typeof window === "undefined") return "float";
    return window.localStorage.getItem(STORAGE_KEY_MODE) === "dock-right" ? "dock-right" : "float";
  });
  const [minimized, setMinimized] = useState(false);
  const [isStandalonePopup] = useState(() => (
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("plusStandaloneSettings") === "1"
  ));
  const posRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isStandalonePopup) {
      root.dataset.plusStandaloneSettings = "1";
      delete root.dataset.plusSettingsDock;
      return () => {
        delete root.dataset.plusStandaloneSettings;
      };
    }
    if (mode === "dock-right") {
      root.dataset.plusSettingsDock = "right";
    } else {
      delete root.dataset.plusSettingsDock;
    }
    return () => {
      delete root.dataset.plusSettingsDock;
    };
  }, [isStandalonePopup, mode]);

  useEffect(() => {
    const root = document.documentElement;
    if (minimized) {
      root.dataset.plusSettingsMinimized = "1";
    } else {
      delete root.dataset.plusSettingsMinimized;
    }
    return () => {
      delete root.dataset.plusSettingsMinimized;
    };
  }, [minimized]);

  const applyTransform = useCallback((x: number, y: number) => {
    const surface = dialogRef.current?.querySelector<HTMLElement>(".settings-dialog-surface");
    if (!surface) return;
    surface.style.transform = x === 0 && y === 0 ? "" : `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }, [dialogRef]);

  const toggleDockMode = useCallback(() => {
    setMinimized(false);
    setMode((prev) => {
      const next: SettingsWindowMode = prev === "float" ? "dock-right" : "float";
      try {
        window.localStorage.setItem(STORAGE_KEY_MODE, next);
      } catch {
        // ignore storage errors
      }
      if (next === "dock-right") {
        posRef.current = { x: 0, y: 0 };
        applyTransform(0, 0);
      }
      return next;
    });
  }, [applyTransform]);

  const resetPosition = useCallback(() => {
    posRef.current = { x: 0, y: 0 };
    applyTransform(0, 0);
  }, [applyTransform]);

  const popOutStandaloneWindow = useCallback(() => {
    if (busy || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("plusStandaloneSettings", "1");
    const popup = window.open(
      url.toString(),
      "pi-plus-settings-window",
      "popup=yes,width=940,height=680,left=120,top=80,resizable=yes,scrollbars=yes",
    );
    if (popup) {
      popup.focus();
      onClose();
    }
  }, [busy, onClose]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isStandalonePopup || mode === "dock-right") return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, a")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
    };
  }, [isStandalonePopup, mode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const maxOffsetX = Math.max(120, Math.floor(window.innerWidth * 0.42));
    const maxOffsetY = Math.max(80, Math.floor(window.innerHeight * 0.42));
    const nextX = Math.max(-maxOffsetX, Math.min(maxOffsetX, drag.origX + (e.clientX - drag.startX)));
    const nextY = Math.max(-maxOffsetY, Math.min(maxOffsetY, drag.origY + (e.clientY - drag.startY)));
    posRef.current = { x: nextX, y: nextY };
    applyTransform(nextX, nextY);
  }, [applyTransform]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div
      className="plus-settings-window-bar"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={resetPosition}
    >
      <div className="plus-settings-window-drag-hint">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="7" r="1" />
          <circle cx="15" cy="7" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="9" cy="17" r="1" />
          <circle cx="15" cy="17" r="1" />
        </svg>
        <span>
          {isStandalonePopup
            ? (isZh ? "设置（独立窗口）" : "Settings (Standalone)")
            : mode === "dock-right"
              ? (isZh ? "设置（右侧并排）" : "Settings (Docked Right)")
              : (isZh ? "设置窗口（可拖拽 · 不遮挡对话运行）" : "Settings Window (Draggable)")}
        </span>
      </div>

      <div className="plus-settings-window-actions">
        {!isStandalonePopup && (
          <>
            <button
              type="button"
              className="plus-settings-win-btn"
              onClick={() => setMinimized((v) => !v)}
              title={minimized ? (isZh ? "展开设置窗口" : "Expand settings window") : (isZh ? "折叠为迷你条" : "Minimize to bar")}
              aria-label={minimized ? (isZh ? "展开设置窗口" : "Expand settings window") : (isZh ? "折叠为迷你条" : "Minimize to bar")}
            >
              {minimized ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className={`plus-settings-win-btn${mode === "dock-right" ? " is-active" : ""}`}
              onClick={toggleDockMode}
              title={mode === "dock-right" ? (isZh ? "切换为居中浮动窗口" : "Switch to floating window") : (isZh ? "靠右并排停靠（边看对话边改设置）" : "Dock to right side")}
              aria-label={mode === "dock-right" ? (isZh ? "切换为居中浮动窗口" : "Switch to floating window") : (isZh ? "靠右并排停靠" : "Dock to right side")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="14" y1="3" x2="14" y2="21" />
              </svg>
              <span>{mode === "dock-right" ? (isZh ? "浮动" : "Float") : (isZh ? "并排" : "Dock")}</span>
            </button>
            <button
              type="button"
              className="plus-settings-win-btn"
              onClick={popOutStandaloneWindow}
              disabled={busy}
              title={isZh ? "在新系统窗口中打开设置" : "Open settings in a new OS window"}
              aria-label={isZh ? "在新系统窗口中打开设置" : "Open settings in a new OS window"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span>{isZh ? "独立窗口" : "Pop out"}</span>
            </button>
          </>
        )}
        <button
          type="button"
          className="plus-settings-win-btn is-close"
          onClick={() => {
            if (busy) return;
            if (isStandalonePopup) {
              window.close();
            }
            onClose();
          }}
          disabled={busy}
          title={isZh ? "关闭设置 (Esc)" : "Close settings (Esc)"}
          aria-label={isZh ? "关闭设置" : "Close settings"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
