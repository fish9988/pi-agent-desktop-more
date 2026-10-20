"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { FONT_SUGGESTIONS, fontStack, type FontRole } from "@/lib/plus-theme";
import type { SystemFont } from "@/lib/system-fonts";

const MAX_ROWS = 250;

let fontsPromise: Promise<SystemFont[]> | null = null;

/** Installed fonts, fetched once per page. */
export function loadSystemFonts(refresh = false): Promise<SystemFont[]> {
  if (!fontsPromise || refresh) {
    fontsPromise = fetch(`/api/system-fonts${refresh ? "?refresh=1" : ""}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ fonts?: SystemFont[] }>)
      .then((body) => body.fonts ?? [])
      .catch(() => {
        fontsPromise = null;
        return [];
      });
  }
  return fontsPromise;
}

function localName(font: SystemFont, locale: string): string | undefined {
  if (locale === "zh-TW") return font.tw ?? font.zh;
  if (locale.startsWith("zh")) return font.zh ?? font.tw;
  return undefined;
}

/**
 * Plus: searchable picker over every installed font family. Each row is drawn
 * in its own font; an unknown name typed into the search can be used as-is
 * (e.g. a comma list or a web font from custom.css).
 */
export function FontPicker({ role, value, onChange, label }: { role: FontRole; value: string; onChange: (value: string) => void; label: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<SystemFont[] | null>(null);
  const [query, setQuery] = useState("");
  const [monoOnly, setMonoOnly] = useState(role === "code");
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  useEffect(() => {
    if (open && fonts === null) void loadSystemFonts().then(setFonts);
  }, [open, fonts]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.max(300, rect.width);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const maxHeight = Math.min(420, Math.max(below, above));
    setPosition({
      top: below >= Math.min(320, above) ? rect.bottom + 4 : Math.max(8, rect.top - 4 - maxHeight),
      left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.left)),
      width,
      maxHeight,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!fonts) return [];
    const needle = query.trim().toLowerCase();
    return fonts.filter((font) => {
      if (monoOnly && !font.mono && !needle) return false;
      if (!needle) return true;
      return font.name.toLowerCase().includes(needle)
        || (font.zh?.toLowerCase().includes(needle) ?? false)
        || (font.tw?.toLowerCase().includes(needle) ?? false);
    });
  }, [fonts, query, monoOnly]);

  const installed = useMemo(() => new Set((fonts ?? []).map((font) => font.name.toLowerCase())), [fonts]);
  const suggestions = FONT_SUGGESTIONS[role].filter((name) => {
    const first = name.split(",")[0].trim().toLowerCase();
    return fonts === null || installed.has(first) || name.includes(",");
  });
  const typed = query.trim();
  const typedIsListed = typed && filtered.some((font) => font.name.toLowerCase() === typed.toLowerCase());

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const previewFamily = (name: string) => fontStack(name, role) ?? undefined;
  const current = value ? value : t("plus.fontDefault");
  const currentFont = fonts?.find((font) => font.name.toLowerCase() === value.toLowerCase());
  const currentLabel = currentFont ? (localName(currentFont, locale) ?? currentFont.name) : current;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="plus-font-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        style={{ fontFamily: value ? previewFamily(value) : undefined }}
      >
        <span className="plus-font-picker-value">{currentLabel}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 4.5 6 7.5 9 4.5" /></svg>
      </button>
      {open && position && createPortal(
        <div
          ref={popRef}
          className="native-popover app-menu plus-font-picker"
          role="listbox"
          aria-label={label}
          style={{ position: "fixed", top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight, zIndex: 2400 }}
        >
          <div className="plus-font-picker-search">
            <input
              autoFocus
              value={query}
              placeholder={t("plus.fontSearch")}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && typed) {
                  event.preventDefault();
                  const exact = filtered.find((font) => font.name.toLowerCase() === typed.toLowerCase());
                  choose(exact?.name ?? filtered[0]?.name ?? typed);
                }
              }}
            />
            {role === "code" && (
              <label className="plus-font-picker-mono">
                <input type="checkbox" checked={monoOnly} onChange={(event) => setMonoOnly(event.target.checked)} />
                {t("plus.fontMonoOnly")}
              </label>
            )}
          </div>
          <div className="plus-font-picker-list">
            <button type="button" role="option" aria-selected={!value} className="plus-font-picker-row" onClick={() => choose("")}>
              <span>{t("plus.fontDefault")}</span>
            </button>
            {typed && !typedIsListed && (
              <button type="button" role="option" aria-selected={false} className="plus-font-picker-row" onClick={() => choose(typed)} style={{ fontFamily: previewFamily(typed) }}>
                <span>{t("plus.fontUseTyped", { name: typed })}</span>
              </button>
            )}
            {!typed && suggestions.length > 0 && (
              <>
                <div className="plus-font-picker-heading">{t("plus.fontSuggested")}</div>
                {suggestions.map((name) => (
                  <button key={`s-${name}`} type="button" role="option" aria-selected={value === name} className="plus-font-picker-row" onClick={() => choose(name)} style={{ fontFamily: previewFamily(name) }}>
                    <span>{name}</span>
                  </button>
                ))}
                <div className="plus-font-picker-heading">{t("plus.fontInstalled", { count: fonts?.length ?? 0 })}</div>
              </>
            )}
            {fonts === null && <div className="plus-font-picker-empty">{t("plus.fontLoading")}</div>}
            {fonts !== null && filtered.length === 0 && <div className="plus-font-picker-empty">{t("plus.fontNone")}</div>}
            {filtered.slice(0, MAX_ROWS).map((font) => {
              const local = localName(font, locale);
              return (
                <button
                  key={font.name}
                  type="button"
                  role="option"
                  aria-selected={value.toLowerCase() === font.name.toLowerCase()}
                  className="plus-font-picker-row"
                  onClick={() => choose(font.name)}
                  style={{ fontFamily: previewFamily(font.name) }}
                  title={font.name}
                >
                  <span>{local ?? font.name}</span>
                  {local && <span className="plus-font-picker-sub">{font.name}</span>}
                  <span className="plus-font-picker-sample">{role === "code" ? "{ }=> 0O 1lI" : "Aa 永字"}</span>
                </button>
              );
            })}
            {filtered.length > MAX_ROWS && <div className="plus-font-picker-empty">{t("plus.fontMore", { count: filtered.length - MAX_ROWS })}</div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
