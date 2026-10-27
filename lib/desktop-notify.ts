import { isTauriDesktop } from "@/lib/desktop-updater";
import { APP_PREF_KEYS, getPrefBool } from "@/lib/app-prefs";

export function desktopNotificationsEnabled(): boolean {
  return getPrefBool(APP_PREF_KEYS.notifyOnComplete, true);
}

/** Whether system notifications should also fire while the app window is focused (default: true). */
export function desktopNotifyAlwaysEnabled(): boolean {
  return getPrefBool(APP_PREF_KEYS.notifyAlways, true);
}

/** Whether GPU compositor layer promotion and directory hover-prefetch are enabled (default: true). */
export function gpuAccelerationEnabled(): boolean {
  return getPrefBool(APP_PREF_KEYS.gpuAcceleration, true);
}

export function applyGpuAcceleration(enabled = gpuAccelerationEnabled()): void {
  if (typeof document === "undefined") return;
  if (enabled) {
    document.documentElement.dataset.plusGpu = "1";
  } else {
    delete document.documentElement.dataset.plusGpu;
  }
}

async function ensurePermission(): Promise<boolean> {
  const {
    isPermissionGranted,
    requestPermission,
  } = await import("@tauri-apps/plugin-notification");
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  return granted;
}

/** Show a native OS notification (skips when focused only if notifyAlways is off). */
export async function notifyDesktop(options: {
  title: string;
  body: string;
  force?: boolean;
}): Promise<void> {
  if (!options.force && !desktopNotificationsEnabled()) return;

  if (!isTauriDesktop()) {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission === "granted") {
          new Notification(options.title, { body: options.body });
        }
      } catch {
        // ignore browser notification errors
      }
    }
    return;
  }

  if (!options.force && !desktopNotifyAlwaysEnabled()) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const focused = await getCurrentWindow().isFocused();
      if (focused) return;
    } catch {
      // If focus cannot be determined, still notify.
    }
  }

  try {
    if (!(await ensurePermission())) return;
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title: options.title, body: options.body });
  } catch (error) {
    console.error("Desktop notification failed:", error);
  }
}

export async function focusDesktopWindow(): Promise<void> {
  if (!isTauriDesktop()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const window = getCurrentWindow();
    await window.show();
    await window.unminimize();
    await window.setFocus();
  } catch {
    // ignore
  }
}
