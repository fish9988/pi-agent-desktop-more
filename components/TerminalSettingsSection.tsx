"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { TerminalSettingsResponse } from "@/lib/api-types";
import { AppSelect } from "./AppSelect";
import { ConfigButton } from "./SettingsUi";

export function TerminalSettingsSection() {
  const { locale, t } = useI18n();
  const isZh = locale.startsWith("zh");
  const [settings, setSettings] = useState<TerminalSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"load" | "save" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetch("/api/terminal/settings", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Load failed");
        const data = await response.json() as TerminalSettingsResponse;
        if (!Array.isArray(data.options)) throw new Error("Invalid settings");
        if (!controller.signal.aborted) setSettings(data);
      })
      .catch(() => { if (!controller.signal.aborted) setError("load"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const selectShell = async (shell: string) => {
    if (loading || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/terminal/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shell }),
      });
      if (!response.ok) throw new Error("Save failed");
      setSettings(await response.json() as TerminalSettingsResponse);
    } catch {
      setError("save");
    } finally {
      setSaving(false);
    }
  };

  const options = [
    {
      value: "auto",
      label: settings?.defaultShell
        ? (isZh ? `自动（${settings.defaultShell}）` : `Automatic (${settings.defaultShell})`)
        : (isZh ? "自动" : "Automatic"),
    },
    ...(settings?.options ?? []),
    ...(settings?.unavailable
      ? [{ value: settings.shell, label: isZh ? "当前所选终端不可用" : "Unavailable terminal", disabled: true }]
      : []),
  ];

  const sectionTitle = isZh ? "内置终端" : "Workspace terminal";
  const sectionHint = isZh
    ? "选择「在终端中打开」默认启动的 Shell（Windows 自动优先选择 PowerShell 7）"
    : "Choose the default shell opened by workspace terminal tabs.";
  const labelText = isZh ? "默认终端 Shell" : "Default terminal shell";

  return (
    <section className="settings-general-section settings-terminal-section">
      <h3 className="settings-general-heading">{sectionTitle}</h3>
      <p className="settings-general-description" id="settings-terminal-hint">{sectionHint}</p>
      <div className="settings-option-list">
        <div className="settings-option settings-terminal-option">
          <span className="settings-option-text">
            <span className="settings-option-title" id="settings-terminal-label">{labelText}</span>
          </span>
          <AppSelect
            value={settings?.shell ?? "auto"}
            options={options}
            onValueChange={shell => void selectShell(shell)}
            disabled={loading || saving}
            aria-label={labelText}
            aria-describedby="settings-terminal-hint"
            aria-busy={loading || saving}
            title={settings?.shell === "auto" ? undefined : settings?.shell}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="settings-general-error">
          {error === "load"
            ? (isZh ? "读取终端设置失败" : "Could not load terminal settings")
            : (isZh ? "保存终端设置失败" : "Could not save terminal settings")}
          {error === "load" && (
            <ConfigButton variant="secondary" size="small" onClick={() => setAttempt(value => value + 1)}>
              {t("common.retry")}
            </ConfigButton>
          )}
        </p>
      )}
    </section>
  );
}
