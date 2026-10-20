"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { useTheme } from "@/hooks/useTheme";
import { THEME_OPTIONS } from "@/lib/theme";
import { openPathNative, isTauriDesktop } from "@/lib/desktop-native";
import {
  CHAT_CONTENT_FONT_SIZE_DEFAULT,
  CHAT_CONTENT_FONT_SIZE_MAX,
  CHAT_CONTENT_FONT_SIZE_MIN,
  CHAT_CONTENT_WIDTH_DEFAULT,
  CHAT_CONTENT_WIDTH_MAX,
  CHAT_CONTENT_WIDTH_MIN,
  CHAT_CONTENT_WIDTH_PERCENT_DEFAULT,
  CHAT_CONTENT_WIDTH_PERCENT_MAX,
  CHAT_CONTENT_WIDTH_PERCENT_MIN,
  useChatAppearance,
} from "@/hooks/useChatAppearance";
import { ThemeIcon } from "./ThemeIcon";
import { ConfigButton } from "./SettingsUi";
import { PlusAppearanceSettings } from "./PlusAppearanceSettings";
import { AppearancePreview } from "./AppearancePreview";

function ResetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
    </svg>
  );
}

/**
 * Plus: Settings › Appearance. Controls on the left; on the right a live
 * preview built from the real chat components, so each change shows at once
 * without closing Settings.
 */
export function AppearanceSettingsPage() {
  const { t } = useI18n();
  const { preference, setThemePreference } = useTheme();
  const {
    width: chatContentWidth,
    setWidth: setChatContentWidth,
    widthPercent: chatContentWidthPercent,
    setWidthPercent: setChatContentWidthPercent,
    widthUnit: chatContentWidthUnit,
    setWidthUnit: setChatContentWidthUnit,
    resetWidth: resetChatContentWidth,
    fontSize,
    setFontSize,
  } = useChatAppearance();
  const chatWidthIsPercent = chatContentWidthUnit === "percent";
  const chatWidthIsDefault = chatWidthIsPercent
    ? chatContentWidthPercent === CHAT_CONTENT_WIDTH_PERCENT_DEFAULT
    : chatContentWidth === CHAT_CONTENT_WIDTH_DEFAULT;
  const desktop = isTauriDesktop();
  const [customCssBusy, setCustomCssBusy] = useState(false);
  const [customCssError, setCustomCssError] = useState<string | null>(null);

  const openCustomCss = async () => {
    setCustomCssBusy(true);
    setCustomCssError(null);
    try {
      const response = await fetch("/api/custom-css", { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { path?: string };
      if (!data.path) throw new Error("Missing path in response");
      await openPathNative(data.path);
    } catch (error) {
      console.error("Failed to open custom.css:", error);
      setCustomCssError(t("appSettings.customCssOpenError"));
    } finally {
      setCustomCssBusy(false);
    }
  };

  return (
    <div className="settings-general plus-appearance-page">
      <h2 className="settings-general-title">{t("settings.appearance")}</h2>
      <div className="plus-appearance-layout">
        <div className="plus-appearance-controls">
          <section className="settings-general-section">
            <h3 className="settings-general-heading">{t("plus.appearanceMode")}</h3>
            <div role="radiogroup" aria-label={t("plus.appearanceMode")} className="settings-theme-options">
              {THEME_OPTIONS.map((option) => (
                <label key={option.id} className="settings-theme-option">
                  <input
                    type="radio"
                    name="theme"
                    value={option.id}
                    checked={preference === option.id}
                    onChange={() => setThemePreference(option.id)}
                    className="sr-only"
                  />
                  <ThemeIcon preference={option.id} />
                  <span className="settings-theme-option-label">{t(option.label)}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-general-section">
            <PlusAppearanceSettings />
          </section>

          <section className="settings-general-section">
            <h3 className="settings-general-heading">{t("plus.chatLayout")}</h3>
            <div className="settings-chat-options">
              <div className="settings-chat-option settings-chat-range-option">
                <div className="settings-chat-range-header">
                  <label htmlFor="settings-chat-content-width">{t("settings.chatContentWidth")}</label>
                  <div className="settings-choice-group settings-chat-width-unit" role="radiogroup" aria-label={t("settings.chatContentWidthUnit")}>
                    {(["px", "percent"] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        role="radio"
                        aria-checked={chatContentWidthUnit === unit}
                        className={`config-button config-button-small ${chatContentWidthUnit === unit ? "config-button-primary" : "config-button-secondary"}`}
                        onClick={() => setChatContentWidthUnit(unit)}
                      >
                        {unit === "px" ? "px" : "%"}
                      </button>
                    ))}
                  </div>
                  <output htmlFor="settings-chat-content-width">
                    {chatWidthIsPercent ? `${chatContentWidthPercent}%` : `${chatContentWidth}px`}
                  </output>
                  <ConfigButton
                    variant="ghost"
                    size="small"
                    className="settings-chat-reset"
                    title={t("settings.resetChatContentWidth")}
                    aria-label={t("settings.resetChatContentWidth")}
                    disabled={chatWidthIsDefault}
                    onClick={resetChatContentWidth}
                  >
                    <ResetIcon />
                  </ConfigButton>
                </div>
                <input
                  id="settings-chat-content-width"
                  type="range"
                  min={chatWidthIsPercent ? CHAT_CONTENT_WIDTH_PERCENT_MIN : CHAT_CONTENT_WIDTH_MIN}
                  max={chatWidthIsPercent ? CHAT_CONTENT_WIDTH_PERCENT_MAX : CHAT_CONTENT_WIDTH_MAX}
                  step={chatWidthIsPercent ? 1 : 10}
                  value={chatWidthIsPercent ? chatContentWidthPercent : chatContentWidth}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (chatWidthIsPercent) setChatContentWidthPercent(value);
                    else setChatContentWidth(value);
                  }}
                />
                <p className="settings-option-hint">{t("settings.chatContentWidthDragHint")}</p>
              </div>
              <div className="settings-chat-option settings-chat-range-option">
                <div className="settings-chat-range-header">
                  <label htmlFor="settings-chat-content-font-size">{t("settings.chatContentFontSize")}</label>
                  <output htmlFor="settings-chat-content-font-size">{fontSize}px</output>
                  <ConfigButton
                    variant="ghost"
                    size="small"
                    className="settings-chat-reset"
                    title={t("settings.resetChatContentFontSize")}
                    aria-label={t("settings.resetChatContentFontSize")}
                    disabled={fontSize === CHAT_CONTENT_FONT_SIZE_DEFAULT}
                    onClick={() => setFontSize(CHAT_CONTENT_FONT_SIZE_DEFAULT)}
                  >
                    <ResetIcon />
                  </ConfigButton>
                </div>
                <input
                  id="settings-chat-content-font-size"
                  type="range"
                  min={CHAT_CONTENT_FONT_SIZE_MIN}
                  max={CHAT_CONTENT_FONT_SIZE_MAX}
                  step={1}
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                />
              </div>
            </div>
          </section>

          <section className="settings-general-section">
            <div className="settings-option-list">
              <div className="settings-option">
                <span className="settings-option-text">
                  <span className="settings-option-title">{t("appSettings.customCss")}</span>
                  <span className="settings-option-hint">{t("appSettings.customCssHint")}</span>
                </span>
                {desktop && (
                  <ConfigButton
                    variant="secondary"
                    size="small"
                    className="settings-option-action"
                    disabled={customCssBusy}
                    onClick={() => void openCustomCss()}
                  >
                    {customCssBusy ? t("appSettings.customCssOpening") : t("appSettings.customCssOpen")}
                  </ConfigButton>
                )}
              </div>
            </div>
            {customCssError && <p role="alert" className="settings-general-error">{customCssError}</p>}
          </section>
        </div>

        <aside className="plus-appearance-preview-pane">
          <AppearancePreview />
        </aside>
      </div>
    </div>
  );
}
