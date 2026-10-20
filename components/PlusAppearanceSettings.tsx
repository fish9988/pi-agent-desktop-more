"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { usePlusTheme } from "@/hooks/usePlusTheme";
import {
  applyPlusTheme,
  isUserTheme,
  PLUS_ACCENT_PRESETS,
  setUserThemeCss,
  USER_THEME_PREFIX,
  writeUserThemeCache,
} from "@/lib/plus-theme";
import { BUILTIN_THEMES, themeTemplateCss, type BuiltinTheme, type ThemeBase } from "@/lib/plus-theme-catalog";
import type { UserThemeMeta } from "@/lib/plus-user-themes";
import { appNotify } from "@/lib/notification-store";
import { ConfigSwitch } from "./SettingsUi";
import { FontPicker, loadSystemFonts } from "./FontPicker";
import { CUSTOM_CSS_PREVIEW_ID, loadUserTheme, reloadCustomCssLink, THEME_PREVIEW_ATTR } from "./PlusAppearanceRuntime";

type Translate = (key: string, params?: Record<string, string | number>) => string;

function themeName(theme: BuiltinTheme, locale: string): string {
  if (locale === "zh-TW") return theme.name.tw ?? theme.name.zh;
  return locale.startsWith("zh") ? theme.name.zh : theme.name.en;
}

function Swatch({ light, dark }: { light: { panel?: string; bg?: string; accent?: string; text?: string }; dark?: { panel?: string; bg?: string; accent?: string } }) {
  const half = (p: { panel?: string; bg?: string; accent?: string; text?: string }, key: string) => (
    <span key={key} className="plus-theme-swatch-half" style={{ background: p.bg ?? "#ffffff" }}>
      <span style={{ background: p.panel ?? p.bg ?? "#f4f4f5" }} />
      <span>
        <i style={{ background: p.text ?? "currentColor", opacity: 0.55 }} />
        <i style={{ background: p.text ?? "currentColor", opacity: 0.3 }} />
        <b style={{ background: p.accent ?? "#5b4fe0" }} />
      </span>
    </span>
  );
  return (
    <span className="plus-theme-swatch" aria-hidden="true">
      {half(light, "l")}
      {dark && half(dark, "d")}
    </span>
  );
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error || `HTTP ${response.status}`;
}

/** Generic CSS editor with live preview. */
function CssEditor({
  t,
  initial,
  title,
  onPreview,
  onSave,
  onClose,
  extra,
}: {
  t: Translate;
  initial: string;
  title: string;
  onPreview: (css: string | null) => void;
  onSave: (css: string) => Promise<void>;
  onClose: () => void;
  extra?: React.ReactNode;
}) {
  const [css, setCss] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;

  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => previewRef.current(css === saved ? null : css), 120);
    return () => { if (timer.current !== null) window.clearTimeout(timer.current); };
  }, [css, saved]);

  useEffect(() => () => previewRef.current(null), []);

  const save = async () => {
    setStatus("saving");
    setError(null);
    try {
      await onSave(css);
      setSaved(css);
      setStatus("saved");
      window.setTimeout(() => setStatus((value) => (value === "saved" ? "idle" : value)), 1600);
    } catch (saveError) {
      setStatus("error");
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };
  const dirty = css !== saved;

  return (
    <div className="plus-css-editor">
      <div className="plus-css-editor-title">{title}</div>
      {extra}
      <textarea
        value={css}
        spellCheck={false}
        placeholder=":root { --accent: #5b4fe0; }"
        aria-label={title}
        onChange={(event) => setCss(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            void save();
          } else if (event.key === "Tab") {
            event.preventDefault();
            const target = event.currentTarget;
            const { selectionStart, selectionEnd } = target;
            setCss(`${css.slice(0, selectionStart)}  ${css.slice(selectionEnd)}`);
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
        <button type="button" className="config-button config-button-small config-button-secondary" onClick={onClose}>
          {dirty ? t("plus.cssDiscard") : t("plus.cssClose")}
        </button>
        <button type="button" className="config-button config-button-small config-button-primary" disabled={!dirty || status === "saving"} onClick={() => void save()}>
          {t("plus.cssSave")}
        </button>
      </div>
    </div>
  );
}

type Editing =
  | { kind: "custom-css"; css: string }
  | { kind: "theme"; id: string; name: string; base: ThemeBase; css: string };

/** Plus: theme manager, accent, fonts and custom.css. */
export function PlusAppearanceSettings() {
  const { t, locale } = useI18n();
  const { settings, update, reset } = usePlusTheme();
  const [userThemes, setUserThemes] = useState<UserThemeMeta[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshThemes = useCallback(async () => {
    try {
      const response = await fetch("/api/plus-themes", { cache: "no-store" });
      const body = (await response.json()) as { themes?: UserThemeMeta[] };
      setUserThemes(body.themes ?? []);
    } catch {
      // keep the last list
    }
  }, []);

  useEffect(() => { void refreshThemes(); }, [refreshThemes]);
  useEffect(() => { void loadSystemFonts(); }, []);

  const notifyError = (error: unknown) => appNotify.error({ message: error instanceof Error ? error.message : String(error) });

  const createTheme = async (name: string, base: ThemeBase, css: string, apply = true) => {
    const response = await fetch("/api/plus-themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, base, css }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const { theme } = (await response.json()) as { theme: UserThemeMeta };
    await refreshThemes();
    if (apply) update({ theme: `${USER_THEME_PREFIX}${theme.id}` });
    return theme;
  };

  const importFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let applied = false;
    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        const header = /^\/\*\s*plus-theme:\s*(\{.*?\})\s*\*\/\r?\n?/.exec(text);
        let name = file.name.replace(/\.css$/i, "");
        let base: ThemeBase = "native";
        let css = text;
        if (header) {
          try {
            const meta = JSON.parse(header[1]) as { name?: string; base?: string };
            if (meta.name) name = meta.name;
            base = meta.base === "clean" ? "clean" : "native";
            css = text.slice(header[0].length);
          } catch {
            // treat as plain CSS
          }
        }
        await createTheme(name, base, css, !applied);
        applied = true;
      }
      appNotify.success({ message: t("plus.themeImported", { count: files.length }) });
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const importCustomCss = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/custom-css", { cache: "no-store" });
      const css = response.ok ? await response.text() : "";
      if (!css.trim()) throw new Error(t("plus.customCssEmpty"));
      await createTheme(t("plus.customCssThemeName"), "native", css);
      // The theme now carries these styles; keep them from applying twice.
      update({ customCss: false });
      appNotify.success({ message: t("plus.customCssImported") });
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };

  const duplicateBuiltin = async (theme: BuiltinTheme) => {
    setBusy(true);
    try {
      const created = await createTheme(`${themeName(theme, locale)} ${t("plus.themeCopySuffix")}`, theme.base, themeTemplateCss(theme));
      await openThemeEditor(created.id);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };

  const openThemeEditor = async (id: string) => {
    try {
      const response = await fetch(`/api/plus-themes/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const { theme } = (await response.json()) as { theme: { id: string; name: string; base: ThemeBase; css: string } };
      update({ theme: `${USER_THEME_PREFIX}${theme.id}` });
      setEditing({ kind: "theme", id: theme.id, name: theme.name, base: theme.base, css: theme.css });
    } catch (error) {
      notifyError(error);
    }
  };

  const deleteTheme = async (id: string) => {
    try {
      const response = await fetch(`/api/plus-themes/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readError(response));
      if (settings.theme === `${USER_THEME_PREFIX}${id}`) {
        writeUserThemeCache(null);
        setUserThemeCss(null);
        update({ theme: "clean" });
      }
      if (editing?.kind === "theme" && editing.id === id) setEditing(null);
      await refreshThemes();
    } catch (error) {
      notifyError(error);
    } finally {
      setConfirmDelete(null);
    }
  };

  const restoreActiveTheme = async () => {
    delete document.documentElement.dataset[THEME_PREVIEW_ATTR];
    if (!isUserTheme(settings.theme)) return;
    const loaded = await loadUserTheme(settings.theme.slice(USER_THEME_PREFIX.length));
    if (loaded) setUserThemeCss(loaded.css);
  };

  const builtinCards = BUILTIN_THEMES.map((theme) => {
    const selected = settings.theme === theme.id;
    return (
      <div key={theme.id} className={`plus-theme-card${selected ? " is-selected" : ""}`}>
        <button type="button" role="radio" aria-checked={selected} className="plus-theme-card-main" onClick={() => update({ theme: theme.id })}>
          <Swatch
            light={theme.light ? { bg: theme.light.workbench, panel: theme.light.panel, accent: theme.light.accent, text: theme.light.text } : { bg: "#ffffff", panel: "#f2f2f4", accent: "#1d1d1f", text: "#1d1d1f" }}
            dark={theme.dark ? { bg: theme.dark.workbench, panel: theme.dark.panel, accent: theme.dark.accent } : { bg: "#1c1c1e", panel: "#242426", accent: "#f5f5f7" }}
          />
          <span className="plus-theme-card-name">{themeName(theme, locale)}</span>
        </button>
        <button type="button" className="plus-theme-card-action" title={t("plus.themeDuplicate")} aria-label={t("plus.themeDuplicate")} disabled={busy} onClick={() => void duplicateBuiltin(theme)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        </button>
      </div>
    );
  });

  const userCards = userThemes.map((theme) => {
    const value = `${USER_THEME_PREFIX}${theme.id}`;
    const selected = settings.theme === value;
    return (
      <div key={theme.id} className={`plus-theme-card is-user${selected ? " is-selected" : ""}`}>
        <button type="button" role="radio" aria-checked={selected} className="plus-theme-card-main" onClick={() => update({ theme: value })} title={theme.name}>
          <Swatch light={theme.swatch} />
          <span className="plus-theme-card-name">{theme.name}</span>
          <span className="plus-theme-card-badge">{t(theme.base === "clean" ? "plus.style.clean" : "plus.style.native")}</span>
        </button>
        {confirmDelete === theme.id ? (
          <span className="plus-theme-card-confirm">
            <button type="button" className="is-danger" onClick={() => void deleteTheme(theme.id)}>{t("plus.themeDeleteConfirm")}</button>
            <button type="button" onClick={() => setConfirmDelete(null)}>{t("files.cancel")}</button>
          </span>
        ) : (
          <span className="plus-theme-card-actions">
            <button type="button" className="plus-theme-card-action" title={t("plus.themeEdit")} aria-label={t("plus.themeEdit")} onClick={() => void openThemeEditor(theme.id)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
            <a className="plus-theme-card-action" href={`/api/plus-themes/${encodeURIComponent(theme.id)}?download=1`} download title={t("plus.themeExport")} aria-label={t("plus.themeExport")}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </a>
            <button type="button" className="plus-theme-card-action is-danger" title={t("plus.themeDelete")} aria-label={t("plus.themeDelete")} onClick={() => setConfirmDelete(theme.id)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
            </button>
          </span>
        )}
      </div>
    );
  });

  return (
    <div className="plus-appearance">
      <div className="plus-appearance-heading">
        <span>{t("plus.themes")}</span>
        <span className="plus-appearance-heading-actions">
          <input ref={fileInputRef} type="file" accept=".css,text/css" multiple hidden onChange={(event) => void importFiles(event.target.files)} />
          <button type="button" className="config-button config-button-small config-button-secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            {t("plus.themeImport")}
          </button>
          <button type="button" className="config-button config-button-small config-button-secondary" disabled={busy} onClick={() => void importCustomCss()} title={t("plus.themeFromCustomCssHint")}>
            {t("plus.themeFromCustomCss")}
          </button>
        </span>
      </div>
      <div className="plus-theme-grid" role="radiogroup" aria-label={t("plus.themes")}>
        {builtinCards}
        {userCards}
      </div>
      <p className="settings-option-hint plus-theme-hint">{t("plus.themeHint")}</p>

      {editing?.kind === "theme" && (
        <CssEditor
          key={`theme-${editing.id}`}
          t={t}
          initial={editing.css}
          title={t("plus.themeEditing", { name: editing.name })}
          extra={(
            <div className="plus-theme-meta">
              <input
                className="plus-theme-name-input"
                value={editing.name}
                aria-label={t("plus.themeName")}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                onBlur={() => {
                  void fetch(`/api/plus-themes/${encodeURIComponent(editing.id)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: editing.name }),
                  }).then(() => refreshThemes());
                }}
              />
              <div className="settings-choice-group" role="radiogroup" aria-label={t("plus.themeBase")} title={t("plus.themeBaseHint")}>
                {(["native", "clean"] as const).map((base) => (
                  <button
                    key={base}
                    type="button"
                    role="radio"
                    aria-checked={editing.base === base}
                    className={`config-button config-button-small ${editing.base === base ? "config-button-primary" : "config-button-secondary"}`}
                    onClick={() => {
                      setEditing({ ...editing, base });
                      document.documentElement.dataset.plusStyle = base;
                      void fetch(`/api/plus-themes/${encodeURIComponent(editing.id)}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ base }),
                      }).then(async () => {
                        const loaded = await loadUserTheme(editing.id);
                        if (loaded) writeUserThemeCache({ id: editing.id, base: loaded.base, css: loaded.css });
                        applyPlusTheme(settings, base);
                        await refreshThemes();
                      });
                    }}
                  >
                    {t(base === "clean" ? "plus.themeBaseClean" : "plus.themeBaseNative")}
                  </button>
                ))}
              </div>
            </div>
          )}
          onPreview={(css) => {
            if (css === null) {
              void restoreActiveTheme();
              return;
            }
            document.documentElement.dataset[THEME_PREVIEW_ATTR] = "";
            setUserThemeCss(css);
          }}
          onSave={async (css) => {
            const response = await fetch(`/api/plus-themes/${encodeURIComponent(editing.id)}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ css, name: editing.name }),
            });
            if (!response.ok) throw new Error(await readError(response));
            writeUserThemeCache({ id: editing.id, base: editing.base, css });
            delete document.documentElement.dataset[THEME_PREVIEW_ATTR];
            setUserThemeCss(css);
            await refreshThemes();
          }}
          onClose={() => {
            void restoreActiveTheme();
            setEditing(null);
          }}
        />
      )}

      <div className="plus-appearance-row">
        <span>
          <span>{t("plus.accent")}</span>
          <span className="settings-option-hint">{t("plus.accentHint")}</span>
        </span>
        <div className="plus-accent-list" role="radiogroup" aria-label={t("plus.accent")}>
          <button type="button" role="radio" aria-checked={settings.accent === ""} className="config-button config-button-small config-button-secondary" onClick={() => update({ accent: "" })}>
            {t("plus.accentDefault")}
          </button>
          {PLUS_ACCENT_PRESETS.map((color) => (
            <button key={color} type="button" role="radio" aria-checked={settings.accent === color} aria-label={color} title={color} className="plus-accent-swatch" style={{ background: color }} onClick={() => update({ accent: color })} />
          ))}
          <input type="color" className="plus-accent-custom" aria-label={t("plus.accentCustom")} title={t("plus.accentCustom")} value={settings.accent || "#5b4fe0"} onChange={(event) => update({ accent: event.target.value })} />
        </div>
      </div>

      <div className="plus-appearance-heading">
        <span>{t("plus.fonts")}</span>
        <span className="plus-appearance-heading-actions">
          <button type="button" className="config-button config-button-small config-button-secondary" onClick={() => void loadSystemFonts(true).then(() => appNotify.success({ message: t("plus.fontsRefreshed") }))}>
            {t("plus.fontsRefresh")}
          </button>
        </span>
      </div>
      {([
        ["ui", "uiFont", "plus.fontUi", "plus.fontUiHint"],
        ["chat", "chatFont", "plus.fontChat", "plus.fontChatHint"],
        ["code", "codeFont", "plus.fontCode", "plus.fontCodeHint"],
      ] as const).map(([role, key, label, hint]) => (
        <div key={role} className="plus-appearance-row">
          <span>
            <span>{t(label)}</span>
            <span className="settings-option-hint">{t(hint)}</span>
          </span>
          <FontPicker role={role} label={t(label)} value={settings[key]} onChange={(value) => update({ [key]: value })} />
        </div>
      ))}

      <div className="plus-appearance-row">
        <span>
          <span>{t("plus.customCss")}</span>
          <span className="settings-option-hint">{t("plus.customCssHint")}</span>
        </span>
        <ConfigSwitch checked={settings.customCss} label={t("plus.customCss")} onChange={(enabled) => update({ customCss: enabled })} />
      </div>

      {editing?.kind === "custom-css" ? (
        <CssEditor
          key="custom-css"
          t={t}
          initial={editing.css}
          title={t("plus.cssEditor")}
          onPreview={(css) => {
            let style = document.getElementById(CUSTOM_CSS_PREVIEW_ID) as HTMLStyleElement | null;
            const link = document.querySelector<HTMLLinkElement>("link[data-custom-css]");
            if (css === null) {
              style?.remove();
              if (link) link.disabled = !settings.customCss;
              return;
            }
            if (!style) {
              style = document.createElement("style");
              style.id = CUSTOM_CSS_PREVIEW_ID;
              document.head.appendChild(style);
            }
            style.textContent = css;
            if (link) link.disabled = true;
          }}
          onSave={async (css) => {
            const response = await fetch("/api/custom-css", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ css }),
            });
            if (!response.ok) throw new Error(await readError(response));
            document.getElementById(CUSTOM_CSS_PREVIEW_ID)?.remove();
            reloadCustomCssLink(String(Date.now()));
          }}
          onClose={() => setEditing(null)}
        />
      ) : (
        <div className="plus-appearance-row">
          <span>
            <span>{t("plus.cssEditor")}</span>
            <span className="settings-option-hint">{t("plus.cssEditorHint")}</span>
          </span>
          <div className="settings-choice-group">
            <button type="button" className="config-button config-button-small config-button-secondary" onClick={() => reset()}>
              {t("plus.resetAppearance")}
            </button>
            <button
              type="button"
              className="config-button config-button-small config-button-primary"
              onClick={async () => {
                const response = await fetch("/api/custom-css", { cache: "no-store" });
                setEditing({ kind: "custom-css", css: response.ok ? await response.text() : "" });
              }}
            >
              {t("plus.openCssEditor")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
