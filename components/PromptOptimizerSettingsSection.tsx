"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { AppSelect } from "./AppSelect";
import { ConfigSwitch } from "./SettingsUi";
import {
  OPTIMIZER_STYLES,
  OPTIMIZER_THINKING_LEVELS,
  type PromptOptimizerSettings,
} from "@/lib/prompt-optimizer-shared";

type Loaded = PromptOptimizerSettings & { instructionsMax: number };
type ModelOption = { id: string; name: string; provider: string };

const THINKING_LABEL_KEYS: Record<string, string> = {
  off: "chat.thinkingOff", minimal: "chat.thinkingMinimal", low: "chat.thinkingLow",
  medium: "chat.thinkingMedium", high: "chat.thinkingHigh", xhigh: "chat.thinkingXhigh", max: "chat.thinkingMax",
};

/** Plus: Settings › General › Improve prompt (the ✨ button in the composer). */
export function PromptOptimizerSettingsSection() {
  const { t } = useI18n();
  const hintId = useId();
  const [settings, setSettings] = useState<Loaded | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/prompt-optimize/settings", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: Loaded) => {
        if (cancelled) return;
        setSettings(data);
        setDraft(data.instructions);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    fetch("/api/chat-workspace", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { cwd?: string }) => fetch(`/api/models?cwd=${encodeURIComponent(data.cwd ?? "")}`, { cache: "no-store" }))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { modelList?: ModelOption[] }) => { if (!cancelled) setModels(data.modelList ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const save = useCallback((patch: Partial<PromptOptimizerSettings>) => {
    setSaving(true);
    setFailed(false);
    return fetch("/api/prompt-optimize/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: Loaded) => {
        setSettings(data);
        if ("instructions" in patch) setDraft(data.instructions);
      })
      .catch(() => setFailed(true))
      .finally(() => setSaving(false));
  }, []);

  const modelValue = settings?.model ? `${settings.model.provider}\u0000${settings.model.modelId}` : "";
  const selectedKnown = !settings?.model || models.some((model) => model.provider === settings.model?.provider && model.id === settings.model?.modelId);
  const max = settings?.instructionsMax ?? 4000;
  const dirty = settings !== null && draft !== settings.instructions;

  return (
    <section className="settings-general-section">
      <h3 className="settings-general-heading">{t("optimizer.title")}</h3>
      <p className="settings-option-hint plus-optimizer-intro">{t("optimizer.intro")}</p>
      <div className="settings-chat-options">
        <div className="settings-chat-option settings-chats-field">
          <label htmlFor="settings-optimizer-model">{t("optimizer.model")}</label>
          <AppSelect
            id="settings-optimizer-model"
            className="settings-chats-control"
            aria-label={t("optimizer.model")}
            value={modelValue}
            disabled={settings === null || saving}
            onValueChange={(value) => {
              const [provider, modelId] = value.split("\u0000");
              void save({ model: provider && modelId ? { provider, modelId } : null });
            }}
            options={[
              { value: "", label: t("optimizer.modelFollow") },
              ...(!selectedKnown && settings?.model ? [{ value: modelValue, label: `${settings.model.provider}/${settings.model.modelId}` }] : []),
              ...models.map((model) => ({ value: `${model.provider}\u0000${model.id}`, label: `${model.name || model.id} · ${model.provider}` })),
            ]}
          />
        </div>
        <div className="settings-chat-option settings-chats-field">
          <label htmlFor="settings-optimizer-thinking">{t("optimizer.thinking")}</label>
          <AppSelect
            id="settings-optimizer-thinking"
            className="settings-chats-control"
            aria-label={t("optimizer.thinking")}
            value={settings?.thinkingLevel ?? ""}
            disabled={settings === null || saving}
            onValueChange={(value) => void save({ thinkingLevel: value ? value as PromptOptimizerSettings["thinkingLevel"] : null })}
            options={[
              { value: "", label: t("optimizer.thinkingAuto") },
              ...OPTIMIZER_THINKING_LEVELS.map((level) => ({ value: level, label: t(THINKING_LABEL_KEYS[level]) })),
            ]}
          />
        </div>
        <div className="settings-chat-option settings-chats-field">
          <label>{t("optimizer.style")}</label>
          <div className="settings-choice-group" role="radiogroup" aria-label={t("optimizer.style")}>
            {OPTIMIZER_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                role="radio"
                aria-checked={settings?.style === style}
                title={t(`optimizer.styleHint.${style}`)}
                disabled={settings === null || saving}
                className={`config-button config-button-small ${settings?.style === style ? "config-button-primary" : "config-button-secondary"}`}
                onClick={() => void save({ style })}
              >
                {t(`optimizer.style.${style}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-chat-option settings-chat-switch-option">
          <span>
            {t("optimizer.useContext")}
            <span className="settings-option-hint" style={{ display: "block" }}>{t("optimizer.useContextHint")}</span>
          </span>
          <ConfigSwitch
            checked={settings?.useContext ?? true}
            label={t("optimizer.useContext")}
            disabled={settings === null || saving}
            onChange={(enabled) => void save({ useContext: enabled })}
          />
        </div>
        <div className="settings-chat-option settings-chats-field settings-chats-instructions">
          <label htmlFor="settings-optimizer-instructions">{t("optimizer.instructions")}</label>
          <textarea
            id="settings-optimizer-instructions"
            className="settings-chats-control"
            rows={4}
            maxLength={max}
            value={draft}
            disabled={settings === null}
            aria-describedby={hintId}
            placeholder={t("optimizer.instructionsPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => { if (dirty) void save({ instructions: draftRef.current }); }}
          />
          <span id={hintId} className="settings-chats-hint" role={failed ? "alert" : undefined}>
            {failed ? t("settings.chatsFailed") : saving ? t("i18n.saving") : t("optimizer.instructionsHint", { count: draft.length, max })}
          </span>
        </div>
      </div>
    </section>
  );
}
