"use client";

import { useSyncExternalStore } from "react";
import {
  applyPlusTheme,
  DEFAULT_PLUS_THEME,
  normalizePlusTheme,
  parseStoredPlusTheme,
  PLUS_THEME_STORAGE_KEY,
  type PlusThemeSettings,
} from "@/lib/plus-theme";

let state: PlusThemeSettings | null = null;
const listeners = new Set<() => void>();

function read(): PlusThemeSettings {
  try {
    return parseStoredPlusTheme(window.localStorage.getItem(PLUS_THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_PLUS_THEME;
  }
}

function getSnapshot(): PlusThemeSettings {
  if (typeof window === "undefined") return DEFAULT_PLUS_THEME;
  if (!state) state = read();
  return state;
}

function getServerSnapshot(): PlusThemeSettings {
  return DEFAULT_PLUS_THEME;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PLUS_THEME_STORAGE_KEY) return;
    state = read();
    applyPlusTheme(state);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function updatePlusTheme(patch: Partial<PlusThemeSettings>): void {
  state = normalizePlusTheme({ ...getSnapshot(), ...patch });
  applyPlusTheme(state);
  try {
    window.localStorage.setItem(PLUS_THEME_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort persistence.
  }
  listeners.forEach((listener) => listener());
}

export function usePlusTheme() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { settings, update: updatePlusTheme, reset: () => updatePlusTheme(DEFAULT_PLUS_THEME) };
}
