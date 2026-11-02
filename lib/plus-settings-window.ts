// Whether the Settings window is folded down to its title bar.
//
// The flag used to live inside the window bar itself, which made folding look
// like a crash: the sidebar button, Ctrl+, and the native menu all re-set the
// same open section, React bailed out, and the 42px strip stayed folded in a
// corner. Keeping it in a tiny external store lets AppShell and the bar agree,
// and gives every entry point one thing to call when Settings is reopened.

type Listener = () => void;

interface SettingsWindowState {
  minimized: boolean;
  listeners: Set<Listener>;
}

declare global {
  var __piPlusSettingsWindow: SettingsWindowState | undefined;
}

function state(): SettingsWindowState {
  if (!globalThis.__piPlusSettingsWindow) {
    globalThis.__piPlusSettingsWindow = { minimized: false, listeners: new Set() };
  }
  return globalThis.__piPlusSettingsWindow;
}

function emit(next: SettingsWindowState): void {
  for (const listener of [...next.listeners]) listener();
}

export function isSettingsWindowMinimized(): boolean {
  return state().minimized;
}

export function setSettingsWindowMinimized(minimized: boolean): void {
  const current = state();
  if (current.minimized === minimized) return;
  current.minimized = minimized;
  emit(current);
}

/** Any route that opens Settings restores a folded window first. */
export function expandSettingsWindow(): void {
  setSettingsWindowMinimized(false);
}

export function subscribeSettingsWindow(listener: Listener): () => void {
  const current = state();
  current.listeners.add(listener);
  return () => {
    current.listeners.delete(listener);
  };
}

/** Snapshot for `useSyncExternalStore`. */
export function settingsWindowMinimizedSnapshot(): boolean {
  return state().minimized;
}

/** Server render: nothing is folded before the client mounts. */
export function settingsWindowMinimizedServerSnapshot(): boolean {
  return false;
}

/** Test seam: drop the module state. */
export function resetSettingsWindowForTests(): void {
  globalThis.__piPlusSettingsWindow = undefined;
}
