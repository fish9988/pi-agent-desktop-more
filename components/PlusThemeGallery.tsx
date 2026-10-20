"use client";

import { useEffect, useMemo, useState } from "react";
import type { GalleryTheme } from "@/lib/plus-theme-gallery-opencode";

type Translate = (key: string, params?: Record<string, string | number>) => string;

function half(p: GalleryTheme["definition"]["light"], key: string) {
  if (!p) return null;
  return (
    <span key={key} className="plus-theme-swatch-half" style={{ background: p.workbench }}>
      <span style={{ background: p.panel }} />
      <span>
        <i style={{ background: p.text, opacity: 0.55 }} />
        <i style={{ background: p.syntax?.keyword ?? p.accent, opacity: 0.9 }} />
        <b style={{ background: p.fill ?? p.accent }} />
      </span>
    </span>
  );
}

/**
 * Plus: theme gallery (OpenCode's theme collection, both modes each).
 * Applying a theme installs it as an editable custom theme.
 */
export function PlusThemeGallery({ t, installedNames, busy, onApply, onClose }: {
  t: Translate;
  installedNames: ReadonlySet<string>;
  busy: boolean;
  onApply: (theme: GalleryTheme) => void;
  onClose: () => void;
}) {
  const [themes, setThemes] = useState<readonly GalleryTheme[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/plus-theme-gallery-opencode").then((mod) => { if (!cancelled) setThemes(mod.OPENCODE_GALLERY); });
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (themes ?? []).filter((theme) => !q || theme.name.toLowerCase().includes(q));
  }, [themes, query]);

  return (
    <div className="plus-theme-gallery">
      <div className="plus-theme-gallery-head">
        <input className="plus-theme-name-input" value={query} placeholder={t("plus.gallerySearch")} aria-label={t("plus.gallerySearch")} onChange={(event) => setQuery(event.target.value)} autoFocus />
        <button type="button" className="config-button config-button-small config-button-secondary" onClick={onClose}>{t("plus.cssClose")}</button>
      </div>
      <p className="settings-option-hint plus-theme-hint">{t("plus.galleryHint")}</p>
      {!themes ? (
        <p className="settings-option-hint">{t("plus.galleryLoading")}</p>
      ) : (
        <div className="plus-theme-grid">
          {shown.map((theme) => (
            <div key={theme.id} className="plus-theme-card">
              <button type="button" className="plus-theme-card-main" disabled={busy} onClick={() => onApply(theme)} title={t("plus.galleryApply", { name: theme.name })}>
                <span className="plus-theme-swatch" aria-hidden="true">
                  {half(theme.definition.light, "l")}
                  {half(theme.definition.dark, "d")}
                </span>
                <span className="plus-theme-card-name">{theme.name}</span>
                <span className="plus-theme-card-badge">
                  {installedNames.has(theme.name) ? t("plus.galleryInstalled") : theme.modes === "both" ? t("plus.galleryBoth") : theme.modes === "dark" ? t("plus.galleryDarkOnly") : t("plus.galleryLightOnly")}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
