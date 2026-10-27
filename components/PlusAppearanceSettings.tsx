"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { usePlusTheme } from "@/hooks/usePlusTheme";
import {
  isUserTheme,
  PLUS_ACCENT_PRESETS,
  setCustomCssEnabled,
  setUserThemeCss,
  USER_THEME_PREFIX,
  writeUserThemeCache,
} from "@/lib/plus-theme";
import {
  BUILTIN_THEMES,
  builtinDefinition,
  CUSTOM_THEME_CSS_HINT,
  DEFAULT_THEME_ID,
  definitionFromCss,
  findBuiltinTheme,
  type BuiltinTheme,
  type ThemeBase,
  type ThemeDefinition,
} from "@/lib/plus-theme-catalog";
import type { UserThemeMeta } from "@/lib/plus-user-themes";
import { appNotify } from "@/lib/notification-store";
import { ConfigSwitch } from "./SettingsUi";
import { FontPicker, loadSystemFonts } from "./FontPicker";
import { CUSTOM_CSS_PREVIEW_ID, loadUserTheme, reloadCustomCssLink, THEME_PREVIEW_ATTR } from "./PlusAppearanceRuntime";
import { PaletteThemeEditor } from "./PlusThemeEditor";
import { PlusThemeGallery } from "./PlusThemeGallery";
import { definitionFromVsCodeTheme } from "@/lib/plus-theme-import";
import type { GalleryTheme } from "@/lib/plus-theme-gallery-opencode";

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface CssPreset {
  id: string;
  label: string;
  desc: string;
  css: string;
}

const CSS_STUDIO_PRESETS: readonly CssPreset[] = [
  {
    id: "vermilion-code",
    label: "朱砂墨韵代码",
    desc: "将行内代码胶囊与列表标记改为温润朱砂墨色",
    css: `/* 朱砂墨韵：自定义行内代码颜色、背景与列表圆点 */
html[data-plus-theme]:root {
  --plus-inline-code: #7a2716;
  --plus-inline-code-bg: color-mix(in srgb, #c44d36 13%, var(--surface));
  --plus-inline-code-border: color-mix(in srgb, #c44d36 26%, transparent);
  --plus-marker: #c44d36;
  --plus-user-bar-color: #c44d36;
}
html.dark[data-plus-theme]:root {
  --plus-inline-code: #ffb4a2;
  --plus-inline-code-bg: color-mix(in srgb, #ed6f5c 18%, var(--surface));
  --plus-inline-code-border: color-mix(in srgb, #ed6f5c 32%, transparent);
  --plus-marker: #ed6f5c;
}`,
  },
  {
    id: "emerald-code",
    label: "翡翠松林代码",
    desc: "将强调色、行内代码与题签竖条切换为松石翡翠绿",
    css: `/* 翡翠松林：自定义全局强调色与行内代码配色 */
html[data-plus-theme]:root {
  --accent: #2d6a4f;
  --plus-fill: #2d6a4f;
  --plus-inline-code: #1b4332;
  --plus-inline-code-bg: color-mix(in srgb, #2d6a4f 12%, var(--surface));
  --plus-inline-code-border: color-mix(in srgb, #2d6a4f 25%, transparent);
  --plus-marker: #2d6a4f;
  --plus-user-bar-color: #2d6a4f;
}
html.dark[data-plus-theme]:root {
  --accent: #74c69d;
  --plus-fill: #74c69d;
  --plus-inline-code: #b7e4c7;
  --plus-inline-code-bg: color-mix(in srgb, #74c69d 16%, var(--surface));
}`,
  },
  {
    id: "editorial-headings",
    label: "杂志大标题排版",
    desc: "定制 H1-H3 标题色彩、字重与章节装饰底线",
    css: `/* 杂志刊头排版：定制标题颜色与章节分割线 */
html[data-plus-theme]:root {
  --plus-heading-color: var(--accent);
}
.markdown-body h1,
.markdown-body h2 {
  padding-bottom: 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  letter-spacing: -0.01em;
}
.markdown-body blockquote {
  border-left: 3px solid var(--accent) !important;
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  padding: 8px 14px;
  border-radius: var(--plus-r-card);
}`,
  },
  {
    id: "frosted-glass",
    label: "亚克力毛玻璃",
    desc: "开启侧边栏、顶栏、卡片与输入舱半透明毛玻璃特效",
    css: `/* 亚克力毛玻璃特效（Frosted Glass） */
html[data-plus-theme]:root {
  --plus-glass-blur: 20px;
  --plus-glass-saturation: 160%;
  --plus-surface-alpha: 26%;
}`,
  },
  {
    id: "aurora-wallpaper",
    label: "流光壁纸 + 毛玻璃",
    desc: "注入暖金霞光渐变壁纸并开启全界面毛玻璃悬浮感",
    css: `/* 流光壁纸 + 全界面毛玻璃悬浮层次 */
html[data-plus-theme]:root {
  --plus-bg-image:
    radial-gradient(circle at 15% 18%, rgba(196, 77, 54, 0.22), transparent 45%),
    radial-gradient(circle at 85% 22%, rgba(233, 185, 74, 0.24), transparent 48%),
    radial-gradient(circle at 52% 88%, rgba(82, 102, 44, 0.18), transparent 52%);
  --plus-glass-blur: 22px;
  --plus-glass-saturation: 165%;
  --plus-surface-alpha: 32%;
}`,
  },
  {
    id: "widescreen-clean",
    label: "宽屏沉浸布局",
    desc: "扩展对话阅读区版心至 980px 并增大圆角",
    css: `/* 宽屏沉浸布局与柔和圆角 */
html[data-plus-theme]:root {
  --chat-content-max-width: 980px !important;
  --plus-r-ctl: 6px;
  --plus-r-card: 12px;
  --plus-r-overlay: 16px;
}`,
  },
];

function themeName(theme: BuiltinTheme, locale: string): string {
  if (locale === "zh-TW") return theme.name.tw ?? theme.name.zh;
  return locale.startsWith("zh") ? theme.name.zh : theme.name.en;
}

function Swatch({ light, dark }: { light: { panel?: string; bg?: string; accent?: string; text?: string }; dark?: { panel?: string; bg?: string; accent?: string } }) {
  const half = (p: { panel?: string; bg?: string; accent?: string; text?: string }, key: string) => (
    <span key={key} className="plus-theme-swatch-half" style={{ background: p.bg }}>
      <span style={{ background: p.panel ?? p.bg }} />
      <span>
        <i style={{ background: p.text ?? "currentColor", opacity: 0.55 }} />
        <i style={{ background: p.text ?? "currentColor", opacity: 0.3 }} />
        <b style={{ background: p.accent }} />
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
    timer.current = window.setTimeout(() => previewRef.current(css === saved ? null : css), 100);
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
        placeholder="html[data-plus-theme]:root { --accent: #c44d36; }"
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

type EditingTheme = {
  id: string;
  name: string;
  base: ThemeBase;
  css: string;
  definition?: ThemeDefinition;
};

/**
 * Plus 1.10: Modern minimal Appearance Studio (Apple / Google grouped cards),
 * 5 curated themes on the single Plus layered base, built-in live Custom CSS
 * studio with one-click presets, and a floating Global Window Preview mode.
 */
export function PlusAppearanceSettings({
  livePreviewMode = false,
  onToggleLivePreview,
}: {
  livePreviewMode?: boolean;
  onToggleLivePreview?: () => void;
}) {
  const { t, locale } = useI18n();
  const { settings, update, reset } = usePlusTheme();
  const [userThemes, setUserThemes] = useState<UserThemeMeta[]>([]);
  const [editingTheme, setEditingTheme] = useState<EditingTheme | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Built-in Custom CSS Studio state (always ready in the Custom CSS card)
  const [customCss, setCustomCss] = useState("");
  const [savedCustomCss, setSavedCustomCss] = useState("");
  const [cssStatus, setCssStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cssError, setCssError] = useState<string | null>(null);
  const [showCssGuide, setShowCssGuide] = useState(false);

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

  // Load existing custom.css on mount
  useEffect(() => {
    let active = true;
    void fetch("/api/custom-css", { cache: "no-store" })
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!active) return;
        setCustomCss(text);
        setSavedCustomCss(text);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Live-inject customCss edits into <style id="plus-custom-css-preview">
  useEffect(() => {
    const dirty = customCss !== savedCustomCss;
    let style = document.getElementById(CUSTOM_CSS_PREVIEW_ID) as HTMLStyleElement | null;
    if (!dirty) {
      style?.remove();
      setCustomCssEnabled(settings.customCssOverlay);
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = CUSTOM_CSS_PREVIEW_ID;
    }
    // Append at the end of <head> so live edits override built-in theme tokens
    document.head.appendChild(style);
    style.textContent = customCss;
    setCustomCssEnabled(false);
  }, [customCss, savedCustomCss, settings.customCssOverlay]);

  useEffect(() => () => {
    document.getElementById(CUSTOM_CSS_PREVIEW_ID)?.remove();
  }, []);

  const saveCustomCss = async (nextCss = customCss) => {
    setCssStatus("saving");
    setCssError(null);
    try {
      const response = await fetch("/api/custom-css", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ css: nextCss }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setSavedCustomCss(nextCss);
      document.getElementById(CUSTOM_CSS_PREVIEW_ID)?.remove();
      const shouldEnable = Boolean(nextCss.trim());
      if (settings.customCssOverlay !== shouldEnable) {
        update({ customCssOverlay: shouldEnable });
      }
      setCustomCssEnabled(shouldEnable);
      reloadCustomCssLink(String(Date.now()));
      setCssStatus("saved");
      window.setTimeout(() => setCssStatus((value) => (value === "saved" ? "idle" : value)), 1600);
    } catch (err) {
      setCssStatus("error");
      setCssError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyPresetSnippet = (preset: CssPreset) => {
    const next = customCss.includes(preset.css)
      ? customCss
      : customCss.trim()
        ? `${customCss.trim()}\n\n${preset.css}\n`
        : `${preset.css}\n`;
    setCustomCss(next);
    if (!settings.customCssOverlay) {
      update({ customCssOverlay: true });
    }
  };

  const notifyError = (error: unknown) => appNotify.error({ message: error instanceof Error ? error.message : String(error) });

  const createTheme = async (name: string, base: ThemeBase, css: string, apply = true, definition?: ThemeDefinition) => {
    const response = await fetch("/api/plus-themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, base: "clean", css, definition }),
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
        if (/\.jsonc?$/i.test(file.name)) {
          const converted = definitionFromVsCodeTheme(text);
          await createTheme(converted.name || file.name.replace(/\.jsonc?$/i, "").replace(/-color-theme$/i, ""), "clean", CUSTOM_THEME_CSS_HINT, !applied, converted.definition);
          applied = true;
          continue;
        }
        const header = /^\/\*\s*plus-theme:\s*(\{.*?\})\s*\*\/\r?\n?/.exec(text);
        let name = file.name.replace(/\.css$/i, "");
        let css = text;
        if (header) {
          try {
            const meta = JSON.parse(header[1]) as { name?: string };
            if (meta.name) name = meta.name;
            css = text.slice(header[0].length);
          } catch {
            // treat as plain CSS
          }
        }
        await createTheme(name, "clean", css, !applied);
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

  const duplicateBuiltin = (theme: BuiltinTheme) => duplicateBuiltinAs(theme, `${themeName(theme, locale)} ${t("plus.themeCopySuffix")}`);

  const newTheme = async () => {
    const start = findBuiltinTheme(settings.theme);
    await duplicateBuiltinAs(start?.light ? start : findBuiltinTheme(DEFAULT_THEME_ID)!, t("plus.newThemeName"));
  };

  const duplicateBuiltinAs = async (theme: BuiltinTheme, name: string) => {
    setBusy(true);
    try {
      const created = await createTheme(name, "clean", CUSTOM_THEME_CSS_HINT, true, builtinDefinition(theme));
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
      const { theme } = (await response.json()) as { theme: { id: string; name: string; base: ThemeBase; css: string; definition?: ThemeDefinition } };
      update({ theme: `${USER_THEME_PREFIX}${theme.id}` });
      setEditingTheme({ id: theme.id, name: theme.name, base: "clean", css: theme.css, definition: theme.definition });
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
        update({ theme: DEFAULT_THEME_ID });
      }
      if (editingTheme?.id === id) setEditingTheme(null);
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

  const applyGalleryTheme = async (theme: GalleryTheme) => {
    const existing = userThemes.find((item) => item.name === theme.name && item.hasPalette);
    if (existing) {
      update({ theme: `${USER_THEME_PREFIX}${existing.id}` });
      return;
    }
    setBusy(true);
    try {
      await createTheme(theme.name, "clean", CUSTOM_THEME_CSS_HINT, true, theme.definition);
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };

  const builtinCards = BUILTIN_THEMES.map((theme) => {
    const selected = settings.theme === theme.id;
    return (
      <div key={theme.id} className={`plus-theme-card${selected ? " is-selected" : ""}`}>
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          className="plus-theme-card-main"
          title={theme.description ? (locale.startsWith("zh") ? theme.description.zh : theme.description.en) : undefined}
          onClick={() => update({ theme: theme.id, accent: "" })}
        >
          <Swatch
            light={{ bg: theme.light?.workbench, panel: theme.light?.panel, accent: theme.light?.accent, text: theme.light?.text }}
            dark={{ bg: theme.dark?.workbench, panel: theme.dark?.panel, accent: theme.dark?.accent }}
          />
          <span className="plus-theme-card-name">{themeName(theme, locale)}</span>
          {theme.id === DEFAULT_THEME_ID && <span className="plus-theme-card-badge">{t("plus.themeBadgeDefault")}</span>}
        </button>
        <button
          type="button"
          className="plus-theme-card-action"
          title={t("plus.themeDuplicate")}
          aria-label={t("plus.themeDuplicate")}
          disabled={busy}
          onClick={() => void duplicateBuiltin(theme)}
        >
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
        <button type="button" role="radio" aria-checked={selected} className="plus-theme-card-main" onClick={() => update({ theme: value, accent: "" })} title={theme.name}>
          <Swatch light={theme.swatch} dark={theme.swatchDark} />
          <span className="plus-theme-card-name">{theme.name}</span>
          <span className="plus-theme-card-badge">{t(theme.hasPalette ? "plus.themeBadgePalette" : "plus.themeBadgeCssClean")}</span>
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

  const cssDirty = customCss !== savedCustomCss;

  return (
    <div className="plus-appearance">
      {/* Card 1: 5 Curated Themes & Accent Colour */}
      <div className="plus-studio-card">
        <div className="plus-appearance-heading">
          <span>
            <strong>{t("plus.themes")}</strong>
            <span className="plus-studio-subtitle">基于 Plus 唯一分层底层 · 5 款精选主题与自定义扩展</span>
          </span>
          <span className="plus-appearance-heading-actions">
            <input ref={fileInputRef} type="file" accept=".css,text/css,.json,.jsonc,application/json" multiple hidden onChange={(event) => void importFiles(event.target.files)} />
            {onToggleLivePreview && (
              <button
                type="button"
                className={`config-button config-button-small ${livePreviewMode ? "config-button-primary" : "config-button-secondary"}`}
                onClick={onToggleLivePreview}
                title="将设置窗口收起为右下角浮窗，直接观察整个主界面的实时预览效果"
              >
                {livePreviewMode ? "退出全局界面预览" : "全局界面实时预览"}
              </button>
            )}
            <button type="button" className="config-button config-button-small config-button-secondary" disabled={busy} onClick={() => void newTheme()}>
              {t("plus.themeNew")}
            </button>
            <button type="button" className={`config-button config-button-small ${galleryOpen ? "config-button-primary" : "config-button-secondary"}`} aria-pressed={galleryOpen} onClick={() => setGalleryOpen((open) => !open)}>
              {t("plus.themeGallery")}
            </button>
            <button type="button" className="config-button config-button-small config-button-secondary" disabled={busy} onClick={() => fileInputRef.current?.click()} title={t("plus.themeImportHint")}>
              {t("plus.themeImport")}
            </button>
          </span>
        </div>

        <div className="plus-theme-grid" role="radiogroup" aria-label={t("plus.themes")}>
          {builtinCards}
          {userCards}
        </div>

        {galleryOpen && (
          <PlusThemeGallery
            t={t}
            busy={busy}
            installedNames={new Set(userThemes.filter((item) => item.hasPalette).map((item) => item.name))}
            onApply={(theme) => void applyGalleryTheme(theme)}
            onClose={() => setGalleryOpen(false)}
          />
        )}

        {editingTheme && editingTheme.definition && (
          <PaletteThemeEditor
            key={`palette-${editingTheme.id}`}
            t={t}
            id={editingTheme.id}
            name={editingTheme.name}
            definition={editingTheme.definition}
            css={editingTheme.css}
            onSave={async ({ name, definition, css, compiled }) => {
              const response = await fetch(`/api/plus-themes/${encodeURIComponent(editingTheme.id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, definition, css }),
              });
              if (!response.ok) throw new Error(await readError(response));
              writeUserThemeCache({ id: editingTheme.id, base: "clean", css: compiled });
              await refreshThemes();
            }}
            onClose={() => {
              void restoreActiveTheme();
              setEditingTheme(null);
            }}
          />
        )}

        {editingTheme && !editingTheme.definition && (
          <CssEditor
            key={`theme-${editingTheme.id}`}
            t={t}
            initial={editingTheme.css}
            title={t("plus.themeEditing", { name: editingTheme.name })}
            extra={(
              <div className="plus-theme-meta">
                <button
                  type="button"
                  className="config-button config-button-small config-button-secondary"
                  title={t("plus.convertToPaletteHint")}
                  onClick={async () => {
                    const fromTemplate = editingTheme.css.trimStart().startsWith("/* Based on the built-in");
                    const definition = definitionFromCss(editingTheme.css);
                    const css = fromTemplate ? CUSTOM_THEME_CSS_HINT : editingTheme.css;
                    try {
                      const response = await fetch(`/api/plus-themes/${encodeURIComponent(editingTheme.id)}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ definition, css, base: "clean" }),
                      });
                      if (!response.ok) throw new Error(await readError(response));
                      const loaded = await loadUserTheme(editingTheme.id);
                      if (loaded) {
                        writeUserThemeCache({ id: editingTheme.id, base: "clean", css: loaded.css });
                        setUserThemeCss(loaded.css);
                      }
                      delete document.documentElement.dataset[THEME_PREVIEW_ATTR];
                      document.documentElement.dataset.plusStyle = "clean";
                      await refreshThemes();
                      setEditingTheme({ ...editingTheme, base: "clean", definition, css });
                    } catch (error) {
                      notifyError(error);
                    }
                  }}
                >
                  {t("plus.convertToPalette")}
                </button>
                <input
                  className="plus-theme-name-input"
                  value={editingTheme.name}
                  aria-label={t("plus.themeName")}
                  onChange={(event) => setEditingTheme({ ...editingTheme, name: event.target.value })}
                  onBlur={() => {
                    void fetch(`/api/plus-themes/${encodeURIComponent(editingTheme.id)}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: editingTheme.name }),
                    }).then(() => refreshThemes());
                  }}
                />
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
              const response = await fetch(`/api/plus-themes/${encodeURIComponent(editingTheme.id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ css, name: editingTheme.name, base: "clean" }),
              });
              if (!response.ok) throw new Error(await readError(response));
              writeUserThemeCache({ id: editingTheme.id, base: "clean", css });
              delete document.documentElement.dataset[THEME_PREVIEW_ATTR];
              setUserThemeCss(css);
              await refreshThemes();
            }}
            onClose={() => {
              void restoreActiveTheme();
              setEditingTheme(null);
            }}
          />
        )}

        <div className="plus-appearance-row plus-accent-row">
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
            <input type="color" className="plus-accent-custom" aria-label={t("plus.accentCustom")} title={t("plus.accentCustom")} value={settings.accent || "#c44d36"} onChange={(event) => update({ accent: event.target.value })} />
          </div>
        </div>
      </div>

      {/* Card 2: Typography & System Fonts */}
      {!livePreviewMode && (
        <div className="plus-studio-card">
          <div className="plus-appearance-heading">
            <span>
              <strong>{t("plus.fonts")}</strong>
              <span className="plus-studio-subtitle">独立配置界面、对话阅读、标题粗体与代码等宽字体</span>
            </span>
            <span className="plus-appearance-heading-actions">
              <button type="button" className="config-button config-button-small config-button-secondary" onClick={() => void loadSystemFonts(true).then(() => appNotify.success({ message: t("plus.fontsRefreshed") }))}>
                {t("plus.fontsRefresh")}
              </button>
              <button type="button" className="config-button config-button-small config-button-secondary" onClick={() => reset()}>
                {t("plus.resetAppearance")}
              </button>
            </span>
          </div>
          {([
            ["ui", "uiFont", "plus.fontUi", "plus.fontUiHint"],
            ["chat", "chatFont", "plus.fontChat", "plus.fontChatHint"],
            ["chatBold", "chatBoldFont", "plus.fontChatBold", "plus.fontChatBoldHint"],
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
        </div>
      )}

      {/* Card 3: Custom CSS Studio with Live Global Preview & One-Click Presets */}
      <div className="plus-studio-card plus-css-studio-card">
        <div className="plus-appearance-heading">
          <span>
            <strong>自定义 CSS 工作台（Custom CSS Studio）</strong>
            <span className="plus-studio-subtitle">
              实时覆盖全局色彩、行内代码、标题样式、版心布局、背景壁纸与毛玻璃特效（自动同步至 ~/.pi/agent/desktop/custom.css）
            </span>
          </span>
          <span className="plus-appearance-heading-actions">
            {onToggleLivePreview && (
              <button
                type="button"
                className={`config-button config-button-small ${livePreviewMode ? "config-button-primary" : "config-button-secondary"}`}
                onClick={onToggleLivePreview}
              >
                {livePreviewMode ? "返回完整设置" : "开启全局界面预览"}
              </button>
            )}
            <button
              type="button"
              className="config-button config-button-small config-button-secondary"
              onClick={() => setShowCssGuide((v) => !v)}
            >
              {showCssGuide ? "收起接口速查" : "设计接口速查"}
            </button>
            <ConfigSwitch
              checked={settings.customCssOverlay}
              label={t("plus.customCss")}
              onChange={(enabled) => update({ customCssOverlay: enabled })}
            />
          </span>
        </div>

        <div className="plus-css-presets" aria-label="一键风格与特效预设">
          {CSS_STUDIO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="plus-css-preset-chip"
              title={preset.desc}
              onClick={() => applyPresetSnippet(preset)}
            >
              <span className="plus-css-preset-dot" aria-hidden="true" />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>

        {showCssGuide && (
          <div className="plus-css-guide-drawer">
            <div className="plus-css-guide-grid">
              <div>
                <strong>色彩与行内代码接口（放在 <code>html[data-plus-theme]:root</code>）</strong>
                <ul>
                  <li><code>--accent</code> / <code>--plus-fill</code>：全局强调色与主按钮色</li>
                  <li><code>--plus-inline-code</code> / <code>--plus-inline-code-bg</code> / <code>--plus-inline-code-border</code>：行内代码文字色、胶囊背景与边框色</li>
                  <li><code>--plus-marker</code>：列表圆点与序号颜色</li>
                  <li><code>--plus-heading-color</code> / <code>--plus-link-color</code>：标题与链接颜色</li>
                  <li><code>--plus-user-bar-color</code>：用户提问卡左侧竖条颜色</li>
                </ul>
              </div>
              <div>
                <strong>壁纸、毛玻璃与布局接口（完整说明见 <code>docs/CUSTOM-CSS.md</code>）</strong>
                <ul>
                  <li><code>--plus-bg-image</code>：背景壁纸（如 <code>url(&quot;https://...&quot;)</code> 或渐变）</li>
                  <li><code>--plus-glass-blur</code>：面板毛玻璃模糊度（如 <code>20px</code>）</li>
                  <li><code>--plus-surface-alpha</code>：面板透明混合比例（如 <code>28%</code>）</li>
                  <li><code>--chat-content-max-width</code>：对话版心最大宽度（如 <code>960px</code>）</li>
                  <li><code>--plus-r-ctl</code> / <code>--plus-r-card</code> / <code>--plus-r-overlay</code>：三级圆角</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="plus-css-editor">
          <textarea
            value={customCss}
            spellCheck={false}
            placeholder={"/* 在此输入自定义 CSS，输入即刻全局实时预览 */\nhtml[data-plus-theme]:root {\n  --plus-inline-code: #7a2716;\n  --plus-inline-code-bg: rgba(196, 77, 54, 0.12);\n  --plus-glass-blur: 16px;\n}"}
            aria-label="自定义 CSS 编辑器"
            onChange={(event) => setCustomCss(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void saveCustomCss();
              } else if (event.key === "Tab") {
                event.preventDefault();
                const target = event.currentTarget;
                const { selectionStart, selectionEnd } = target;
                setCustomCss(`${customCss.slice(0, selectionStart)}  ${customCss.slice(selectionEnd)}`);
                requestAnimationFrame(() => target.setSelectionRange(selectionStart + 2, selectionStart + 2));
              }
            }}
          />
          <div className="plus-css-editor-actions">
            <span>
              {cssStatus === "saving" ? t("plus.cssSaving")
                : cssStatus === "saved" ? t("plus.cssSaved")
                  : cssStatus === "error" ? (cssError ?? t("plus.cssError"))
                    : cssDirty ? "实时预览生效中 · 点击保存写入 custom.css" : t("plus.cssLiveHint")}
            </span>
            <span className="spacer" />
            {customCss.trim().length > 0 && (
              <button
                type="button"
                className="config-button config-button-small config-button-secondary"
                onClick={() => {
                  setCustomCss("");
                  void saveCustomCss("");
                }}
              >
                清空规则
              </button>
            )}
            {cssDirty && (
              <button
                type="button"
                className="config-button config-button-small config-button-secondary"
                onClick={() => setCustomCss(savedCustomCss)}
              >
                {t("plus.cssDiscard")}
              </button>
            )}
            <button
              type="button"
              className="config-button config-button-small config-button-primary"
              disabled={!cssDirty || cssStatus === "saving"}
              onClick={() => void saveCustomCss()}
            >
              {t("plus.cssSave")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
