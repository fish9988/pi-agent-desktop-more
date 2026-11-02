"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { TerminalSettingsResponse } from "@/lib/api-types";
import type { WslDistroList, WslSettingsFields } from "@/lib/wsl-types";
import { AppSelect } from "./AppSelect";
import { ConfigButton, ConfigSwitch } from "./SettingsUi";

type TerminalSettingsWithWsl = TerminalSettingsResponse & WslSettingsFields;

export function TerminalSettingsSection() {
  const { locale, t } = useI18n();
  const tr = (zhCN: string, zhTW: string, en: string) =>
    locale === "zh-CN" ? zhCN : locale === "zh-TW" ? zhTW : en;
  const [settings, setSettings] = useState<TerminalSettingsWithWsl | null>(null);
  const [distros, setDistros] = useState<WslDistroList | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"load" | "save" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const loadSettings = fetch("/api/terminal/settings", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Load failed");
        const data = await response.json() as TerminalSettingsWithWsl;
        if (!Array.isArray(data.options)) throw new Error("Invalid settings");
        if (!controller.signal.aborted) setSettings(data);
      });
    // Listing distros starts wsl.exe, so it fails (and is re-reported) on its
    // own; a broken WSL must not hide the native shell settings.
    const loadDistros = fetch("/api/wsl/distros", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Load failed");
        const data = await response.json() as WslDistroList;
        if (!controller.signal.aborted && Array.isArray(data.distros)) setDistros(data);
      })
      .catch(() => { /* the WSL switch still says why it cannot start a shell */ });
    void Promise.all([loadSettings, loadDistros])
      .catch(() => { if (!controller.signal.aborted) setError("load"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const save = async (patch: Record<string, unknown>) => {
    if (loading || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/terminal/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Save failed");
      setSettings(await response.json() as TerminalSettingsWithWsl);
      window.dispatchEvent(new CustomEvent("pi-plus:terminal-settings-changed"));
    } catch {
      setError("save");
    } finally {
      setSaving(false);
    }
  };

  const selectShell = (shell: string) => void save({ shell });

  const options = [
    {
      value: "auto",
      label: settings?.defaultShell
        ? tr(
            `自动（${settings.defaultShell}）`,
            `自動（${settings.defaultShell}）`,
            `Automatic (${settings.defaultShell})`,
          )
        : tr("自动", "自動", "Automatic"),
    },
    ...(settings?.options ?? []),
    ...(settings?.unavailable
      ? [{
          value: settings.shell,
          label: tr("当前所选终端不可用", "目前所選終端機不可用", "Unavailable terminal"),
          disabled: true,
        }]
      : []),
  ];

  const sectionTitle = tr("内置终端", "內建終端機", "Workspace terminal");
  const sectionHint = tr(
    "选择「在终端中打开」默认启动的 Shell（Windows 自动优先选择 PowerShell 7）",
    "選擇「在終端機中開啟」預設啟動的 Shell（Windows 自動優先選擇 PowerShell 7）",
    "Choose the default shell opened by workspace terminal tabs.",
  );
  const labelText = tr("默认终端 Shell", "預設終端機 Shell", "Default terminal shell");

  const wslEnabled = settings?.backend === "wsl";
  const distroOptions = [
    {
      value: "",
      label: distros?.defaultDistro
        ? tr(
            `跟随 WSL 默认（${distros.defaultDistro}）`,
            `跟隨 WSL 預設（${distros.defaultDistro}）`,
            `WSL default (${distros.defaultDistro})`,
          )
        : tr("跟随 WSL 默认", "跟隨 WSL 預設", "WSL default"),
    },
    ...(distros?.distros ?? []).map(distro => ({ value: distro.name, label: distro.name })),
    // A saved distro that is no longer installed stays visible instead of
    // silently becoming "default".
    ...(settings?.wslDistro && !distros?.distros.some(distro => distro.name === settings.wslDistro)
      ? [{
          value: settings.wslDistro,
          label: `${settings.wslDistro}${tr("（未安装）", "（未安裝）", " (not installed)")}`,
        }]
      : []),
  ];
  const wslProblem = distros && !distros.available
    ? (distros.error ?? tr("未检测到可用的 WSL 发行版", "未偵測到可用的 WSL 發行版", "No WSL distribution is available"))
    : null;

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

        <div className="settings-option settings-terminal-option">
          <span className="settings-option-text">
            <span className="settings-option-title" id="settings-terminal-wsl-label">
              {tr("使用 WSL 后端", "使用 WSL 後端", "Use the WSL backend")}
            </span>
            <span className="settings-option-hint" id="settings-terminal-wsl-hint">
              {tr(
                "新打开的终端在 WSL 里运行，工作目录自动换算成 /mnt/c/… 或 \\\\wsl.localhost\\…；上面的 Shell 设置保持不变",
                "新開啟的終端機在 WSL 內執行，工作目錄自動換算為 /mnt/c/… 或 \\\\wsl.localhost\\…；上方的 Shell 設定保持不變",
                "New terminal tabs run inside WSL; the workspace path is translated to /mnt/c/… or \\\\wsl.localhost\\… . The shell choice above stays as it is.",
              )}
            </span>
          </span>
          <ConfigSwitch
            checked={wslEnabled}
            loading={loading || saving}
            disabled={Boolean(distros && !distros.available && !wslEnabled)}
            label={tr("使用 WSL 后端", "使用 WSL 後端", "Use the WSL backend")}
            describedBy="settings-terminal-wsl-hint"
            onChange={(enabled) => void save({ backend: enabled ? "wsl" : "native" })}
          />
        </div>

        {wslEnabled && (
          <div className="settings-option settings-terminal-option">
            <span className="settings-option-text">
              <span className="settings-option-title" id="settings-terminal-distro-label">
                {tr("WSL 发行版", "WSL 發行版", "WSL distribution")}
              </span>
            </span>
            <AppSelect
              value={settings?.wslDistro ?? ""}
              options={distroOptions}
              onValueChange={wslDistro => void save({ wslDistro })}
              disabled={loading || saving}
              aria-label={tr("WSL 发行版", "WSL 發行版", "WSL distribution")}
              aria-describedby="settings-terminal-wsl-hint"
              aria-busy={loading || saving}
            />
          </div>
        )}

        {wslEnabled && (
          <div className="settings-option settings-terminal-option">
            <span className="settings-option-text">
              <span className="settings-option-title" id="settings-terminal-wsl-cmd-label">
                {tr("在 WSL 中运行终端命令", "在 WSL 中執行終端機命令", "Run shell commands in WSL")}
              </span>
              <span className="settings-option-hint" id="settings-terminal-wsl-cmd-hint">
                {tr(
                  "输入框里的 ! 命令与 Agent 的 bash 工具均跟随在 WSL 中执行",
                  "輸入框內的 ! 命令與 Agent 的 bash 工具均跟隨在 WSL 中執行",
                  "! commands typed in the composer and the agent's bash tool also run through WSL.",
                )}
              </span>
            </span>
            <ConfigSwitch
              checked={settings?.wslShellCommands === true}
              loading={loading || saving}
              label={tr("在 WSL 中运行终端命令", "在 WSL 中執行終端機命令", "Run shell commands in WSL")}
              describedBy="settings-terminal-wsl-cmd-hint"
              onChange={(enabled) => void save({ wslShellCommands: enabled })}
            />
          </div>
        )}
      </div>
      {wslProblem && (
        <p className="settings-option-hint" role="status">
          {tr(`WSL 不可用：${wslProblem}`, `WSL 不可用：${wslProblem}`, `WSL is unavailable: ${wslProblem}`)}
        </p>
      )}
      {error && (
        <p role="alert" className="settings-general-error">
          {error === "load"
            ? tr("读取终端设置失败", "讀取終端機設定失敗", "Could not load terminal settings")
            : tr("保存终端设置失败", "儲存終端機設定失敗", "Could not save terminal settings")}
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
