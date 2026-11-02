"use client";

import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import { terminalFontSize, useChatAppearance } from "@/hooks/useChatAppearance";
import { useI18n } from "@/hooks/useI18n";
import { useTheme } from "@/hooks/useTheme";
import type { TerminalSettingsResponse } from "@/lib/api-types";
import { scaleVar } from "@/lib/plus-design-scale";
import { createTerminalWriter, terminalRequest } from "@/lib/terminal-client";
import type { TerminalEvent } from "@/lib/terminal-manager";
import type { TerminalBackendInfo, WslSettingsFields } from "@/lib/wsl-types";
import { AppSelect } from "./AppSelect";
import type { TerminalTab } from "./terminal-tab-state";

type TerminalSettingsWithWsl = TerminalSettingsResponse & WslSettingsFields;

function parseCssColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  if (/^rgba?\([^)]+\)$/i.test(trimmed) && trimmed !== "rgba(0, 0, 0, 0)" && trimmed !== "transparent") {
    return trimmed;
  }
  return null;
}

export function resolveTerminalTheme(container: HTMLElement | null, isDark: boolean): ITheme {
  const rootStyle = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const hostStyle = container && typeof getComputedStyle === "function" ? getComputedStyle(container) : null;

  const background =
    parseCssColor(rootStyle?.getPropertyValue("--plus-code-bg")) ??
    parseCssColor(hostStyle?.getPropertyValue("--plus-code-bg")) ??
    parseCssColor(rootStyle?.getPropertyValue("--bg-panel")) ??
    parseCssColor(hostStyle?.backgroundColor) ??
    (isDark ? "#111318" : "#f7f5f0");
  const foreground =
    parseCssColor(rootStyle?.getPropertyValue("--text")) ??
    parseCssColor(hostStyle?.getPropertyValue("--text")) ??
    parseCssColor(hostStyle?.color) ??
    (isDark ? "#d7dce5" : "#1f2328");
  const cursor =
    parseCssColor(rootStyle?.getPropertyValue("--accent")) ??
    (isDark ? "#60a5fa" : "#2563eb");

  return {
    background,
    foreground,
    cursor,
    selectionBackground: isDark ? "#365b8a" : "rgba(37, 99, 235, 0.18)",
    black: "#1d222b",
    red: isDark ? "#f87171" : "#dc2626",
    green: isDark ? "#4ade80" : "#16a34a",
    yellow: isDark ? "#facc15" : "#ca8a04",
    blue: isDark ? "#60a5fa" : "#2563eb",
    magenta: isDark ? "#c084fc" : "#9333ea",
    cyan: isDark ? "#22d3ee" : "#0891b2",
    white: isDark ? "#e5e7eb" : "#4b5563",
    brightBlack: "#6b7280",
    brightRed: isDark ? "#fca5a5" : "#ef4444",
    brightGreen: isDark ? "#86efac" : "#22c55e",
    brightYellow: isDark ? "#fde047" : "#eab308",
    brightBlue: isDark ? "#93c5fd" : "#3b82f6",
    brightMagenta: isDark ? "#d8b4fe" : "#a855f7",
    brightCyan: isDark ? "#67e8f9" : "#06b6d4",
    brightWhite: isDark ? "#ffffff" : "#111827",
  };
}

interface Props {
  tab: TerminalTab;
  active: boolean;
  onRestart: () => void;
  onClosed: () => void;
  onCloseError: () => void;
}

export function TerminalPanel({ tab, active, onRestart, onClosed, onCloseError }: Props) {
  const { t, locale } = useI18n();
  const { isDark } = useTheme();
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;
  const { id, cwd, restored } = tab;
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const startRef = useRef<Promise<void>>(Promise.resolve());
  const writerRef = useRef<ReturnType<typeof createTerminalWriter> | null>(null);
  const callbacksRef = useRef({ onClosed, onCloseError });
  callbacksRef.current = { onClosed, onCloseError };
  const [status, setStatus] = useState<"connecting" | "ready" | "exited" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  // Which shell this tab actually got. The server resolves it before the PTY
  // exists, so a WSL request that had to fall back also arrives with a warning.
  const [backend, setBackend] = useState<TerminalBackendInfo | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [shellSettings, setShellSettings] = useState<TerminalSettingsWithWsl | null>(null);
  const [switchingShell, setSwitchingShell] = useState(false);
  // Plus: ported pi-web 35af7102 (#1329) — the terminal follows the chat font
  // size (13px at the 14px default). A slider move updates the live xterm and
  // refits, whose onResize sends the new cols/rows to the shell.
  const fontSize = terminalFontSize(useChatAppearance().fontSize);
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;
  const refitRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (typeof fetch !== "function") return;
    let cancelled = false;
    const load = () => {
      fetch("/api/terminal/settings", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json() as TerminalSettingsWithWsl;
          if (!cancelled && Array.isArray(data.options)) setShellSettings(data);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("pi-plus:terminal-settings-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("pi-plus:terminal-settings-changed", load);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let events: EventSource | null = null;
    let offset: number | undefined;
    let connected = false;
    let exited = false;
    let inputFailed = false;
    setStatus("connecting");
    setError(null);
    setBackend(null);
    setExitCode(null);

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: getComputedStyle(container).getPropertyValue("--font-mono").trim() || "monospace",
      fontSize: fontSizeRef.current,
      lineHeight: 1.25,
      scrollback: 8000,
      screenReaderMode: true,
      disableStdin: true,
      theme: resolveTerminalTheme(container, isDarkRef.current),
    });
    terminalRef.current = terminal;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "v") return false;
      if ((event.ctrlKey || event.metaKey) && key === "c" && terminal.hasSelection()) return false;
      return true;
    });

    const writer = createTerminalWriter(id, (reason) => {
      if (disposed) return;
      inputFailed = true;
      terminal.options.disableStdin = true;
      setError(reason.message);
      setStatus("error");
    });
    writerRef.current = writer;
    const onData = terminal.onData((data) => {
      if (connected && !exited && !inputFailed) writer.write(data);
    });
    const fitAndResize = () => {
      if (!container.offsetWidth || !container.offsetHeight) return;
      fit.fit();
    };
    const onResize = terminal.onResize(({ cols, rows }) => {
      if (connected && !exited && !inputFailed) writer.resize(cols, rows);
    });
    const resizeObserver = new ResizeObserver(fitAndResize);
    resizeObserver.observe(container);
    refitRef.current = () => fitAndResize();

    const connect = () => {
      if (disposed || exited || !navigator.onLine) return;
      events?.close();
      events = new EventSource(`/api/terminal/${encodeURIComponent(id)}/events${offset === undefined ? "" : `?after=${offset}`}`);
      events.onmessage = (message) => {
        const event = JSON.parse(message.data) as TerminalEvent;
        if (event.type === "output") {
          if (event.reset) terminal.reset();
          else if (offset !== undefined && event.offset <= offset) return;
          terminal.write(event.data);
          offset = event.offset;
        } else {
          exited = true;
          connected = false;
          terminal.options.disableStdin = true;
          events?.close();
          setExitCode(event.type === "exit" ? event.exitCode : null);
          setStatus("exited");
        }
      };
      events.onopen = () => {
        connected = true;
        if (inputFailed) return;
        terminal.options.disableStdin = false;
        setStatus("ready");
        fitAndResize();
        writer.resize(terminal.cols, terminal.rows);
        if (container.offsetWidth && container.offsetHeight) terminal.focus();
      };
      events.onerror = () => {
        if (disposed || exited) return;
        connected = false;
        terminal.options.disableStdin = true;
        setStatus(events?.readyState === EventSource.CLOSED ? "error" : "connecting");
      };
    };

    startRef.current = (async () => {
      fitAndResize();
      const info = restored || reconnectKey > 0
        // Restoring a tab must never silently launch a replacement shell.
        ? await terminalRequest(`/api/terminal/${encodeURIComponent(id)}`)
        : await terminalRequest("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, cwd, cols: terminal.cols, rows: terminal.rows }),
        });
      if (!disposed) setBackend(info.backend ?? null);
      connect();
    })().catch((reason: Error) => {
      if (disposed) return;
      setError(reason.message);
      setStatus("error");
    });

    const pageHide = () => {
      connected = false;
      terminal.options.disableStdin = true;
      events?.close();
      if (!exited && !inputFailed) setStatus("connecting");
    };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) connect(); };
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("offline", pageHide);
    window.addEventListener("online", connect);
    return () => {
      disposed = true;
      events?.close();
      void writer.stop();
      resizeObserver.disconnect();
      onData.dispose();
      onResize.dispose();
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("offline", pageHide);
      window.removeEventListener("online", connect);
      terminal.dispose();
      terminalRef.current = null;
      refitRef.current = () => {};
    };
  }, [id, cwd, restored, reconnectKey]);

  useEffect(() => {
    if (active) terminalRef.current?.focus();
  }, [active]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const applyTheme = () => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = resolveTerminalTheme(containerRef.current, isDark);
      }
    };
    applyTheme();
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-plus-theme", "data-plus-style", "style"],
    });
    return () => observer.disconnect();
  }, [isDark]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || terminal.options.fontSize === fontSize) return;
    // A refit sends the new cols/rows to the shell through onResize, as a font change does.
    terminal.options.fontSize = fontSize;
    refitRef.current();
  }, [fontSize]);

  useEffect(() => {
    if (!tab.closing) return;
    let cancelled = false;
    if (terminalRef.current) terminalRef.current.options.disableStdin = true;
    void (async () => {
      await startRef.current;
      await writerRef.current?.stop();
      await terminalRequest(`/api/terminal/${encodeURIComponent(id)}`, { method: "DELETE", keepalive: true });
      if (!cancelled) callbacksRef.current.onClosed();
    })().catch((reason: Error) => {
      if (cancelled) return;
      setError(reason.message);
      setStatus("error");
      callbacksRef.current.onCloseError();
    });
    return () => { cancelled = true; };
  }, [id, tab.closing]);

  const defaultShellSuffix = shellSettings?.defaultShell ? ` (${shellSettings.defaultShell})` : "";
  const autoOptionLabel = locale === "zh-CN"
    ? `跟随默认${defaultShellSuffix}`
    : locale === "zh-TW"
      ? `跟隨預設${defaultShellSuffix}`
      : `Default${defaultShellSuffix}`;
  const wslOptionLabel = shellSettings?.wslDistro ? `WSL (${shellSettings.wslDistro})` : "WSL";
  const shellSelectOptions = [
    { value: "auto", label: autoOptionLabel },
    ...(shellSettings?.options ?? []),
    { value: "wsl", label: wslOptionLabel },
  ];
  const currentShellChoice = shellSettings?.backend === "wsl"
    ? "wsl"
    : (shellSettings?.shell && shellSelectOptions.some((opt) => opt.value === shellSettings.shell)
        ? shellSettings.shell
        : "auto");
  const shellSwitcherLabel = locale === "zh-CN"
    ? "切换终端 Shell / WSL"
    : locale === "zh-TW"
      ? "切換終端機 Shell / WSL"
      : "Switch terminal shell / WSL";

  const handleShellQuickSwitch = async (nextValue: string) => {
    if (switchingShell || tab.closing || nextValue === currentShellChoice) return;
    setSwitchingShell(true);
    try {
      const putSetting = async (patch: Record<string, unknown>) => {
        const res = await fetch("/api/terminal/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("Failed to update terminal settings");
        return await res.json() as TerminalSettingsWithWsl;
      };
      let updated: TerminalSettingsWithWsl;
      if (nextValue === "wsl") {
        updated = await putSetting({ backend: "wsl" });
      } else {
        if (shellSettings?.backend === "wsl") {
          await putSetting({ backend: "native" });
        }
        updated = await putSetting({ shell: nextValue });
      }
      setShellSettings(updated);
      window.dispatchEvent(new CustomEvent("pi-plus:terminal-settings-changed"));
      onRestart();
    } catch {
      // ignore failed quick-switch
    } finally {
      setSwitchingShell(false);
    }
  };

  return (
    <section
      className="terminal-panel"
      aria-label={t("terminal.title")}
      style={{ background: "var(--plus-code-bg, var(--bg-panel))", color: "var(--text)" }}
    >
      <header className="terminal-panel-header">
        <div className="terminal-panel-path">
          <span className={`terminal-status-dot is-${status}`} title={t(`terminal.${status}`)} />
          {backend?.kind === "wsl" && (
            <span title={`${backend.distro ?? "WSL"} · ${cwd}`}>{`WSL · ${backend.distro ?? ""}`.trimEnd()}</span>
          )}
          <span title={cwd}>{backend?.kind === "wsl" ? backend.linuxCwd ?? cwd : cwd}</span>
        </div>
        <AppSelect
          value={currentShellChoice}
          options={shellSelectOptions}
          onValueChange={(next) => void handleShellQuickSwitch(next)}
          disabled={switchingShell || Boolean(tab.closing)}
          aria-label={shellSwitcherLabel}
          title={shellSwitcherLabel}
          className="terminal-shell-switcher"
          style={{
            height: 24,
            minHeight: 24,
            padding: "0 8px",
            fontSize: scaleVar("fs", 1),
            maxWidth: 190,
          }}
        />
        {status === "error" && (
          <button type="button" onClick={() => setReconnectKey((key) => key + 1)} disabled={Boolean(tab.closing)} title={t("terminal.reconnect")} aria-label={t("terminal.reconnect")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" />
            </svg>
          </button>
        )}
        <button type="button" onClick={onRestart} disabled={Boolean(tab.closing)} title={t("terminal.restart")} aria-label={t("terminal.restart")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.34 5.66" /><polyline points="20 4 20 11 13 11" />
          </svg>
        </button>
      </header>
      <div>
        {error && <div className="terminal-panel-error" role="alert">{error}</div>}
        {!error && backend?.warning && <div className="terminal-panel-exit" role="status">{backend.warning}</div>}
        {status === "exited" && <div className="terminal-panel-exit" role="status">{exitCode === null ? t("terminal.exited") : t("terminal.exitCode", { code: exitCode })}</div>}
      </div>
      <div className="terminal-xterm" style={{ background: "var(--plus-code-bg, var(--bg-panel))" }}>
        <div ref={containerRef} className="terminal-xterm-host" />
      </div>
    </section>
  );
}
