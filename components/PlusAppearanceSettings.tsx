"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { usePlusTheme } from "@/hooks/usePlusTheme";
import { setCustomCssEnabled } from "@/lib/plus-theme";
import { appNotify } from "@/lib/notification-store";
import { ConfigSwitch } from "./SettingsUi";
import { FontPicker, loadSystemFonts } from "./FontPicker";
import { CUSTOM_CSS_PREVIEW_ID, reloadCustomCssLink } from "./PlusAppearanceRuntime";

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error || `HTTP ${response.status}`;
}

/**
 * Plus Appearance Studio: Typography & System Fonts + live Custom CSS Studio.
 */
export function PlusAppearanceSettings({
  livePreviewMode = false,
  onToggleLivePreview,
}: {
  livePreviewMode?: boolean;
  onToggleLivePreview?: () => void;
}) {
  const { t } = useI18n();
  const { settings, update } = usePlusTheme();

  // Built-in Custom CSS Studio state (always ready in the Custom CSS card)
  const [customCss, setCustomCss] = useState("");
  const [savedCustomCss, setSavedCustomCss] = useState("");
  const [cssStatus, setCssStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cssError, setCssError] = useState<string | null>(null);
  const [showCssGuide, setShowCssGuide] = useState(false);

  useEffect(() => { void loadSystemFonts(); }, []);

  // Load existing custom.css on mount
  useEffect(() => {
    let active = true;
    void fetch("/api/custom-css", { cache: "no-store" })
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (!active) return;
        setCustomCss(text);
        setSavedCustomCss(text);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Live-inject customCss edits into <style id="plus-custom-css-preview">
  useEffect(() => {
    const dirty = customCss !== savedCustomCss;
    let style = document.getElementById(CUSTOM_CSS_PREVIEW_ID) as HTMLStyleElement | null;
    if (!dirty) {
      style?.remove();
      setCustomCssEnabled(settings.customCssOverlay);
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = CUSTOM_CSS_PREVIEW_ID;
    }
    // Append at the end of <head> so live edits override built-in theme tokens
    document.head.appendChild(style);
    style.textContent = customCss;
    setCustomCssEnabled(false);
  }, [customCss, savedCustomCss, settings.customCssOverlay]);

  useEffect(() => () => {
    document.getElementById(CUSTOM_CSS_PREVIEW_ID)?.remove();
  }, []);

  const saveCustomCss = async (nextCss = customCss) => {
    setCssStatus("saving");
    setCssError(null);
    try {
      const response = await fetch("/api/custom-css", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ css: nextCss }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setSavedCustomCss(nextCss);
      document.getElementById(CUSTOM_CSS_PREVIEW_ID)?.remove();
      const shouldEnable = Boolean(nextCss.trim());
      if (settings.customCssOverlay !== shouldEnable) {
        update({ customCssOverlay: shouldEnable });
      }
      setCustomCssEnabled(shouldEnable);
      reloadCustomCssLink(String(Date.now()));
      setCssStatus("saved");
      window.setTimeout(() => setCssStatus((value) => (value === "saved" ? "idle" : value)), 1600);
    } catch (err) {
      setCssStatus("error");
      setCssError(err instanceof Error ? err.message : String(err));
    }
  };

  const cssDirty = customCss !== savedCustomCss;

  return (
    <div className="plus-appearance">
      {/* Typography & System Fonts */}
      <div className="plus-studio-card">
        <div className="plus-appearance-heading">
          <span>
            <strong>{t("plus.fonts")}</strong>
            <span className="plus-studio-subtitle">独立配置界面、对话阅读、标题粗体与代码等宽字体</span>
          </span>
          <span className="plus-appearance-heading-actions">
            <button type="button" className="config-button config-button-small config-button-secondary" onClick={() => void loadSystemFonts(true).then(() => appNotify.success({ message: t("plus.fontsRefreshed") }))}>
              {t("plus.fontsRefresh")}
            </button>
            <button type="button" className="config-button config-button-small config-button-secondary" onClick={() => update({ uiFont: "", chatFont: "", chatBoldFont: "", codeFont: "" })}>
              {t("plus.resetAppearance")}
            </button>
          </span>
        </div>
        {([
          ["ui", "uiFont", "plus.fontUi", "plus.fontUiHint"],
          ["chat", "chatFont", "plus.fontChat", "plus.fontChatHint"],
          ["chatBold", "chatBoldFont", "plus.fontChatBold", "plus.fontChatBoldHint"],
          ["code", "codeFont", "plus.fontCode", "plus.fontCodeHint"],
        ] as const).map(([role, key, label, hint]) => (
          <div key={role} className="plus-appearance-row">
            <span>
              <span>{t(label)}</span>
              <span className="settings-option-hint">{t(hint)}</span>
            </span>
            <FontPicker role={role} label={t(label)} value={settings[key]} onChange={(value) => update({ [key]: value })} />
          </div>
        ))}
      </div>

      {/* Custom CSS Studio */}
      <div className="plus-studio-card plus-css-studio-card">
        <div className="plus-appearance-heading">
          <span>
            <strong>自定义 CSS 工作台（Custom CSS Studio）</strong>
            <span className="plus-studio-subtitle">
              实时覆盖全局色彩、行内代码、标题样式、版心布局、背景壁纸与毛玻璃特效（自动同步至 ~/.pi/agent/desktop/custom.css）
            </span>
          </span>
          <span className="plus-appearance-heading-actions">
            {onToggleLivePreview && (
              <button
                type="button"
                className={`config-button config-button-small ${livePreviewMode ? "config-button-primary" : "config-button-secondary"}`}
                onClick={onToggleLivePreview}
              >
                {livePreviewMode ? "返回完整设置" : "开启全局界面预览"}
              </button>
            )}
            <button
              type="button"
              className="config-button config-button-small config-button-secondary"
              onClick={() => setShowCssGuide((v) => !v)}
            >
              {showCssGuide ? "收起接口速查" : "设计接口速查"}
            </button>
            <ConfigSwitch
              checked={settings.customCssOverlay}
              label={t("plus.customCss")}
              onChange={(enabled) => update({ customCssOverlay: enabled })}
            />
          </span>
        </div>

        {showCssGuide && (
          <div className="plus-css-guide-drawer">
            <div className="plus-css-guide-grid">
              <div>
                <strong>色彩与行内代码接口（放在 <code>html[data-plus-theme]:root</code>）</strong>
                <ul>
                  <li><code>--accent</code> / <code>--plus-fill</code>：全局强调色与主按钮色</li>
                  <li><code>--plus-inline-code</code> / <code>--plus-inline-code-bg</code> / <code>--plus-inline-code-border</code>：行内代码文字色、胶囊背景与边框色</li>
                  <li><code>--plus-marker</code>：列表圆点与序号颜色</li>
                  <li><code>--plus-heading-color</code> / <code>--plus-link-color</code>：标题与链接颜色</li>
                  <li><code>--plus-user-bar-color</code>：用户提问卡左侧竖条颜色</li>
                </ul>
              </div>
              <div>
                <strong>壁纸、毛玻璃与布局接口（完整说明见 <code>docs/CUSTOM-CSS.md</code>）</strong>
                <ul>
                  <li><code>--plus-bg-image</code>：背景壁纸（如 <code>url(&quot;https://...&quot;)</code> 或渐变）</li>
                  <li><code>--plus-glass-blur</code>：面板毛玻璃模糊度（如 <code>20px</code>）</li>
                  <li><code>--plus-surface-alpha</code>：面板透明混合比例（如 <code>28%</code>）</li>
                  <li><code>--chat-content-max-width</code>：对话版心最大宽度（如 <code>960px</code>）</li>
                  <li><code>--plus-r-ctl</code> / <code>--plus-r-card</code> / <code>--plus-r-overlay</code>：三级圆角</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="plus-css-editor">
          <textarea
            value={customCss}
            spellCheck={false}
            placeholder={"/* 在此输入自定义 CSS，输入即刻全局实时预览 */\nhtml[data-plus-theme]:root {\n  --plus-inline-code: #7a2716;\n  --plus-inline-code-bg: rgba(196, 77, 54, 0.12);\n  --plus-glass-blur: 16px;\n}"}
            aria-label="自定义 CSS 编辑器"
            onChange={(event) => setCustomCss(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void saveCustomCss();
              } else if (event.key === "Tab") {
                event.preventDefault();
                const target = event.currentTarget;
                const { selectionStart, selectionEnd } = target;
                setCustomCss(`${customCss.slice(0, selectionStart)}  ${customCss.slice(selectionEnd)}`);
                requestAnimationFrame(() => target.setSelectionRange(selectionStart + 2, selectionStart + 2));
              }
            }}
          />
          <div className="plus-css-editor-actions">
            <span>
              {cssStatus === "saving" ? t("plus.cssSaving")
                : cssStatus === "saved" ? t("plus.cssSaved")
                  : cssStatus === "error" ? (cssError ?? t("plus.cssError"))
                    : cssDirty ? "实时预览生效中 · 点击保存写入 custom.css" : t("plus.cssLiveHint")}
            </span>
            <span className="spacer" />
            {customCss.trim().length > 0 && (
              <button
                type="button"
                className="config-button config-button-small config-button-secondary"
                onClick={() => {
                  setCustomCss("");
                  void saveCustomCss("");
                }}
              >
                清空规则
              </button>
            )}
            {cssDirty && (
              <button
                type="button"
                className="config-button config-button-small config-button-secondary"
                onClick={() => setCustomCss(savedCustomCss)}
              >
                {t("plus.cssDiscard")}
              </button>
            )}
            <button
              type="button"
              className="config-button config-button-small config-button-primary"
              disabled={!cssDirty || cssStatus === "saving"}
              onClick={() => void saveCustomCss()}
            >
              {t("plus.cssSave")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
