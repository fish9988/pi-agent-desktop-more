"use client";

import { useSyncExternalStore } from "react";

/**
 * Plus 1.7: the active theme base ("clean" engine or the upstream "native"
 * look), read from `<html data-plus-style>` and kept live when the theme
 * changes. Layouts that only the clean engine styles (the redesign's composer
 * controls row) switch on it, so the native look stays as upstream ships it.
 */
export type PlusStyle = "clean" | "native";

function read(): PlusStyle {
  return document.documentElement.dataset.plusStyle === "native" ? "native" : "clean";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-plus-style"] });
  return () => observer.disconnect();
}

export function usePlusStyle(): PlusStyle {
  // The server cannot see the theme; "clean" is the default theme's base.
  return useSyncExternalStore(subscribe, read, () => "clean");
}
