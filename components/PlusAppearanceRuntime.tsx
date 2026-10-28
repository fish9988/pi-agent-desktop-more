"use client";

import { useEffect, useRef } from "react";
import { usePlusTheme } from "@/hooks/usePlusTheme";
import {
  applyPlusTheme,
  isUserTheme,
  setUserThemeCss,
  USER_THEME_PREFIX,
  writeUserThemeCache,
} from "@/lib/plus-theme";
import { applyGpuAcceleration } from "@/lib/desktop-notify";
import type { ThemeBase } from "@/lib/plus-theme-catalog";

const POLL_MS = 2500;
export const CUSTOM_CSS_PREVIEW_ID = "plus-custom-css-preview";
/** Set on <html> while the theme editor previews unsaved CSS. */
export const THEME_PREVIEW_ATTR = "plusThemePreview";

/** Point the custom.css <link> at a fresh copy of the file. */
export function reloadCustomCssLink(version: string): void {
  const link = document.querySelector<HTMLLinkElement>("link[data-custom-css]");
  if (!link) return;
  const next = `/api/custom-css?v=${encodeURIComponent(version)}`;
  if (link.getAttribute("href") === next) return;
  link.setAttribute("href", next);
  link.media = "all";
}

/** Fetch a custom theme; `css` is the compiled stylesheet to apply. */
export async function loadUserTheme(id: string): Promise<{ base: ThemeBase; css: string } | null> {
  const response = await fetch(`/api/plus-themes/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) return null;
  const { theme } = (await response.json()) as { theme: { base: ThemeBase; css: string; compiled?: string } };
  return { base: theme.base, css: theme.compiled ?? theme.css };
}

/**
 * Plus: keeps the appearance layer applied and hot-reloads custom.css and the
 * active imported theme.
 *
 * Fingerprints are polled once a second while the window is visible (one tiny
 * localhost request); a change re-points the custom.css <link> or re-fetches
 * the theme, so edits from any editor apply without Ctrl+R.
 */
export function PlusAppearanceRuntime() {
  const { settings, update } = usePlusTheme();
  const themeRef = useRef(settings.theme);
  themeRef.current = settings.theme;
  // Async loads must apply the settings current when they finish, not the
  // ones captured when they started (custom.css may have been switched off).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    applyPlusTheme(settings);
    applyGpuAcceleration();
  }, [settings]);

  // Load the imported theme whenever it becomes active.
  useEffect(() => {
    if (!isUserTheme(settings.theme)) {
      writeUserThemeCache(null);
      return;
    }
    const id = settings.theme.slice(USER_THEME_PREFIX.length);
    let cancelled = false;
    void loadUserTheme(id).then((theme) => {
      if (cancelled) return;
      if (!theme) {
        // Deleted elsewhere: fall back to the default theme.
        writeUserThemeCache(null);
        setUserThemeCss(null);
        update({ theme: "clean" });
        return;
      }
      if (document.documentElement.dataset[THEME_PREVIEW_ATTR] !== undefined) return;
      setUserThemeCss(theme.css);
      writeUserThemeCache({ id, base: theme.base, css: theme.css });
      applyPlusTheme(settingsRef.current, theme.base);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.theme]);

  useEffect(() => {
    let lastCss: string | null = null;
    let lastTheme: string | null = null;
    let lastThemeId: string | null = null;
    let timer: number | null = null;
    let stopped = false;
    const tick = async () => {
      timer = null;
      if (stopped) return;
      const root = document.documentElement;
      const previewing = Boolean(document.getElementById(CUSTOM_CSS_PREVIEW_ID)) || root.dataset[THEME_PREVIEW_ATTR] !== undefined;
      const activeWatch = settingsRef.current.customCssOverlay || isUserTheme(themeRef.current);
      if (document.visibilityState === "visible" && !previewing && activeWatch) {
        const theme = themeRef.current;
        const themeId = isUserTheme(theme) ? theme.slice(USER_THEME_PREFIX.length) : null;
        try {
          const response = await fetch(`/api/custom-css/version${themeId ? `?theme=${encodeURIComponent(themeId)}` : ""}`, { cache: "no-store" });
          if (response.ok) {
            const { version, themeVersion } = (await response.json()) as { version?: string; themeVersion?: string };
            if (typeof version === "string") {
              if (lastCss !== null && version !== lastCss) reloadCustomCssLink(version);
              lastCss = version;
            }
            if (themeId && typeof themeVersion === "string") {
              if (lastThemeId === themeId && lastTheme !== null && themeVersion !== lastTheme && themeVersion !== "none") {
                const loaded = await loadUserTheme(themeId);
                if (loaded && themeRef.current === theme) {
                  setUserThemeCss(loaded.css);
                  writeUserThemeCache({ id: themeId, base: loaded.base, css: loaded.css });
                  root.dataset.plusStyle = loaded.base;
                }
              }
              lastTheme = themeVersion;
              lastThemeId = themeId;
            }
          }
        } catch {
          // The local server may be restarting; try again on the next tick.
        }
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
