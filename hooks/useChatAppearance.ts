"use client";

import { useSyncExternalStore } from "react";

export const CHAT_CONTENT_WIDTH_DEFAULT = 820;
// Plus: allow narrower columns; 820px as a floor made the slider useless on
// laptop screens and when the side panels are open.
export const CHAT_CONTENT_WIDTH_MIN = 480;
export const CHAT_CONTENT_WIDTH_MAX = 2400;
export const CHAT_CONTENT_WIDTH_STORAGE_KEY = "pi-chat-content-width";
export const CHAT_CONTENT_WIDTH_PERCENT_DEFAULT = 80;
export const CHAT_CONTENT_WIDTH_PERCENT_MIN = 30;
export const CHAT_CONTENT_WIDTH_PERCENT_MAX = 100;
export const CHAT_CONTENT_WIDTH_PERCENT_STORAGE_KEY = "pi-chat-content-width-percent";
export const CHAT_CONTENT_WIDTH_UNIT_STORAGE_KEY = "pi-chat-content-width-unit";
export const CHAT_CONTENT_FONT_SIZE_DEFAULT = 14;
export const CHAT_CONTENT_FONT_SIZE_MIN = 12;
export const CHAT_CONTENT_FONT_SIZE_MAX = 24;
export const CHAT_CONTENT_FONT_SIZE_STORAGE_KEY = "pi-chat-content-font-size";

/** `px`: fixed maximum width. `percent`: share of the chat column. */
export type ChatWidthUnit = "px" | "percent";

interface ChatAppearance {
  width: number;
  widthPercent: number;
  widthUnit: ChatWidthUnit;
  fontSize: number;
}

const DEFAULT_APPEARANCE: ChatAppearance = {
  width: CHAT_CONTENT_WIDTH_DEFAULT,
  widthPercent: CHAT_CONTENT_WIDTH_PERCENT_DEFAULT,
  widthUnit: "px",
  fontSize: CHAT_CONTENT_FONT_SIZE_DEFAULT,
};
let appearance: ChatAppearance | null = null;
const listeners = new Set<() => void>();

export function clampChatContentWidth(value: unknown): number {
  const width = Number(value);
  if (value === null || value === undefined || !Number.isFinite(width)) return CHAT_CONTENT_WIDTH_DEFAULT;
  return Math.max(CHAT_CONTENT_WIDTH_MIN, Math.min(CHAT_CONTENT_WIDTH_MAX, Math.round(width)));
}

export function clampChatContentWidthPercent(value: unknown): number {
  const percent = Number(value);
  if (value === null || value === undefined || !Number.isFinite(percent)) return CHAT_CONTENT_WIDTH_PERCENT_DEFAULT;
  return Math.max(CHAT_CONTENT_WIDTH_PERCENT_MIN, Math.min(CHAT_CONTENT_WIDTH_PERCENT_MAX, Math.round(percent)));
}

export function normalizeChatWidthUnit(value: unknown): ChatWidthUnit {
  return value === "percent" ? "percent" : "px";
}

export function clampChatContentFontSize(value: unknown): number {
  const size = Number(value ?? CHAT_CONTENT_FONT_SIZE_DEFAULT);
  if (!Number.isFinite(size)) return CHAT_CONTENT_FONT_SIZE_DEFAULT;
  return Math.max(CHAT_CONTENT_FONT_SIZE_MIN, Math.min(CHAT_CONTENT_FONT_SIZE_MAX, Math.round(size)));
}

function readStoredPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredPreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort browser preference persistence.
  }
}

/** CSS value for `--chat-content-max-width`. */
export function chatContentMaxWidthValue(state: Pick<ChatAppearance, "width" | "widthPercent" | "widthUnit">): string {
  return state.widthUnit === "percent" ? `${state.widthPercent}%` : `${state.width}px`;
}

function applyAppearance(state: ChatAppearance): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--chat-content-max-width", chatContentMaxWidthValue(state));
  document.documentElement.style.setProperty("--chat-content-font-size", `${state.fontSize}px`);
}

function getSnapshot(): ChatAppearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  if (!appearance) {
    appearance = {
      width: clampChatContentWidth(readStoredPreference(CHAT_CONTENT_WIDTH_STORAGE_KEY)),
      widthPercent: clampChatContentWidthPercent(readStoredPreference(CHAT_CONTENT_WIDTH_PERCENT_STORAGE_KEY)),
      widthUnit: normalizeChatWidthUnit(readStoredPreference(CHAT_CONTENT_WIDTH_UNIT_STORAGE_KEY)),
      fontSize: clampChatContentFontSize(readStoredPreference(CHAT_CONTENT_FONT_SIZE_STORAGE_KEY)),
    };
    applyAppearance(appearance);
  }
  return appearance;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function update(next: Partial<ChatAppearance>): void {
  appearance = { ...getSnapshot(), ...next };
  applyAppearance(appearance);
  listeners.forEach((listener) => listener());
}

const setWidth = (value: number) => {
  const width = clampChatContentWidth(value);
  writeStoredPreference(CHAT_CONTENT_WIDTH_STORAGE_KEY, String(width));
  update({ width });
};
const setWidthPercent = (value: number) => {
  const widthPercent = clampChatContentWidthPercent(value);
  writeStoredPreference(CHAT_CONTENT_WIDTH_PERCENT_STORAGE_KEY, String(widthPercent));
  update({ widthPercent });
};
const setWidthUnit = (value: ChatWidthUnit) => {
  const widthUnit = normalizeChatWidthUnit(value);
  writeStoredPreference(CHAT_CONTENT_WIDTH_UNIT_STORAGE_KEY, widthUnit);
  update({ widthUnit });
};
/** Reset the active unit's width to its default. */
const resetWidth = () => {
  if (getSnapshot().widthUnit === "percent") setWidthPercent(CHAT_CONTENT_WIDTH_PERCENT_DEFAULT);
  else setWidth(CHAT_CONTENT_WIDTH_DEFAULT);
};
const setFontSize = (value: number) => {
  const fontSize = clampChatContentFontSize(value);
  writeStoredPreference(CHAT_CONTENT_FONT_SIZE_STORAGE_KEY, String(fontSize));
  update({ fontSize });
};

export function useChatAppearance() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_APPEARANCE);
  return { ...snapshot, setWidth, setWidthPercent, setWidthUnit, resetWidth, setFontSize };
}
