"use client";

import { useEffect, useState } from "react";

import { APP_PREF_KEYS, getPrefBool, setPrefBool } from "@/lib/app-prefs";
import {
  applyGpuAcceleration,
  desktopNotifyAlwaysEnabled,
  gpuAccelerationEnabled,
  notifyDesktop,
} from "@/lib/desktop-notify";
import {
  clearAppCacheNative,
  isAutostartEnabledNative,
  openLogDirNative,
  quitAppNative,
  setAutostartNative,
  setCloseQuitsNative,
} from "@/lib/desktop-native";
import { useI18n } from "@/hooks/useI18n";
import { ConfigButton, ConfigSwitch } from "@/components/SettingsUi";

import { useDesktopChrome } from "./useDesktopChrome";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Window, tray and notification behaviour for the packaged desktop app.
 *
 * Renders nothing in a browser build, so the General settings tab can mount it
 * unconditionally instead of branching on `isTauriDesktop()` itself. This is
 * the remainder of the old "Desktop" settings tab after the app info moved to
 * the top of General and its language / appearance blocks were dropped as
 * duplicates of what General already offers.
 */
export function DesktopAppSection() {
  const { t } = useI18n();
  const { isDesktop } = useDesktopChrome();
  const [closeQuits, setCloseQuits] = useState(() => getPrefBool(APP_PREF_KEYS.closeQuits, false));
  const [notifyOnComplete, setNotifyOnComplete] = useState(
    () => getPrefBool(APP_PREF_KEYS.notifyOnComplete, true),
  );
  const [notifyAlways, setNotifyAlways] = useState(() => desktopNotifyAlwaysEnabled());
  const [gpuEnabled, setGpuEnabled] = useState(() => gpuAccelerationEnabled());

  const testNotificationAndSound = () => {
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.18;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
        osc.start(start);
        osc.stop(start + 0.45);
      });
    } catch {
      // ignore audio errors
    }
    void notifyDesktop({
      title: "Pi Atelier · 纸枢",
      body: "系统通知与提示音测试成功！任务完成时将立即弹出此通知。",
      force: true,
    });
  };

  // The OS entry is the source of truth, so this is read back, not persisted.
  // null = not read yet (switch disabled so a click cannot race the read).
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartError, setAutostartError] = useState(false);

  const [cacheState, setCacheState] = useState<
    { status: "idle" | "busy" | "error" } | { status: "done"; freed: number }
  >({ status: "idle" });

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    isAutostartEnabledNative()
      .then((enabled) => { if (!cancelled) setAutostart(enabled); })
      .catch(() => { if (!cancelled) setAutostartError(true); });
    return () => { cancelled = true; };
  }, [isDesktop]);

  if (!isDesktop) return null;

  const toggleAutostart = async (next: boolean) => {
    setAutostartError(false);
    setAutostart(next);
    try {
      await setAutostartNative(next);
    } catch {
      setAutostart(!next);
      setAutostartError(true);
    }
  };

  const clearCache = async () => {
    setCacheState({ status: "busy" });
    try {
      setCacheState({ status: "done", freed: await clearAppCacheNative() });
    } catch {
      setCacheState({ status: "error" });
    }
  };

  return (
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{t("appSettings.desktopSection")}</h3>
      <p className="settings-general-description">{t("appSettings.desktopHint")}</p>
      <div className="settings-option-list">
        <div className="settings-option">
          <span className="settings-option-text">
            <span className="settings-option-title">{t("appSettings.closeQuits")}</span>
            <span className="settings-option-hint">{t("appSettings.closeQuitsHint")}</span>
          </span>
          <ConfigSwitch
            checked={closeQuits}
            label={t("appSettings.closeQuits")}
            onChange={(next) => {
              setCloseQuits(next);
              setPrefBool(APP_PREF_KEYS.closeQuits, next);
              void setCloseQuitsNative(next);
            }}
          />
        </div>
        <div className="settings-option">
          <span className="settings-option-text">
            <span className="settings-option-title">{t("appSettings.autostart")}</span>
            <span className="settings-option-hint" role="status">
              {autostartError ? t("appSettings.autostartError") : t("appSettings.autostartHint")}
            </span>
          </span>
          <ConfigSwitch
            checked={autostart === true}
            disabled={autostart === null}
            label={t("appSettings.autostart")}
            onChange={(next) => void toggleAutostart(next)}
          />
        </div>
        <div className="settings-option">
          <span className="settings-option-text">
            <span className="settings-option-title">硬件加速</span>
            <span className="settings-option-hint">
              启用 WebView2 GPU 硬件光栅化与零拷贝合成加速，关闭则切换为软件渲染（修改后下次启动应用生效）
            </span>
          </span>
          <ConfigSwitch
            checked={gpuEnabled}
            label="硬件加速"
            onChange={(next) => {
              setGpuEnabled(next);
              setPrefBool(APP_PREF_KEYS.gpuAcceleration, next);
              applyGpuAcceleration(next);
            }}
          />
        </div>
        <div className="settings-option">
          <span className="settings-option-text">
            <span className="settings-option-title">{t("appSettings.notifyOnComplete")}</span>
            <span className="settings-option-hint">{t("appSettings.notifyOnCompleteHint")}</span>
          </span>
          <ConfigSwitch
            checked={notifyOnComplete}
            label={t("appSettings.notifyOnComplete")}
            onChange={(next) => {
              setNotifyOnComplete(next);
              setPrefBool(APP_PREF_KEYS.notifyOnComplete, next);
            }}
          />
        </div>
        <div className="settings-option">
          <span className="settings-option-text">
            <span className="settings-option-title">窗口聚焦时也弹出系统通知（免失焦通知）</span>
            <span className="settings-option-hint">
              开启后，无需将窗口切到后台，当前对话或后台任务完成时均立即发送 Windows 系统横幅通知并伴随提示音；关闭则仅在窗口失焦时通知
            </span>
          </span>
          <div className="settings-choice-group">
            <ConfigButton size="small" variant="secondary" onClick={testNotificationAndSound}>
              测试通知与提示音
            </ConfigButton>
            <ConfigSwitch
              checked={notifyAlways}
              disabled={!notifyOnComplete}
              label="窗口聚焦时也弹出系统通知"
              onChange={(next) => {
                setNotifyAlways(next);
                setPrefBool(APP_PREF_KEYS.notifyAlways, next);
              }}
            />
          </div>
        </div>
        <div className="settings-option">
          <span className="settings-option-text">
            <span className="settings-option-title">{t("appSettings.clearCache")}</span>
            <span className="settings-option-hint" role="status">
              {cacheState.status === "done"
                ? t("appSettings.clearCacheDone", { size: formatBytes(cacheState.freed) })
                : cacheState.status === "error"
                  ? t("appSettings.clearCacheError")
                  : t("appSettings.clearCacheHint")}
            </span>
          </span>
          <ConfigButton disabled={cacheState.status === "busy"} onClick={() => void clearCache()}>
            {cacheState.status === "busy" ? t("appSettings.clearCacheBusy") : t("appSettings.clearCache")}
          </ConfigButton>
        </div>
      </div>
      <ConfigButton className="settings-option-action" onClick={() => void openLogDirNative()}>
        {t("appSettings.openLogs")}
      </ConfigButton>
      <ConfigButton className="settings-option-action" onClick={() => void quitAppNative()}>
        {t("appSettings.quitApp")}
      </ConfigButton>
    </section>
  );
}
