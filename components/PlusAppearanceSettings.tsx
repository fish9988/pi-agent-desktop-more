"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { usePlusTheme } from "@/hooks/usePlusTheme";
import { PLUS_ACCENT_PRESETS, PLUS_FONTS, PLUS_STYLES, type PlusStyle } from "@/lib/plus-theme";
import { ConfigSwitch } from "./SettingsUi";
import { CUSTOM_CSS_PREVIEW_ID, reloadCustomCssLink } from "./PlusAppearanceRuntime";

const STYLE_SWATCHES: Record<PlusStyle, { side: string; main: string; accent: string }> = {
  clean: { side: "#f4f4f5", main: "#ffffff", accent: "#5b4fe0" },
  native: { side: "#f2f2f4", main: "#ffffff", accent: "#1d1d1f" },
};

function setPreview(css: string | null): void {
  let style = document.getElementById(CUSTOM_CSS_PREVIEW_ID) as HTMLStyleElement | null;
  const link = document.querySelector<HTMLLinkElement>("link[data-custom-css]");
  if (css === null) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = CUSTOM_CSS_PREVIEW_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
  // The preview replaces the saved file while editing instead of stacking on it.
  if (link) link.disabled = true;
}

/** Plus: interface style, accent, font and a live custom.css editor. */
export function PlusAppearanceSettings() {
  const { t } = useI18n();
  const { settings, update, reset } = usePlusTheme();
  const [editorOpen, setEditorOpen] = useState(false);
  const [css, setCss] = useState("");
  const [savedCss, setSavedCss] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const previewTimer = useRef<number | null>(null);

  const restoreLink = useCallback(() => {
    const link = document.querySelector<HTMLLinkElement>("link[data-custom-css]");
    if (link) link.disabled = !settings.customCss;
  }, [settings.customCss]);

  const openEditor = async () => {
    setEditorOpen(true);
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/custom-css", { cache: "no-store" });
      const text = response.ok ? await response.text() : "";
      setCss(text);
      setSavedCss(text);
      setStatus("idle");
    } catch (loadError) {
      setStatus("error");
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  };

  const closeEditor = () => {
    setPreview(null);
    restoreLink();
    setEditorOpen(false);
    setStatus("idle");
  };

  // Live preview while typing.
  useEffect(() => {
    if (!editorOpen || status === "loading") return;
    if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => {
      if (css === savedCss) {
        setPreview(null);
        restoreLink();
      } else {
        setPreview(css);
      }
    }, 120);
    return () => {
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    };
  }, [css, savedCss, editorOpen, status, restoreLink]);

  useEffect(() => () => setPreview(null), []);

  const save = async () => {
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch("/api/custom-css", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ css }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setSavedCss(css);
      setPreview(null);
      restoreLink();
      reloadCustomCssLink(String(Date.now()));
      setStatus("saved");
      window.setTimeout(() => setStatus((value) => (value === "saved" ? "idle" : value)), 1600);
    } catch (saveError) {
      setStatus("error");
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  const dirty = css !== savedCss;

  return (
    <div className="plus-appearance">
      <div className="plus-style-cards" role="radiogroup" aria-label={t("plus.style")}>
        {PLUS_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={settings.style === style}
            className="plus-style-card"
            onClick={() => update({ style })}
            style={{
              ["--swatch-side" as string]: STYLE_SWATCHES[style].side,
              ["--swatch-main" as string]: STYLE_SWATCHES[style].main,
              ["--swatch-accent" as string]: STYLE_SWATCHES[style].accent,
            }}
          >
            <span className="plus-style-swatch" aria-hidden="true"><span /><span /></span>
            <span>{t(`plus.style.${style}`)}</span>
            <span className="settings-option-hint">{t(`plus.styleHint.${style}`)}</span>
          </button>
        ))}
      </div>

      <div className="plus-appearance-row">
        <span>
          <span>{t("plus.accent")}</span>
          <span className="settings-option-hint">{t("plus.accentHint")}</span>
        </span>
        <div className="plus-accent-list" role="radiogroup" aria-label={t("plus.accent")}>
          <button
            type="button"
            role="radio"
            aria-checked={settings.accent === ""}
            className="config-button config-button-small config-button-secondary"
            onClick={() => update({ accent: "" })}
          >
            {t("plus.accentDefault")}
          </button>
          {PLUS_ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={settings.accent === color}
              aria-label={color}
              title={color}
              className="plus-accent-swatch"
              style={{ background: color }}
              onClick={() => update({ accent: color })}
            />
          ))}
          <input
            type="color"
            className="plus-accent-custom"
            aria-label={t("plus.accentCustom")}
            title={t("plus.accentCustom")}
            value={settings.accent || "#5b4fe0"}
            onChange={(event) => update({ accent: event.target.value })}
          />
        </div>
      </div>

      <div className="plus-appearance-row">
        <span>{t("plus.font")}</span>
        <div className="settings-choice-group" role="radiogroup" aria-label={t("plus.font")}>
          {PLUS_FONTS.map((font) => (
            <button
              key={font}
              type="button"
              role="radio"
              aria-checked={settings.font === font}
              className={`config-button config-button-small ${settings.font === font ? "config-button-primary" : "config-button-secondary"}`}
              onClick={() => update({ font })}
            >
              {t(`plus.font.${font}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="plus-appearance-row">
        <span>
          <span>{t("plus.customCss")}</span>
          <span className="settings-option-hint">{t("plus.customCssHint")}</span>
        </span>
        <ConfigSwitch
          checked={settings.customCss}
          label={t("plus.customCss")}
          onChange={(enabled) => update({ customCss: enabled })}
        />
      </div>

      {!editorOpen ? (
        <div className="plus-appearance-row">
          <span>
            <span>{t("plus.cssEditor")}</span>
            <span className="settings-option-hint">{t("plus.cssEditorHint")}</span>
          </span>
          <div className="settings-choice-group">
            <button type="button" className="config-button config-button-small config-button-secondary" onClick={() => reset()}>
              {t("plus.resetAppearance")}
            </button>
            <button type="button" className="config-button config-button-small config-button-primary" onClick={() => void openEditor()}>
              {t("plus.openCssEditor")}
            </button>
          </div>
        </div>
      ) : (
        <div className="plus-css-editor">
          <textarea
            value={css}
            spellCheck={false}
            disabled={status === "loading"}
            placeholder=":root { --accent: #5b4fe0; }"
            aria-label={t("plus.cssEditor")}
            onChange={(event) => setCss(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void save();
              } else if (event.key === "Tab") {
                event.preventDefault();
                const target = event.currentTarget;
                const { selectionStart, selectionEnd } = target;
                const next = `${css.slice(0, selectionStart)}  ${css.slice(selectionEnd)}`;
                setCss(next);
                requestAnimationFrame(() => target.setSelectionRange(selectionStart + 2, selectionStart + 2));
              }
            }}
          />
          <div className="plus-css-editor-actions">
            <span>
              {status === "saving" ? t("plus.cssSaving")
                : status === "saved" ? t("plus.cssSaved")
                  : status === "error" ? (error ?? t("plus.cssError"))
                    : dirty ? t("plus.cssPreviewing") : t("plus.cssLiveHint")}
            </span>
            <span className="spacer" />
            <button type="button" className="config-button config-button-small config-button-secondary" onClick={closeEditor}>
              {dirty ? t("plus.cssDiscard") : t("plus.cssClose")}
            </button>
            <button type="button" className="config-button config-button-small config-button-primary" disabled={!dirty || status === "saving"} onClick={() => void save()}>
              {t("plus.cssSave")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
