"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { stripAnsi } from "@/lib/ansi";
import type { ExtensionStatusItem, ExtensionWidgetItem } from "@/lib/types";
import { AnsiText } from "./AnsiText";
import { ExtensionWidgets } from "./ExtensionWidgets";

const POPOVER_WIDTH = 380;

function visibleStatuses(statuses: ExtensionStatusItem[]): ExtensionStatusItem[] {
  return [...statuses]
    .sort((a, b) => a.key.localeCompare(b.key))
    .filter((status) => stripAnsi(status.text).trim().length > 0);
}

/**
 * Plus: extension status texts and below-the-composer widgets behind one chip
 * in the composer's control row, instead of a second strip under it. The
 * chip opens a popover with the widgets (same triggers and panels as before)
 * and one status per line.
 */
export function ComposerExtensionsChip({ widgets, statuses }: { widgets: ExtensionWidgetItem[]; statuses: ExtensionStatusItem[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const items = visibleStatuses(statuses);
  const count = items.length + widgets.length;

  // A widget's content changed: pulse the chip briefly, like the old shelf.
  const [pulse, setPulse] = useState(false);
  const signature = widgets.map((widget) => `${widget.key}:${widget.lines.join("\n")}`).join("\u0000");
  const signatureRef = useRef(signature);
  useEffect(() => {
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 1100);
    return () => window.clearTimeout(id);
  }, [signature]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - POPOVER_WIDTH - 8, rect.left)),
      bottom: window.innerHeight - rect.top + 6,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
        }
        return;
      }
      const target = event.target as Node;
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
    };
  }, [open]);

  if (count === 0) return null;
  const summary = items.map((status) => stripAnsi(status.text).replace(/\s+/g, " ").trim()).join(" · ");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`composer-extensions-chip${open ? " is-open" : ""}${pulse ? " is-updating" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={summary || t("chat.extensionWidgets")}
        aria-label={`${t("composer.extensions")}: ${summary}`}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z" />
        </svg>
        <span className="composer-extensions-label">{t("plus.extensionsShort")}</span>
        <span className="composer-extensions-count">{count}</span>
      </button>
      {open && position && createPortal(
        <div
          ref={popRef}
          role="dialog"
          aria-label={t("composer.extensions")}
          className="native-popover app-menu composer-extensions-popover"
          style={{ position: "fixed", left: position.left, bottom: position.bottom, width: POPOVER_WIDTH, zIndex: 2400 }}
        >
          <div className="composer-extensions-heading">{t("composer.extensions")}</div>
          {items.length > 0 && (
            <ul className="composer-extensions-statuses">
              {items.map((status) => (
                <li key={status.key} title={stripAnsi(status.text)}>
                  <span className="composer-extensions-key">{status.key}</span>
                  <span className="composer-extensions-text"><AnsiText text={status.text} /></span>
                </li>
              ))}
            </ul>
          )}
          {widgets.length > 0 && (
            <div className="composer-extensions-widgets">
              <ExtensionWidgets widgets={widgets} />
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
