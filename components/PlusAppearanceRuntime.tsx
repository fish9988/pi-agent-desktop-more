"use client";

import { useEffect } from "react";
import { usePlusTheme } from "@/hooks/usePlusTheme";
import { applyPlusTheme } from "@/lib/plus-theme";

const POLL_MS = 1000;
export const CUSTOM_CSS_PREVIEW_ID = "plus-custom-css-preview";

/** Point the custom.css <link> at a fresh copy of the file. */
export function reloadCustomCssLink(version: string): void {
  const link = document.querySelector<HTMLLinkElement>("link[data-custom-css]");
  if (!link) return;
  const next = `/api/custom-css?v=${encodeURIComponent(version)}`;
  if (link.getAttribute("href") === next) return;
  link.setAttribute("href", next);
  link.media = "all";
}

/**
 * Plus: keeps the appearance layer applied and hot-reloads custom.css.
 *
 * The stylesheet's fingerprint is polled once a second while the window is
 * visible (one tiny localhost request), and the <link> is re-pointed when
 * the file changes, so edits from any editor apply without Ctrl+R.
 */
export function PlusAppearanceRuntime() {
  const { settings } = usePlusTheme();

  useEffect(() => {
    applyPlusTheme(settings);
  }, [settings]);

  useEffect(() => {
    let last: string | null = null;
    let timer: number | null = null;
    let stopped = false;
    const tick = async () => {
      timer = null;
      if (stopped) return;
      if (document.visibilityState === "visible" && !document.getElementById(CUSTOM_CSS_PREVIEW_ID)) {
        try {
          const response = await fetch("/api/custom-css/version", { cache: "no-store" });
          if (response.ok) {
            const { version } = (await response.json()) as { version?: string };
            if (typeof version === "string") {
              if (last !== null && version !== last) reloadCustomCssLink(version);
              last = version;
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
