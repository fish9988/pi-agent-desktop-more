"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  expandSettingsWindow,
  setSettingsWindowMinimized,
  settingsWindowMinimizedServerSnapshot,
  settingsWindowMinimizedSnapshot,
  subscribeSettingsWindow,
} from "@/lib/plus-settings-window";

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
  // Shared with AppShell: folding must never read as closing, and every way back
  // into Settings (sidebar button, Ctrl+,, the native menu) unfolds this window
  // instead of silently re-setting an already-open section.
  const minimized = useSyncExternalStore(
    subscribeSettingsWindow,
    settingsWindowMinimizedSnapshot,
    settingsWindowMinimizedServerSnapshot,
  );
  const [isStandalonePopup] = useState(() => (
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("plusStandaloneSettings") === "1"
  ));
  const posRef = useRef({ x: 0, y: 0 });
  const foldButtonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

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
      // Everything the focus was in is display:none now; keep the keyboard on the
      // restore control instead of dropping focus to the document body.
      foldButtonRef.current?.focus({ preventScroll: true });
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
    expandSettingsWindow();
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
      moved: false,
    };
  }, [isStandalonePopup, mode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    drag.moved = true;
    const maxOffsetX = Math.max(120, Math.floor(window.innerWidth * 0.42));
    const maxOffsetY = Math.max(80, Math.floor(window.innerHeight * 0.42));
    const nextX = Math.max(-maxOffsetX, Math.min(maxOffsetX, drag.origX + dx));
    const nextY = Math.max(-maxOffsetY, Math.min(maxOffsetY, drag.origY + dy));
    posRef.current = { x: nextX, y: nextY };
    applyTransform(nextX, nextY);
  }, [applyTransform]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    // A click (not a drag) on a folded window brings it back: the bar is the
    // whole visible surface there, so it has to behave like a restore button.
    if (minimized && !drag.moved) expandSettingsWindow();
  }, [minimized]);

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
            : minimized
              ? (isZh ? "设置 · 已收起（点一下恢复）" : "Settings · folded (click to restore)")
              : mode === "dock-right"
                ? (isZh ? "设置（右侧并排）" : "Settings (Docked Right)")
                : (isZh ? "设置窗口（可拖拽 · 不遮挡对话运行）" : "Settings Window (Draggable)")}
        </span>
      </div>

      <div className="plus-settings-window-actions">
        {!isStandalonePopup && (
          <>
            <button
              ref={foldButtonRef}
              type="button"
              className={`plus-settings-win-btn${minimized ? " is-active" : ""}`}
              aria-pressed={minimized}
              onClick={() => (minimized ? expandSettingsWindow() : setSettingsWindowMinimized(true))}
              title={minimized
                ? (isZh ? "展开设置窗口（侧栏设置按钮与 Ctrl+, 同样会恢复）" : "Expand the settings window")
                : (isZh ? "收起为角落小条（随时可恢复）" : "Fold to a corner bar")}
              aria-label={minimized ? (isZh ? "展开设置窗口" : "Expand settings window") : (isZh ? "收起设置窗口" : "Fold settings window")}
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
              {minimized && <span>{isZh ? "展开" : "Expand"}</span>}
            </button>
            {!minimized && (
              <>
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
