"use client";

import { AppSelect } from "./AppSelect";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useDiffViewMode } from "@/hooks/useDiffViewMode";
import { PRODUCT_NAME } from "@/lib/branding";
import { useWorkDetails } from "@/hooks/useWorkDetails";
import { WORK_DETAILS_LEVELS } from "@/lib/work-details";
import { useEnterSendMode, setEnterSendMode } from "@/hooks/useEnterSendMode";
import { sendAgentCommand } from "@/lib/agent-client";
import type { ProjectTrustStatus, ToolSettingsResponse } from "@/lib/api-types";
import {
  setLastSettingsSection,
  settingsSectionRequiresProject,
  type SettingsSection,
} from "@/lib/settings-navigation";
import { focusModalPanel, listenForPanelEscape } from "@/lib/stacked-dialog";
import { usePlusStyle } from "@/hooks/usePlusStyle";
import { SETTINGS_NAV_GROUPS, matchSettingsSections } from "@/lib/plus-settings-search";
import { applyUiPlatform } from "@/lib/ui-platform";
import {
  isThinkingExpandedByDefault,
  setThinkingExpandedByDefault,
} from "@/lib/thinking-expansion-preference";
import { ModelsConfig } from "./ModelsConfig";
import { SkillsConfig } from "./SkillsConfig";
import { AgentsConfig } from "./AgentsConfig";
import { PluginsConfig } from "./PluginsConfig";
import { AppUpdatesSection } from "./AppUpdatesSection";
import { DesktopAppSection } from "./desktop";
import { McpConfig } from "./McpConfig";
import { ConfigButton, ConfigSwitch } from "./SettingsUi";
import { AppearanceSettingsPage } from "./AppearanceSettingsPage";
import { ArtifactsSettingRow } from "./ArtifactsSettingRow";
import { PasteAttachmentSettingRow } from "./PasteAttachmentSettingRow";
import { ChatsSettingsSection } from "./ChatsSettingsSection";
import { PromptOptimizerSettingsSection } from "./PromptOptimizerSettingsSection";
import { TerminalSettingsSection } from "./TerminalSettingsSection";
import { PlusSettingsWindowBar } from "./PlusSettingsWindowBar";

interface Props {
  cwd: string | null;
  sessionId: string | null;
  initialSection: SettingsSection;
  onClose: () => void;
  onSessionReloaded: () => void;
  quoteSelectionEnabled: boolean;
  onQuoteSelectionChange: (enabled: boolean) => void;
  /** The completion chime; it used to be a speaker button in the composer row. */
  soundEnabled: boolean;
  onSoundToggle: () => void;
  /** The page's trust status for `cwd`; Settings › MCP reloads when it changes, as after trusting. */
  projectTrust?: ProjectTrustStatus | null;
  /** Opens the page's trust dialog for `cwd`, above Settings; Settings › MCP's trust notice offers it. */
  onOpenTrustDialog?: () => void;
  /** Settings › MCP added a project server, which changed `cwd`'s trust (and may have trusted a fresh folder). */
  onProjectTrustChanged?: (cwd: string, status: ProjectTrustStatus) => void;
}

export function SettingsSectionIcon({ section, size = 16, strokeWidth = 1.8 }: { section: SettingsSection; size?: number; strokeWidth?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "settings-section-icon",
  };

  if (section === "general") return <svg {...common}><path d="M20 7h-9M14 17H5" /><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></svg>;
  if (section === "appearance") return <svg {...common}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" /><circle cx="7.5" cy="11.5" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15.5" cy="8.5" r="1" /></svg>;
  if (section === "models") return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" /></svg>;
  if (section === "skills") return <svg {...common}><path d="m12 2-10 5 10 5 10-5-10-5Z" /><path d="m2 12 10 5 10-5M2 17l10 5 10-5" /></svg>;
  if (section === "agents") return <svg {...common} className="settings-section-icon is-agent"><rect x="5" y="7" width="14" height="11" rx="2" /><path d="M9 11h.01M15 11h.01M9 15h6M12 7V4M10 4h4" /></svg>;
  if (section === "mcp") return <svg {...common}><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6" /></svg>;
  if (section === "plugins") return <svg {...common}><path d="M9 7V2M15 7V2M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5a6 6 0 0 1-12 0ZM12 19v3" /></svg>;
  return <svg {...common}><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
}

function GeneralSettings({
  sessionId,
  onSessionReloaded,
  quoteSelectionEnabled,
  onQuoteSelectionChange,
  soundEnabled,
  onSoundToggle,
  onBusyChange,
}: Pick<Props, "sessionId" | "onSessionReloaded" | "quoteSelectionEnabled" | "onQuoteSelectionChange" | "soundEnabled" | "onSoundToggle"> & {
  onBusyChange: (busy: boolean) => void;
}) {
  const { locale, setLocale, supportedLocales, t } = useI18n();
  const { mode: diffViewMode, setMode: setDiffViewMode } = useDiffViewMode();
  const workDetails = useWorkDetails();
  const enterSendMode = useEnterSendMode();
  const [shellSettings, setShellSettings] = useState<ToolSettingsResponse | null>(null);
  const [shellSaving, setShellSaving] = useState(false);
  const [shellError, setShellError] = useState<string | null>(null);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [webAuthEnabled, setWebAuthEnabled] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    setThinkingExpanded(isThinkingExpandedByDefault());
    void fetch("/api/web-auth")
      .then((response) => response.ok ? response.json() : null)
      .then((data: { enabled?: boolean } | null) => setWebAuthEnabled(data?.enabled === true))
      .catch(() => {});
  }, []);

  const logOut = async () => {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/web-auth", { method: "DELETE" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.location.replace("/login");
    } catch {
      setLogoutError(t("auth.logoutFailed"));
    } finally {
      setLoggingOut(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/tools/settings")
      .then(async (response) => {
        const data = await response.json() as ToolSettingsResponse & { error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
        if (!cancelled) setShellSettings(data);
      })
      .catch((cause) => {
        if (!cancelled) setShellError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, []);

  const togglePowerShell = async (enabled: boolean) => {
    setShellSaving(true);
    setShellError(null);
    try {
      const response = await fetch("/api/tools/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json() as ToolSettingsResponse & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setShellSettings(data);
      if (sessionId) {
        await sendAgentCommand(sessionId, { type: "reload" });
        onSessionReloaded();
      }
    } catch (cause) {
      setShellError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setShellSaving(false);
    }
  };

  return (
    <div className="settings-general">
      <h2 className="settings-general-title">{t("settings.general")}</h2>

      <div className="settings-general-columns">
        <div className="settings-general-col">
          <section className="settings-general-section settings-general-intro settings-general-overview">
            <p className="settings-general-tagline">{t("appSettings.tagline", { product: PRODUCT_NAME })}</p>
            <p className="settings-general-tagline">{t("appSettings.taglineDetails")}</p>
          </section>
          <AppUpdatesSection onBusyChange={onBusyChange} />

          <section className="settings-general-section">
            <h3 className="settings-general-heading">{t("settings.chat")}</h3>
            <div className="settings-chat-options">
              <div className="settings-chat-option settings-chat-switch-option">
                <span>{t("settings.thinkingExpandedDefault")}</span>
                <ConfigSwitch
                  checked={thinkingExpanded}
                  label={t("settings.thinkingExpandedDefault")}
                  onChange={(enabled) => {
                    setThinkingExpandedByDefault(enabled);
                    setThinkingExpanded(enabled);
                  }}
                />
              </div>
              <div className="settings-chat-option settings-chat-choice-option settings-work-details-option">
                <span className="settings-work-details-label">
                  <span>{t("work.title")}</span>
                  <span className="settings-option-hint">{t(`work.levelHint.${workDetails.level}`)}</span>
                </span>
                <div className="settings-choice-group" role="radiogroup" aria-label={t("work.title")}>
                  {WORK_DETAILS_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={workDetails.level === level}
                      className={`config-button config-button-small ${workDetails.level === level ? "config-button-primary" : "config-button-secondary"}`}
                      onClick={() => workDetails.setLevel(level)}
                    >
                      {t(`work.level.${level}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-chat-option settings-chat-choice-option">
                <span>{t("work.collapseTiming")}</span>
                <div className="settings-choice-group" role="radiogroup" aria-label={t("work.collapseTiming")}>
                  {(["completion", "next-input"] as const).map((timing) => (
                    <button
                      key={timing}
                      type="button"
                      role="radio"
                      aria-checked={workDetails.collapseTiming === timing}
                      className={`config-button config-button-small ${workDetails.collapseTiming === timing ? "config-button-primary" : "config-button-secondary"}`}
                      onClick={() => workDetails.setCollapseTiming(timing)}
                    >
                      {t(timing === "completion" ? "work.collapse.completion" : "work.collapse.nextInput")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-chat-option settings-chat-switch-option">
                <span>{t("settings.quoteSelection")}</span>
                <ConfigSwitch
                  checked={quoteSelectionEnabled}
                  label={t("settings.quoteSelection")}
                  onChange={onQuoteSelectionChange}
                />
              </div>
              <div className="settings-chat-option settings-chat-switch-option">
                <span>{t("settings.completionSound")}</span>
                <ConfigSwitch
                  checked={soundEnabled}
                  label={t("settings.completionSound")}
                  onChange={(enabled) => { if (enabled !== soundEnabled) onSoundToggle(); }}
                />
              </div>
              <ArtifactsSettingRow />
              <PasteAttachmentSettingRow />
              <div className="settings-chat-option settings-chat-switch-option" role="radiogroup" aria-label={t("settings.enterSendMode")}>
                <span>{t("settings.enterSendMode")}</span>
                <div className="settings-send-mode-options">
                  <label className="settings-send-mode-option">
                    <input
                      type="radio"
                      name="enter-send-mode"
                      value="enter"
                      checked={enterSendMode === "enter"}
                      onChange={() => setEnterSendMode("enter")}
                      className="sr-only"
                    />
                    <span className="settings-send-mode-label">{t("settings.enterSendModeEnter")}</span>
                  </label>
                  <label className="settings-send-mode-option">
                    <input
                      type="radio"
                      name="enter-send-mode"
                      value="ctrlEnter"
                      checked={enterSendMode === "ctrlEnter"}
                      onChange={() => setEnterSendMode("ctrlEnter")}
                      className="sr-only"
                    />
                    <span className="settings-send-mode-label">{t("settings.enterSendModeCtrlEnter")}</span>
                  </label>
                </div>
              </div>
              <div className="settings-chat-option settings-chat-choice-option">
                <span title={t("appSettings.diffViewModeHint")}>{t("appSettings.diffViewMode")}</span>
                <div className="settings-choice-group" role="radiogroup" aria-label={t("appSettings.diffViewMode")}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={diffViewMode === "split"}
                    className={`config-button config-button-small ${diffViewMode === "split" ? "config-button-primary" : "config-button-secondary"}`}
                    onClick={() => setDiffViewMode("split")}
                  >
                    {t("appSettings.diffViewModeSplit")}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={diffViewMode === "unified"}
                    className={`config-button config-button-small ${diffViewMode === "unified" ? "config-button-primary" : "config-button-secondary"}`}
                    onClick={() => setDiffViewMode("unified")}
                  >
                    {t("appSettings.diffViewModeUnified")}
                  </button>
                </div>
              </div>
            </div>
          </section>
          <ChatsSettingsSection />
            <PromptOptimizerSettingsSection />
        </div>

        <div className="settings-general-col">
          <section className="settings-general-section">
            <h3 className="settings-general-heading">{t("common.language")}</h3>
            <div role="radiogroup" aria-label={t("common.language")} className="settings-language-options">
              {supportedLocales.map((plugin) => {
                const selected = locale === plugin.id;
                return (
                  <button
                    key={plugin.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setLocale(plugin.id as typeof locale)}
                    className="settings-language-option"
                  >
                    <span className="settings-language-radio">
                      {selected && <span className="settings-language-radio-dot" />}
                    </span>
                    <span className="settings-language-label">{plugin.label}</span>
                    <span className="settings-language-code">{plugin.id}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <DesktopAppSection />
          <TerminalSettingsSection />

          {shellSettings?.isWindows && (
            <section className="settings-general-section">
              <h3 className="settings-general-heading">{t("settings.shellTool")}</h3>
              <p className="settings-general-description">{t("settings.shellToolDescription")}</p>
              <div className="settings-shell-option">
                <span>{t("settings.usePowerShell")}</span>
                <ConfigSwitch
                  checked={shellSettings.powerShellEnabled}
                  loading={shellSaving}
                  label={t("settings.usePowerShell")}
                  onChange={(enabled) => void togglePowerShell(enabled)}
                />
              </div>
              {shellError && <p role="alert" className="settings-general-error">{shellError}</p>}
            </section>
          )}

          {webAuthEnabled && (
            <section className="settings-general-section">
              <ConfigButton variant="secondary" disabled={loggingOut} onClick={() => void logOut()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                </svg>
                {loggingOut ? t("auth.loggingOut") : t("auth.logOut")}
              </ConfigButton>
              {logoutError && <p role="alert" className="settings-general-error">{logoutError}</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export const SETTINGS_SECTION_ITEMS: { id: SettingsSection; labelKey: string; requiresProject: boolean }[] = [
  { id: "general", labelKey: "settings.general", requiresProject: false },
  { id: "appearance", labelKey: "settings.appearance", requiresProject: false },
  { id: "models", labelKey: "common.models", requiresProject: false },
  { id: "skills", labelKey: "common.skills", requiresProject: true },
  { id: "agents", labelKey: "common.agents", requiresProject: true },
  { id: "plugins", labelKey: "common.plugins", requiresProject: true },
  { id: "mcp", labelKey: "settings.mcp", requiresProject: false },
];

export function SettingsPanel({
  cwd,
  sessionId,
  initialSection,
  onClose,
  onSessionReloaded,
  quoteSelectionEnabled,
  onQuoteSelectionChange,
  soundEnabled,
  onSoundToggle,
  projectTrust,
  onOpenTrustDialog,
  onProjectTrustChanged,
}: Props) {
  const { t } = useI18n();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [mountedSections, setMountedSections] = useState<ReadonlySet<SettingsSection>>(
    () => new Set([section]),
  );
  // Which sections need a project is decided once, in lib/settings-navigation.ts.
  const sections: { id: SettingsSection; label: string; requiresProject: boolean }[] = SETTINGS_SECTION_ITEMS.map((item) => ({
    id: item.id,
    label: t(item.labelKey),
    requiresProject: settingsSectionRequiresProject(item.id),
  }));
  const sectionRequiresProject = settingsSectionRequiresProject(section);
  const pageLayout = usePlusStyle() === "clean";
  const [query, setQuery] = useState("");
  const visibleSections = pageLayout
    ? matchSettingsSections(sections.map((item) => ({ ...item, description: t(`plus.settings.desc.${item.id}`) })), query)
    : sections;
  const currentLabel = sections.find((item) => item.id === section)?.label ?? "";
  // A signed desktop update installs and relaunches the app; the dialog must not
  // be dismissible from under it (the Version & Updates block reports the phase).
  const [busy, setBusy] = useState(false);

  useEffect(() => setLastSettingsSection(initialSection), [initialSection]);

  // Per-platform dialog styling (native-theme.css) keys off <html data-platform>; set before paint.
  useLayoutEffect(() => {
    applyUiPlatform();
    document.documentElement.dataset.plusSettingsOpen = "1";
    return () => {
      delete document.documentElement.dataset.plusSettingsOpen;
    };
  }, []);

  // Bubble phase, unless something nearer handled the key. The trust dialog,
  // which opens above Settings, takes Escape in the capture phase and stops it,
  // so one Escape closes that dialog and leaves Settings open. A busy update
  // keeps the dialog open with it (see onBusyChange above).
  useEffect(() => listenForPanelEscape(document, () => { if (!busy) onClose(); }), [onClose, busy]);

  // Focus moves into Settings as it opens and back to what had it once it closes. Left
  // on the chat composer (a bare /mcp opens Settings from there), Escape would reach the
  // composer first and stop a running agent, which also kept Settings open. A layout
  // effect, so the opener is read before a section focuses its own search box.
  const dialogRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => focusModalPanel(document, dialogRef.current, {
    restoreTextEntry: !window.matchMedia?.("(pointer: coarse)").matches,
  }), []);

  useEffect(() => {
    if (cwd || !sectionRequiresProject) return;
    setSection("general");
    setMountedSections((current) => new Set(current).add("general"));
    setLastSettingsSection("general");
  }, [cwd, sectionRequiresProject]);

  const activateSection = (nextSection: SettingsSection) => {
    setMountedSections((current) => new Set(current).add(nextSection));
    setSection(nextSection);
    setLastSettingsSection(nextSection);
  };

  const renderTab = (item: (typeof sections)[number]) => {
    const selected = section === item.id;
    const disabled = item.requiresProject && !cwd;
    return (
      <button
        key={item.id}
        type="button"
        className="settings-section-tab"
        data-section={item.id}
        disabled={disabled}
        title={disabled ? t("settings.projectRequired") : item.label}
        aria-current={selected ? "page" : undefined}
        onClick={() => activateSection(item.id)}
      >
        <SettingsSectionIcon section={item.id} />
        <span>{item.label}</span>
      </button>
    );
  };

  const sectionHost = (id: SettingsSection, content: ReactNode) => mountedSections.has(id) ? (
    <div
      key={id}
      hidden={section !== id}
      className="settings-section-host"
    >
      {content}
    </div>
  ) : null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.title")}
      tabIndex={-1}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
      className={`settings-dialog-backdrop${pageLayout ? " is-plus-page" : ""}`}
    >
      <div className="settings-dialog-surface">
        <div className="settings-dialog-header">
          <strong className="settings-dialog-title">{t("settings.title")}</strong>
          <AppSelect
            aria-label={t("settings.sectionPicker")}
            value={section}
            onValueChange={(value) => activateSection(value as SettingsSection)}
            className="settings-mobile-section-picker"
            options={sections.map((item) => ({ value: item.id, label: item.label, disabled: item.requiresProject && !cwd }))}
          />
          {pageLayout && (
            <label className="plus-settings-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                type="search"
                value={query}
                placeholder={t("plus.settings.search")}
                aria-label={t("plus.settings.search")}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const first = visibleSections.find((item) => !(item.requiresProject && !cwd));
                    if (first) activateSection(first.id);
                  } else if (event.key === "Escape" && query) {
                    // The first Escape clears the search; the next one leaves Settings
                    // (listenForPanelEscape skips a handled, default-prevented key).
                    event.preventDefault();
                    setQuery("");
                  }
                }}
              />
            </label>
          )}
          <nav aria-label={t("settings.title")} className="settings-section-tabs">
            {pageLayout
              ? SETTINGS_NAV_GROUPS.map((group) => {
                const items = visibleSections.filter((item) => group.sections.includes(item.id));
                if (items.length === 0) return null;
                return (
                  <div key={group.id} className="plus-settings-nav-group">
                    <div className="plus-settings-nav-label">{t(`plus.settings.group.${group.id}`)}</div>
                    {items.map(renderTab)}
                  </div>
                );
              })
              : sections.map(renderTab)}
            {pageLayout && visibleSections.length === 0 && (
              <div className="plus-settings-nav-empty">{t("plus.settings.noMatch")}</div>
            )}
          </nav>
          <button type="button" onClick={onClose} title={t("i18n.close")} aria-label={t("i18n.close")} className="config-close-button settings-dialog-close">
            {pageLayout ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                <span>{t("plus.settings.back")}</span>
              </>
            ) : "×"}
          </button>
          {pageLayout && (
            <div className="plus-settings-titlebar">
              <PlusSettingsWindowBar dialogRef={dialogRef} onClose={onClose} busy={busy} />
            </div>
          )}
        </div>

        <main className="settings-dialog-main">
          {pageLayout && (
            <header className="plus-settings-page-header">
              <span className="plus-settings-page-icon"><SettingsSectionIcon section={section} size={18} /></span>
              <span className="plus-settings-page-text">
                <h1>{currentLabel}</h1>
                <span>{t(`plus.settings.desc.${section}`)}</span>
              </span>
            </header>
          )}
          {sectionHost("general", <GeneralSettings sessionId={sessionId} onSessionReloaded={onSessionReloaded} quoteSelectionEnabled={quoteSelectionEnabled} onQuoteSelectionChange={onQuoteSelectionChange} soundEnabled={soundEnabled} onSoundToggle={onSoundToggle} onBusyChange={setBusy} />)}
          {sectionHost("appearance", <AppearanceSettingsPage />)}
          {sectionHost("models", <ModelsConfig embedded cwd={cwd} onClose={onClose} onOpenMcp={() => activateSection("mcp")} />)}
          {/* Visited sections stay mounted, so the ones whose answer depends on trust take the page's
              status and load again in place when trusting from Settings › MCP changes it. */}
          {cwd && sectionHost("skills", <SkillsConfig embedded key={cwd} cwd={cwd} trust={projectTrust} onClose={onClose} />)}
          {cwd && sectionHost("agents", <AgentsConfig embedded key={cwd} cwd={cwd} sessionId={sessionId} trust={projectTrust} onClose={onClose} onReloaded={onSessionReloaded} />)}
          {cwd && sectionHost("plugins", <PluginsConfig embedded key={cwd} cwd={cwd} sessionId={sessionId} trust={projectTrust} onClose={onClose} onReloaded={onSessionReloaded} />)}
          {/* No project needed: the global mcp.json is listed alone, and a project adds its group. */}
          {sectionHost("mcp", <McpConfig embedded key={cwd ?? ""} cwd={cwd} trust={projectTrust} onTrustProject={onOpenTrustDialog} onProjectTrustChanged={onProjectTrustChanged} onClose={onClose} />)}
        </main>
      </div>
    </div>
  );
}
