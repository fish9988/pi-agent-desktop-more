"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_WORK_COLLAPSE_TIMING,
  DEFAULT_WORK_DETAILS_LEVEL,
  normalizeWorkCollapseTiming,
  normalizeWorkDetailsLevel,
  WORK_DETAILS_POLICY,
  type WorkCollapseTiming,
  type WorkDetailsLevel,
} from "@/lib/work-details";

export const WORK_DETAILS_LEVEL_STORAGE_KEY = "pi-plus-work-details-level";
export const WORK_COLLAPSE_TIMING_STORAGE_KEY = "pi-plus-work-collapse-timing";

interface WorkDetailsState {
  level: WorkDetailsLevel;
  collapseTiming: WorkCollapseTiming;
  /**
   * Bumped by "expand all" / "collapse all"; groups compare it with the value
   * they last saw and follow the requested state once.
   */
  bulk: { generation: number; expanded: boolean };
}

const DEFAULT_STATE: WorkDetailsState = {
  level: DEFAULT_WORK_DETAILS_LEVEL,
  collapseTiming: DEFAULT_WORK_COLLAPSE_TIMING,
  bulk: { generation: 0, expanded: false },
};

let state: WorkDetailsState | null = null;
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort persistence.
  }
}

function getSnapshot(): WorkDetailsState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  if (!state) {
    state = {
      level: normalizeWorkDetailsLevel(read(WORK_DETAILS_LEVEL_STORAGE_KEY)),
      collapseTiming: normalizeWorkCollapseTiming(read(WORK_COLLAPSE_TIMING_STORAGE_KEY)),
      bulk: { generation: 0, expanded: false },
    };
  }
  return state;
}

function update(next: Partial<WorkDetailsState>): void {
  state = { ...getSnapshot(), ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Keep several windows/tabs in step.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== WORK_DETAILS_LEVEL_STORAGE_KEY && event.key !== WORK_COLLAPSE_TIMING_STORAGE_KEY) return;
    state = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setWorkDetailsLevel(level: WorkDetailsLevel): void {
  const next = normalizeWorkDetailsLevel(level);
  write(WORK_DETAILS_LEVEL_STORAGE_KEY, next);
  update({ level: next });
}

export function setWorkCollapseTiming(timing: WorkCollapseTiming): void {
  const next = normalizeWorkCollapseTiming(timing);
  write(WORK_COLLAPSE_TIMING_STORAGE_KEY, next);
  update({ collapseTiming: next });
}

/** Expand or collapse every work group in the chat once. */
export function setAllWorkGroupsExpanded(expanded: boolean): void {
  const current = getSnapshot();
  update({ bulk: { generation: current.bulk.generation + 1, expanded } });
}

export function useWorkDetails() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_STATE);
  return {
    ...snapshot,
    policy: WORK_DETAILS_POLICY[snapshot.level],
    setLevel: setWorkDetailsLevel,
    setCollapseTiming: setWorkCollapseTiming,
    setAllExpanded: setAllWorkGroupsExpanded,
  };
}
