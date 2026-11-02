import { getPiWebSettingsPath, readStored, updatePiWebSettings } from "./artifact-settings";
import type { TerminalBackendKind, WslPreferences } from "./wsl-types";

// The WSL backend is a Pi Web preference, not a pi setting: the pi CLI, the
// scheduled-task runner and the SDK all keep using the native shell, and only
// the workspace terminal (and, when asked, `!cmd`) goes through wsl.exe.

export const WSL_BACKEND_KEY = "terminalBackend";
export const WSL_DISTRO_KEY = "terminalWslDistro";
export const WSL_SHELL_COMMANDS_KEY = "terminalWslShellCommands";

export const DEFAULT_WSL_PREFERENCES: WslPreferences = {
  backend: "native",
  distro: "",
  shellCommands: false,
};

function isBackend(value: unknown): value is TerminalBackendKind {
  return value === "native" || value === "wsl";
}

export function readWslPreferences(settingsPath = getPiWebSettingsPath()): WslPreferences {
  try {
    const stored = readStored(settingsPath);
    return {
      backend: isBackend(stored[WSL_BACKEND_KEY]) ? stored[WSL_BACKEND_KEY] : DEFAULT_WSL_PREFERENCES.backend,
      distro: typeof stored[WSL_DISTRO_KEY] === "string" ? stored[WSL_DISTRO_KEY].trim() : DEFAULT_WSL_PREFERENCES.distro,
      shellCommands: stored[WSL_SHELL_COMMANDS_KEY] === true,
    };
  } catch {
    // An unreadable settings file must not keep terminals from opening.
    return { ...DEFAULT_WSL_PREFERENCES };
  }
}

/** Merge only the keys given, so a switch and a dropdown never clobber each other. */
export function writeWslPreferences(patch: Partial<WslPreferences>, settingsPath = getPiWebSettingsPath()): WslPreferences {
  const next: Record<string, unknown> = {};
  if (patch.backend !== undefined) {
    if (!isBackend(patch.backend)) throw new Error("Invalid terminal backend");
    next[WSL_BACKEND_KEY] = patch.backend;
  }
  if (patch.distro !== undefined) {
    if (typeof patch.distro !== "string") throw new Error("Invalid WSL distribution");
    next[WSL_DISTRO_KEY] = patch.distro.trim();
  }
  if (patch.shellCommands !== undefined) {
    next[WSL_SHELL_COMMANDS_KEY] = patch.shellCommands === true;
  }
  updatePiWebSettings(next, settingsPath);
  return readWslPreferences(settingsPath);
}

/** Whether `!cmd` runs inside WSL: the backend must be on and the switch set. */
export function usesWslShellCommands(preferences: WslPreferences): boolean {
  return preferences.backend === "wsl" && preferences.shellCommands;
}
