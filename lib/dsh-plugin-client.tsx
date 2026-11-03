"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { updatePlusTheme } from "@/hooks/usePlusTheme";
import { DEFAULT_THEME_ID } from "./plus-theme-catalog";
import {
  applyPlusTheme,
  DEFAULT_PLUS_THEME,
  normalizePlusTheme,
  parseStoredPlusTheme,
  PLUS_THEME_STORAGE_KEY,
  type PlusThemeSettings,
} from "./plus-theme";

export const DSH_PLUGINS_CHANGED_EVENT = "pi:dsh-plugins-changed";
export const CLAUDE_MASCOT_STORAGE_KEY = "pi-plus-claude-mascot";

function readPlusThemeSettings(): PlusThemeSettings {
  if (typeof window === "undefined") return DEFAULT_PLUS_THEME;
  try {
    return parseStoredPlusTheme(window.localStorage.getItem(PLUS_THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_PLUS_THEME;
  }
}

function writePlusThemeSettings(settings: Partial<PlusThemeSettings>): PlusThemeSettings {
  const next = normalizePlusTheme({ ...readPlusThemeSettings(), ...settings });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PLUS_THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort persistence.
    }
    updatePlusTheme(next);
  }
  return next;
}

function readClaudeMascotEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(CLAUDE_MASCOT_STORAGE_KEY);
    return raw !== "0" && raw !== "false";
  } catch {
    return true;
  }
}

function syncClaudeMascotDataset(enabled: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.dshClaudeMascot = enabled ? "1" : "0";
}

let claudeStyleEnabled =
  typeof document === "undefined"
    ? true
    : document.documentElement.dataset.plusStyle === "clean" ||
      document.documentElement.dataset.plusStyle === undefined;
const claudeStyleListeners = new Set<() => void>();

function subscribeClaudeStyle(listener: () => void): () => void {
  claudeStyleListeners.add(listener);
  return () => {
    claudeStyleListeners.delete(listener);
  };
}

function getClaudeStyleSnapshot(): boolean {
  return claudeStyleEnabled;
}

function getClaudeStyleServerSnapshot(): boolean {
  return true;
}

export function useDshClaudeStyleEnabled(): boolean {
  return React.useSyncExternalStore(
    subscribeClaudeStyle,
    getClaudeStyleSnapshot,
    getClaudeStyleServerSnapshot,
  );
}

export function syncClaudeStyleMode(enabled: boolean, prevEnabled: boolean | null): void {
  claudeStyleEnabled = enabled;
  for (const listener of Array.from(claudeStyleListeners)) {
    try {
      listener();
    } catch (err) {
      console.error("[dsh-plugin-client] claudeStyle listener error:", err);
    }
  }
  if (typeof document === "undefined") return;
  syncClaudeMascotDataset(readClaudeMascotEnabled());
  if (enabled) {
    document.documentElement.dataset.dshClaudeStyle = "1";
    const current = readPlusThemeSettings();
    if (current.theme !== "clean" || document.documentElement.dataset.plusTheme !== "clean") {
      const next = writePlusThemeSettings({ ...current, theme: "clean", accent: "" });
      applyPlusTheme(next);
    }
    document.documentElement.dataset.dshClaudeStyle = "1";
  } else {
    delete document.documentElement.dataset.dshClaudeStyle;
    const current = readPlusThemeSettings();
    if (
      prevEnabled === true ||
      current.theme === "clean" ||
      document.documentElement.dataset.plusTheme === "clean"
    ) {
      const next = writePlusThemeSettings({ ...current, theme: DEFAULT_THEME_ID, accent: "" });
      applyPlusTheme(next);
    }
    delete document.documentElement.dataset.dshClaudeStyle;
  }
}

function DshClaudeStyleConfigPanel(): React.ReactElement {
  const [mascotEnabled, setMascotEnabled] = React.useState<boolean>(() =>
    readClaudeMascotEnabled(),
  );

  const handleToggleMascot = React.useCallback((next: boolean) => {
    setMascotEnabled(next);
    try {
      window.localStorage.setItem(CLAUDE_MASCOT_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage errors
    }
    syncClaudeMascotDataset(next);
  }, []);

  const handleOpenFontSettings = React.useCallback(() => {
    if (typeof document === "undefined") return;
    const appearanceTab = document.querySelector<HTMLButtonElement>(
      '.settings-section-tab[data-section="appearance"]',
    );
    if (appearanceTab) {
      appearanceTab.click();
    }
  }, []);

  return (
    <div
      data-dsh-claude-style-config="1"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 16,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 14 }}>Claude Code Desktop 界面重构已激活</strong>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--accent-soft)",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              Active
            </span>
          </div>
          <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            当前已自动启用 Claude Code Desktop 原生色板（#ffffff 纯白画布 / #fafafa 浅灰侧栏 / #d97757 陶烬橙强调色）、侧栏 ✳ Claude 星芒品牌词标、顶栏单行状态头、切缝上下文饼图与单行自适应输入框。关闭此插件将自动恢复默认纸枢（Kami Paper）主题。
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--workbench-bg)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>像素小螃蟹桌宠（Clawd Mascot）</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            在底部输入框右上沿显示跟随会话状态与点击交互的 Clawd 像素小螃蟹精灵（localStorage: pi-plus-claude-mascot）
          </span>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={mascotEnabled}
            onChange={(e) => handleToggleMascot(e.target.checked)}
          />
          <span>{mascotEnabled ? "已开启" : "已隐藏"}</span>
        </label>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--workbench-bg)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>字体与排版工作台</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            独立配置 UI 界面字体、对话阅读字体、标题粗体与代码等宽字体
          </span>
        </div>
        <button
          type="button"
          className="config-button config-button-small config-button-secondary"
          style={{ whiteSpace: "nowrap", flexShrink: 0 }}
          onClick={handleOpenFontSettings}
        >
          打开字体设置
        </button>
      </div>
    </div>
  );
}

const SKIPPED_CLIENT_PLUGINS = new Set<string>([
  // Pi Agent Plus already has a native port of dsh-claude-style in app/plus-theme.css and ComposerMascot.tsx
  "dsh-claude-style",
]);

export interface DshSlotRegistration {
  pluginId: string;
  name: string; // e.g. "plugins.item", "tool.call.toolview", "conversation.session.header.utilities"
  id?: string;
  key?: string; // e.g. tool name "image_generate", "image_upscale"
  order?: number;
  label?: string;
  inject?: () => Record<string, unknown>;
  component: React.ComponentType<any>;
}

export interface DshPluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  homepage?: string;
  installedPath: string;
  sourceKind: "pi-dsh" | "local-dsh";
  hasHostEntry: boolean;
  hasClientEntry: boolean;
  isSkin: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  registeredTools: string[];
  registeredRoutes: string[];
  error?: string;
}

export interface DshClientPluginInfo {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  enabled: boolean;
  hasClientEntry?: boolean;
  hasHostEntry?: boolean;
  config?: Record<string, unknown>;
  slots?: string[];
}

export interface DshConfigFormSnapshot {
  status: "ready";
  writable: boolean;
  value: Record<string, unknown>;
}

export interface DshConfigForm {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => DshConfigFormSnapshot;
  set: (field: string | Record<string, unknown>, value?: unknown) => Promise<void>;
  /** Internal helper to sync updated config from host without triggering another POST */
  _syncFromHost?: (nextConfig: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// 1. Reactive Slot Registry & Store
// ---------------------------------------------------------------------------

interface InternalSlotEntry extends DshSlotRegistration {
  registrationId: number;
  rawLabel?: string | (() => string);
}

let nextSlotRegistrationId = 1;
const slotEntries = new Map<number, InternalSlotEntry>();
const slotListeners = new Set<() => void>();
const slotSnapshotCache = new Map<string, DshSlotRegistration[]>();
const EMPTY_SLOT_LIST: DshSlotRegistration[] = [];
Object.freeze(EMPTY_SLOT_LIST);

function emitSlotChange(): void {
  slotSnapshotCache.clear();
  for (const listener of Array.from(slotListeners)) {
    try {
      listener();
    } catch (err) {
      console.error("[dsh-plugin-client] slot listener error:", err);
    }
  }
}

function subscribeSlots(listener: () => void): () => void {
  slotListeners.add(listener);
  return () => {
    slotListeners.delete(listener);
  };
}

function resolveSlotLabel(rawLabel: string | (() => string) | undefined): string | undefined {
  if (typeof rawLabel === "function") {
    try {
      const value = rawLabel();
      return typeof value === "string" ? value : String(value ?? "");
    } catch {
      return undefined;
    }
  }
  return typeof rawLabel === "string" ? rawLabel : undefined;
}

function getSlotsSnapshot(slotName: string, key?: string): DshSlotRegistration[] {
  const cacheKey = `${slotName}\0${key ?? "*"}`;
  const cached = slotSnapshotCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const matched: InternalSlotEntry[] = [];
  for (const entry of slotEntries.values()) {
    if (entry.name !== slotName) continue;
    if (key !== undefined) {
      const entryKey = entry.key ?? entry.id;
      if (entryKey !== key && entry.id !== key && entry.pluginId !== key) {
        continue;
      }
    }
    matched.push(entry);
  }

  if (matched.length === 0) {
    slotSnapshotCache.set(cacheKey, EMPTY_SLOT_LIST);
    return EMPTY_SLOT_LIST;
  }

  matched.sort((a, b) => {
    const orderDiff = (a.order ?? 100) - (b.order ?? 100);
    if (orderDiff !== 0) return orderDiff;
    return a.registrationId - b.registrationId;
  });

  const result: DshSlotRegistration[] = matched.map((entry) => ({
    pluginId: entry.pluginId,
    name: entry.name,
    id: entry.id,
    key: entry.key,
    order: entry.order,
    label: resolveSlotLabel(entry.rawLabel) ?? entry.label,
    inject: entry.inject,
    component: entry.component,
  }));
  Object.freeze(result);
  slotSnapshotCache.set(cacheKey, result);
  return result;
}

function registerPluginSlot(
  pluginId: string,
  options: Record<string, any>,
  component: React.ComponentType<any>,
): () => void {
  if (!options || typeof options.name !== "string" || typeof component !== "function") {
    return () => {};
  }
  const registrationId = nextSlotRegistrationId++;
  const rawLabel =
    typeof options.label === "function" || typeof options.label === "string"
      ? options.label
      : undefined;
  const entry: InternalSlotEntry = {
    registrationId,
    pluginId,
    name: options.name,
    id: typeof options.id === "string" ? options.id : undefined,
    key: typeof options.key === "string" ? options.key : undefined,
    order: typeof options.order === "number" && Number.isFinite(options.order) ? options.order : undefined,
    label: resolveSlotLabel(rawLabel),
    rawLabel,
    inject: typeof options.inject === "function" ? options.inject : undefined,
    component,
  };

  slotEntries.set(registrationId, entry);
  emitSlotChange();

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (slotEntries.delete(registrationId)) {
      emitSlotChange();
    }
  };
}

function removeSlotsForPlugin(pluginId: string): void {
  let removed = false;
  for (const [id, entry] of slotEntries.entries()) {
    if (entry.pluginId === pluginId) {
      slotEntries.delete(id);
      removed = true;
    }
  }
  if (removed) {
    emitSlotChange();
  }
}

export function useDshPluginSlots(slotName: string, key?: string): DshSlotRegistration[] {
  const getSnapshot = React.useCallback(
    () => getSlotsSnapshot(slotName, key),
    [slotName, key],
  );
  const getServerSnapshot = React.useCallback(() => EMPTY_SLOT_LIST, []);
  return React.useSyncExternalStore(subscribeSlots, getSnapshot, getServerSnapshot);
}

interface SlotErrorBoundaryProps {
  pluginId: string;
  slotName: string;
  children: React.ReactNode;
}

interface SlotErrorBoundaryState {
  error: Error | null;
}

class DshSlotErrorBoundary extends React.Component<SlotErrorBoundaryProps, SlotErrorBoundaryState> {
  constructor(props: SlotErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): SlotErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      `[dsh-plugin-client] Error rendering slot "${this.props.slotName}" from plugin "${this.props.pluginId}":`,
      error,
      errorInfo,
    );
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
          data-dsh-slot-error={this.props.pluginId}
        >
          Plugin UI error ({this.props.pluginId}): {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function createBoundHookFromStore(store: any) {
  if (!store || typeof store.subscribe !== "function" || typeof store.getSnapshot !== "function") {
    return undefined;
  }
  const subscribe = (listener: () => void) => store.subscribe(listener);
  const getSnapshot = () => store.getSnapshot();
  return function useBoundDshStore(selector?: (snapshot: any) => any) {
    const snap = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return typeof selector === "function" ? selector(snap) : snap;
  };
}

function DshSlotItemRenderer({
  slot,
  hostProps,
}: {
  slot: DshSlotRegistration;
  hostProps?: Record<string, unknown>;
}) {
  const injected = React.useMemo(() => {
    if (typeof slot.inject !== "function") return {};
    try {
      const raw = slot.inject() ?? {};
      if (!raw || typeof raw !== "object") return {};
      const out: Record<string, unknown> = { ...raw };
      const hooksObj = (raw as Record<string, any>).hooks;
      if (hooksObj && typeof hooksObj === "object") {
        for (const [hookKey, store] of Object.entries(hooksObj)) {
          if (!hookKey) continue;
          const propName = `use${hookKey.charAt(0).toUpperCase()}${hookKey.slice(1)}`;
          if (!(propName in out)) {
            const boundHook = createBoundHookFromStore(store);
            if (boundHook) {
              out[propName] = boundHook;
            }
          }
        }
      }
      return out;
    } catch (err) {
      console.error(
        `[dsh-plugin-client] Failed to evaluate slot.inject() for "${slot.name}" (${slot.pluginId}):`,
        err,
      );
      return {};
    }
  }, [slot]);

  const Component = slot.component;
  return <Component {...injected} {...(hostProps ?? {})} />;
}

export interface DshPluginSlotProps {
  name: string;
  slotKey?: string;
  pluginId?: string;
  props?: Record<string, unknown>;
  fallback?: React.ReactNode;
}

export function DshPluginSlot({
  name,
  slotKey,
  pluginId,
  props,
  fallback = null,
}: DshPluginSlotProps): React.ReactElement | null {
  const registeredSlots = useDshPluginSlots(name, slotKey);
  const matchingSlots = React.useMemo(
    () =>
      pluginId
        ? registeredSlots.filter((item) => item.pluginId === pluginId)
        : registeredSlots,
    [registeredSlots, pluginId],
  );

  if (matchingSlots.length === 0) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <>
      {matchingSlots.map((slot, index) => {
        const reactKey = `${slot.pluginId}:${slot.id ?? slot.key ?? index}`;
        return (
          <DshSlotErrorBoundary
            key={reactKey}
            pluginId={slot.pluginId}
            slotName={slot.name}
          >
            <DshSlotItemRenderer slot={slot} hostProps={props} />
          </DshSlotErrorBoundary>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Reactive `configForms` Store per Plugin
// ---------------------------------------------------------------------------

const configFormsByPlugin = new Map<string, DshConfigForm>();

export function getOrCreateConfigForm(
  pluginId: string,
  initialConfig?: Record<string, unknown>,
): DshConfigForm {
  const existing = configFormsByPlugin.get(pluginId);
  if (existing) {
    if (initialConfig && typeof initialConfig === "object") {
      existing._syncFromHost?.(initialConfig);
    }
    return existing;
  }

  const listeners = new Set<() => void>();
  let currentValue: Record<string, unknown> =
    initialConfig && typeof initialConfig === "object" ? { ...initialConfig } : {};
  let currentSnapshot: DshConfigFormSnapshot = {
    status: "ready",
    writable: true,
    value: currentValue,
  };

  const notify = () => {
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch (err) {
        console.error(`[dsh-plugin-client] configForm listener error (${pluginId}):`, err);
      }
    }
  };

  const updateLocalValue = (nextValue: Record<string, unknown>) => {
    currentValue = nextValue;
    currentSnapshot = {
      status: "ready",
      writable: true,
      value: currentValue,
    };
    notify();
  };

  const form: DshConfigForm = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => currentSnapshot,
    set: async (field: string | Record<string, unknown>, value?: unknown): Promise<void> => {
      let nextValue: Record<string, unknown>;
      if (typeof field === "string") {
        nextValue = {
          ...currentValue,
          [field]: value,
        };
      } else if (field && typeof field === "object") {
        nextValue = {
          ...currentValue,
          ...field,
        };
      } else {
        return;
      }

      updateLocalValue(nextValue);

      try {
        await window.fetch("/api/dsh-plugins", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "setConfig",
            id: pluginId,
            config: nextValue,
          }),
          cache: "no-store",
        });
      } catch (err) {
        console.error(`[dsh-plugin-client] Failed to persist config for ${pluginId}:`, err);
      }
    },
    _syncFromHost: (nextConfig: Record<string, unknown>) => {
      const nextJson = JSON.stringify(nextConfig);
      const currJson = JSON.stringify(currentValue);
      if (nextJson !== currJson) {
        updateLocalValue({ ...nextConfig });
      }
    },
  };

  configFormsByPlugin.set(pluginId, form);
  return form;
}

// ---------------------------------------------------------------------------
// 3. Browser AMD / CommonJS / __ModuleLoader__ Bundle Evaluator
// ---------------------------------------------------------------------------

function createUiPrimitivesShim(): Record<string, any> {
  const Tooltip = ({ label, content, title, children }: any) => {
    const tooltipText =
      typeof label === "string"
        ? label
        : typeof content === "string"
          ? content
          : typeof title === "string"
            ? title
            : undefined;
    return React.createElement(
      "span",
      {
        title: tooltipText,
        style: { display: "inline-flex", alignItems: "center" },
      },
      children,
    );
  };

  const IconPanelLeftOutlineRegular = (props: any) => {
    const size = typeof props?.size === "number" ? props.size : 16;
    return React.createElement(
      "svg",
      {
        width: size,
        height: size,
        viewBox: "0 0 16 16",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.4,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
        className: props?.className,
        style: props?.style,
      },
      React.createElement("rect", { x: 2, y: 2.5, width: 12, height: 11, rx: 2 }),
      React.createElement("path", { d: "M6 2.5v11" }),
    );
  };

  const Switch = ({ checked, onChange, onCheckedChange, disabled, className }: any) =>
    React.createElement("input", {
      type: "checkbox",
      checked: Boolean(checked),
      disabled: Boolean(disabled),
      className,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(e.target.checked);
        onCheckedChange?.(e.target.checked);
      },
    });

  const DisclosureRow = ({ label, children, defaultOpen = false }: any) =>
    React.createElement(
      "details",
      { open: defaultOpen },
      React.createElement("summary", { style: { cursor: "pointer" } }, label),
      children,
    );

  const Menu = ({ children }: any) => React.createElement("div", null, children);
  const Toast = ({ children }: any) => React.createElement("div", null, children);

  const iconCache = new Map<string, React.ComponentType<any>>();
  const getFallbackComponent = (propName: string): React.ComponentType<any> => {
    const cached = iconCache.get(propName);
    if (cached) return cached;
    const isButtonLike = /Button|Action|Trigger/i.test(propName) && !propName.startsWith("Icon");
    const FallbackComp: React.ComponentType<any> = (props: any) => {
      if (isButtonLike) {
        const { children, ...rest } = props ?? {};
        return React.createElement("button", { type: "button", ...rest }, children);
      }
      const { children, size, className, style, title, onClick } = props ?? {};
      if (propName.startsWith("Icon")) {
        const dim = typeof size === "number" ? size : 14;
        return React.createElement(
          "span",
          {
            className,
            title,
            onClick,
            "aria-hidden": true,
            style: {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: dim,
              height: dim,
              ...style,
            },
          },
          children ?? null,
        );
      }
      return React.createElement("span", { className, title, onClick, style }, children);
    };
    FallbackComp.displayName = `DshPrimitive(${propName})`;
    iconCache.set(propName, FallbackComp);
    return FallbackComp;
  };

  const basePrimitives: Record<string, any> = {
    __esModule: true,
    Tooltip,
    IconPanelLeftOutlineRegular,
    Switch,
    DisclosureRow,
    Menu,
    Toast,
  };

  const fallbackProto = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        if (prop in basePrimitives) return basePrimitives[prop];
        if (prop === "default") return proxyModule;
        if (prop === "then" || prop === "__esModule") return basePrimitives[prop];
        return getFallbackComponent(prop);
      },
    },
  );

  Object.setPrototypeOf(basePrimitives, fallbackProto);

  const proxyModule: Record<string, any> = new Proxy(basePrimitives, {
    get(target, prop) {
      if (typeof prop !== "string") return Reflect.get(target, prop);
      if (prop === "default") return proxyModule;
      if (prop in target) return target[prop];
      return getFallbackComponent(prop);
    },
    has(_target, prop) {
      return typeof prop === "string";
    },
  });

  basePrimitives.default = proxyModule;
  return proxyModule;
}

const uiPrimitivesShim = createUiPrimitivesShim();

function createSafeDeepseekProxy(modName: string): any {
  const fn = () => createSafeDeepseekProxy(modName);
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === "__esModule") return true;
      if (prop === "default") return createSafeDeepseekProxy(modName);
      if (prop === "then" || typeof prop === "symbol") return undefined;
      return ({ children }: any = {}) =>
        React.createElement("span", { "data-dsh-shim": `${modName}:${String(prop)}` }, children);
    },
    apply() {
      return null;
    },
  });
}

function createPluginSandboxRequire(): (modName: string) => any {
  const reactMod = Object.assign({}, React, { default: React, __esModule: true });
  const reactDomMod = Object.assign({}, ReactDOM, { default: ReactDOM, __esModule: true });
  const reactDomClientMod = Object.assign({}, ReactDOMClient, {
    default: ReactDOMClient,
    __esModule: true,
  });
  const jsxRuntimeMod = Object.assign({}, jsxRuntime, {
    default: jsxRuntime,
    __esModule: true,
  });

  return function sandboxRequire(modName: string): any {
    switch (modName) {
      case "react":
        return reactMod;
      case "react-dom":
        return reactDomMod;
      case "react-dom/client":
        return reactDomClientMod;
      case "react/jsx-runtime":
      case "react/jsx-dev-runtime":
        return jsxRuntimeMod;
      case "@deepseek-ai/dsh-client-ui-primitives":
        return uiPrimitivesShim;
      default:
        if (modName.startsWith("@deepseek-ai/")) {
          return createSafeDeepseekProxy(modName);
        }
        console.warn(`[dsh-plugin-client] Unknown module required by plugin: "${modName}"`);
        return createSafeDeepseekProxy(modName);
    }
  };
}

function rewritePluginRpcUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return rawUrl;

  if (trimmed.startsWith("/api/dsh-plugins/") || trimmed.startsWith("api/dsh-plugins/")) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }

  if (trimmed.startsWith("/api/") || trimmed.startsWith("/dsh-")) {
    return `/api/dsh-plugins/rpc${trimmed}`;
  }

  if (trimmed.startsWith("api/") || trimmed.startsWith("dsh-")) {
    return `/api/dsh-plugins/rpc/${trimmed}`;
  }

  if (typeof window !== "undefined" && (trimmed.startsWith("http://") || trimmed.startsWith("https://"))) {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.origin === window.location.origin &&
        !parsed.pathname.startsWith("/api/dsh-plugins/") &&
        (parsed.pathname.startsWith("/api/") || parsed.pathname.startsWith("/dsh-"))
      ) {
        return `/api/dsh-plugins/rpc${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  return rawUrl;
}

function createPluginSandboxFetch(): typeof fetch {
  return function sandboxFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (typeof input === "string") {
      return window.fetch(rewritePluginRpcUrl(input), init);
    }
    if (input instanceof URL) {
      return window.fetch(rewritePluginRpcUrl(input.toString()), init);
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      const rewritten = rewritePluginRpcUrl(input.url);
      if (rewritten !== input.url) {
        return window.fetch(new Request(rewritten, input), init);
      }
    }
    return window.fetch(input, init);
  };
}

class EffectScope {
  readonly pluginId: string;
  private cleanups: Array<() => void> = [];
  private disposed = false;

  constructor(pluginId: string) {
    this.pluginId = pluginId;
  }

  addCleanup(cleanup: unknown): void {
    if (!cleanup) return;
    if (typeof cleanup === "function") {
      if (this.disposed) {
        try {
          cleanup();
        } catch {
          // ignore
        }
        return;
      }
      this.cleanups.push(cleanup as () => void);
      return;
    }
    if (typeof (cleanup as any)[Symbol.iterator] === "function") {
      try {
        for (const item of cleanup as Iterable<unknown>) {
          if (typeof item === "function") {
            this.addCleanup(item);
          }
        }
      } catch (err) {
        console.error(`[dsh-plugin-client] Error iterating effect generator (${this.pluginId}):`, err);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const toRun = this.cleanups.splice(0, this.cleanups.length).reverse();
    for (const fn of toRun) {
      try {
        fn();
      } catch (err) {
        console.error(`[dsh-plugin-client] Cleanup error for ${this.pluginId}:`, err);
      }
    }
    removeSlotsForPlugin(this.pluginId);
    if (typeof document !== "undefined") {
      const leftoverStyles = document.querySelectorAll(
        `style[data-plugin="${this.pluginId}"], style[data-plugin="${this.pluginId}-ui"]`,
      );
      leftoverStyles.forEach((el) => el.remove());
    }
  }
}

const activePluginScopes = new Map<string, EffectScope>();
const loadingPlugins = new Map<string, Promise<boolean>>();
const localeDictionaries = new Map<string, Record<string, Record<string, string>>>();
const themeTokenLayers = new Map<string, Record<string, { light?: string; dark?: string }>>();

const DSH_HOST_TOKENS_STYLE_ID = "dsh-host-theme-tokens";
const DSH_HOST_TOKENS_CSS = `
:root {
  --dsw-radius-xs: 6px;
  --dsw-radius-sm: 8px;
  --dsw-radius-md: 10px;
  --dsw-radius-lg: 14px;
  --dsw-radius-xl: 18px;
  --dsw-radius-panel: 14px;
  --dsw-focus-ring-width: 2px;
  --dsw-focus-ring-color: var(--accent, #2563eb);
  --dsw-elevation-prominent: 0 12px 32px rgba(0, 0, 0, 0.18);
  --dsw-elevation-panel: 0 8px 24px rgba(0, 0, 0, 0.12);
  --ds-font-family-code: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  --dsw-font-mono: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  --dsw-font-family: var(--plus-font-ui, inherit);

  --dsw-alias-bg-base: var(--bg, #ffffff);
  --dsw-alias-bg-layer-1: var(--bg, #ffffff);
  --dsw-alias-bg-layer-2: var(--bg, #ffffff);
  --dsw-alias-bg-layer-3: var(--bg-panel, #f5f5f5);
  --dsw-alias-bg-overlay: var(--bg, #ffffff);
  --dsw-alias-bg-module-platform: var(--bg-panel, #f4f4f5);
  --dsw-alias-bg-mask-1: rgba(0, 0, 0, 0.48);
  --dsw-alias-bg-mask-3: rgba(0, 0, 0, 0.65);
  --dsw-alias-bg-mask-drop: rgba(0, 0, 0, 0.35);
  --dsw-specific-input-major: var(--bg, #ffffff);

  --dsw-alias-border-l1: color-mix(in srgb, var(--border, #e0e0e0) 65%, transparent);
  --dsw-alias-border-l2: var(--border, #e0e0e0);
  --dsw-alias-border-l3: color-mix(in srgb, var(--border, #d4d4d8) 85%, var(--text, #1a1a1a) 15%);
  --dsw-alias-border-l4: color-mix(in srgb, var(--border, #d4d4d8) 70%, var(--text, #1a1a1a) 30%);

  --dsw-alias-label-primary: var(--text, #1a1a1a);
  --dsw-alias-label-secondary: var(--text-muted, #515c6b);
  --dsw-alias-label-tertiary: var(--text-dim, #6b7280);
  --dsw-alias-label-caption: var(--text-dim, #6b7280);
  --dsw-alias-label-primary-foreground: var(--accent-contrast, #ffffff);

  --dsw-alias-brand-primary: var(--accent, #c44d36);
  --dsw-alias-brand-text: var(--accent, #c44d36);
  --dsw-alias-button-primary-fill: var(--accent, #c44d36);
  --dsw-alias-button-primary-hover: var(--accent-hover, color-mix(in srgb, var(--accent, #c44d36) 88%, #000));
  --dsw-alias-switch-thumb: #ffffff;

  --dsw-alias-interactive-bg-hover: var(--bg-hover, rgba(0, 0, 0, 0.05));
  --dsw-alias-interactive-bg-active: var(--bg-selected, rgba(0, 0, 0, 0.09));
  --dsw-alias-interactive-bg-hover-danger: rgba(220, 38, 38, 0.1);

  --dsw-alias-state-business-primary: var(--accent, #2563eb);
  --dsw-alias-state-business-tertiary: color-mix(in srgb, var(--accent, #2563eb) 12%, transparent);
  --dsw-alias-state-success-primary: #16a34a;
  --dsw-alias-state-success-tertiary: rgba(22, 163, 74, 0.12);
  --dsw-alias-state-warn-primary: #d97706;
  --dsw-alias-state-warn-label: #b45309;
  --dsw-alias-state-warn-secondary: rgba(217, 119, 6, 0.35);
  --dsw-alias-state-warn-tertiary: rgba(217, 119, 6, 0.12);
  --dsw-alias-state-error-primary: #dc2626;
  --dsw-alias-state-error-secondary: rgba(220, 38, 38, 0.35);
  --dsw-alias-markdown-code-block: var(--tool-bg, #f9fafb);
}
html[data-dsh-claude-mascot="0"] .plus-composer-crab {
  display: none !important;
}
`;

function ensureDshHostThemeTokens(): void {
  if (typeof document === "undefined" || !document.head) return;
  if (document.getElementById(DSH_HOST_TOKENS_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = DSH_HOST_TOKENS_STYLE_ID;
  style.textContent = DSH_HOST_TOKENS_CSS;
  document.head.appendChild(style);
}

function syncThemeTokenOverrides(): void {
  if (typeof document === "undefined" || !document.body) return;
  const isDark =
    document.documentElement.dataset.theme === "dark" ||
    document.documentElement.classList.contains("dark") ||
    document.body.hasAttribute("data-ds-dark-theme");
  for (const tokens of themeTokenLayers.values()) {
    for (const [tokenName, pair] of Object.entries(tokens)) {
      const val = isDark ? pair?.dark ?? pair?.light : pair?.light ?? pair?.dark;
      if (typeof val === "string") {
        document.body.style.setProperty(tokenName, val);
      }
    }
  }
}

function createPluginClientContext(
  pluginId: string,
  scope: EffectScope,
  initialConfig?: Record<string, unknown>,
): Record<string, any> {
  // Ensure the plugin's configForm is initialized with initialConfig
  getOrCreateConfigForm(pluginId, initialConfig);

  const slotsService = {
    inject(slotName: string, fn: () => unknown) {
      try {
        const cleanup = fn();
        scope.addCleanup(cleanup);
        return typeof cleanup === "function" ? cleanup : () => {};
      } catch (err) {
        console.error(`[dsh-plugin-client] slots.inject("${slotName}") failed for ${pluginId}:`, err);
        return () => {};
      }
    },
    register(options: Record<string, any>, Component: React.ComponentType<any>) {
      const unregister = registerPluginSlot(pluginId, options, Component);
      scope.addCleanup(unregister);
      return unregister;
    },
  };

  const configFormsService = {
    get(entryId: string) {
      void entryId;
      return getOrCreateConfigForm(pluginId, initialConfig);
    },
    describe() {
      const snapshot = { status: "ready" as const, entries: [] };
      return {
        subscribe: () => () => {},
        getSnapshot: () => snapshot,
      };
    },
    whileServed(_namespaces: string[], fn: () => unknown) {
      const cleanup = fn();
      scope.addCleanup(cleanup);
      return typeof cleanup === "function" ? cleanup : () => {};
    },
    developerTools: {
      enabled: {
        subscribe: () => () => {},
        getSnapshot: () => false,
      },
      setEnabled: async () => {},
    },
  };

  const localeService = {
    register(namespace: string, messages: Record<string, Record<string, string>>) {
      localeDictionaries.set(namespace, messages);
      const cleanup = () => {
        localeDictionaries.delete(namespace);
      };
      scope.addCleanup(cleanup);
      return cleanup;
    },
    bind(namespace: string) {
      return (key: string, params?: Record<string, unknown>): string => {
        const dict = localeDictionaries.get(namespace);
        const lang =
          typeof document !== "undefined" && /^en/i.test(document.documentElement.lang)
            ? "en"
            : "zh";
        const table = dict?.[lang] ?? dict?.zh ?? dict?.en ?? {};
        let template = table[key] ?? key;
        if (params && typeof params === "object") {
          for (const [k, v] of Object.entries(params)) {
            template = template.replaceAll(`{${k}}`, String(v ?? ""));
          }
        }
        return template;
      };
    },
    getLocale() {
      const active =
        typeof document !== "undefined" && /^en/i.test(document.documentElement.lang)
          ? "en"
          : "zh";
      return { active, preference: active };
    },
    subscribe() {
      return () => {};
    },
  };

  const themeService = {
    overrideTokens(sourceId: string, tokens: Record<string, { light?: string; dark?: string }>) {
      const layerKey = `${pluginId}:${sourceId}`;
      themeTokenLayers.set(layerKey, tokens ?? {});
      syncThemeTokenOverrides();
      const cleanup = () => {
        const existing = themeTokenLayers.get(layerKey);
        if (existing && typeof document !== "undefined" && document.body) {
          for (const tokenName of Object.keys(existing)) {
            document.body.style.removeProperty(tokenName);
          }
        }
        themeTokenLayers.delete(layerKey);
        syncThemeTokenOverrides();
      };
      scope.addCleanup(cleanup);
      return cleanup;
    },
  };

  const ctx: Record<string, any> = {
    effect(fn: () => unknown, label?: string) {
      void label;
      try {
        const cleanup = fn();
        scope.addCleanup(cleanup);
        return cleanup;
      } catch (err) {
        console.error(`[dsh-plugin-client] ctx.effect failed in ${pluginId}:`, err);
        return () => {};
      }
    },
    inject(_deps: string[] | Record<string, unknown>, fn: (scopedCtx: any) => unknown) {
      try {
        const cleanup = fn(ctx);
        scope.addCleanup(cleanup);
        return cleanup;
      } catch (err) {
        console.error(`[dsh-plugin-client] ctx.inject failed in ${pluginId}:`, err);
        return () => {};
      }
    },
    configForms: configFormsService,
    slots: slotsService,
    locale: localeService,
    theme: themeService,
    settingsScope: {
      slots: slotsService,
    },
    get(serviceName: string) {
      return ctx[serviceName];
    },
    on() {
      return () => {};
    },
  };

  return ctx;
}

function evaluateDshClientBundle(pluginId: string, rawCode: string): Record<string, any> | null {
  const customRequire = createPluginSandboxRequire();
  const customFetch = createPluginSandboxFetch();
  const cjsModule: { exports: Record<string, any> } = { exports: {} };
  let capturedModuleExports: Record<string, any> | null = null;

  const customDefine: any = (...args: any[]) => {
    let deps: string[] = ["require", "exports", "module"];
    let factory: any;

    if (args.length === 1) {
      factory = args[0];
    } else if (args.length === 2) {
      if (Array.isArray(args[0])) {
        deps = args[0];
      }
      factory = args[1];
    } else if (args.length >= 3) {
      if (Array.isArray(args[1])) {
        deps = args[1];
      }
      factory = args[2];
    }

    if (typeof factory === "function") {
      const resolvedDeps = deps.map((dep) => {
        if (dep === "require") return customRequire;
        if (dep === "exports") return cjsModule.exports;
        if (dep === "module") return cjsModule;
        return customRequire(dep);
      });
      const ret = factory(...resolvedDeps);
      if (ret !== undefined) {
        cjsModule.exports = ret;
        capturedModuleExports = ret;
      } else {
        capturedModuleExports = cjsModule.exports;
      }
    } else if (factory && typeof factory === "object") {
      cjsModule.exports = factory;
      capturedModuleExports = factory;
    }
  };
  customDefine.amd = true;

  // Support DSH's `window.__ModuleLoader__.load({ id, factory })` bundle wrapper as well
  const win = typeof window !== "undefined" ? (window as any) : undefined;
  const prevLoader = win?.__ModuleLoader__;
  const loaderShim = {
    load(descriptor: { id?: string; factory?: (req: any, exp?: any, mod?: any) => any }) {
      if (descriptor && typeof descriptor.factory === "function") {
        const ret = descriptor.factory(customRequire, cjsModule.exports, cjsModule);
        if (ret !== undefined) {
          cjsModule.exports = ret;
          capturedModuleExports = ret;
        } else {
          capturedModuleExports = cjsModule.exports;
        }
      }
      if (prevLoader && typeof prevLoader.load === "function" && prevLoader !== loaderShim) {
        try {
          prevLoader.load(descriptor);
        } catch {
          // ignore host loader errors
        }
      }
    },
  };

  if (win) {
    win.__ModuleLoader__ = loaderShim;
  }

  // Rewrite hardcoded image route base for dsh-image-studio so <img> tags also route via /api/dsh-plugins/rpc
  const preparedCode = rawCode.replace(
    /ROUTE_BASE\s*=\s*(["'])api\/dsh-image-studio\.\1/g,
    'ROUTE_BASE = "/api/dsh-plugins/rpc/api/dsh-image-studio."',
  );

  try {
    const evaluator = new Function(
      "define",
      "require",
      "module",
      "exports",
      "fetch",
      preparedCode,
    );
    evaluator(customDefine, customRequire, cjsModule, cjsModule.exports, customFetch);
  } finally {
    if (win && prevLoader !== undefined) {
      win.__ModuleLoader__ = prevLoader;
    }
  }

  const exported = capturedModuleExports ?? cjsModule.exports;
  if (exported && typeof exported === "object") {
    return exported;
  }
  return null;
}

export function disposeDshClientPlugin(pluginId: string): void {
  const scope = activePluginScopes.get(pluginId);
  if (scope) {
    activePluginScopes.delete(pluginId);
    scope.dispose();
  } else {
    removeSlotsForPlugin(pluginId);
  }
}

export async function loadDshClientPlugin(
  pluginInput: DshClientPluginInfo | string,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  ensureDshHostThemeTokens();

  const pluginInfo: DshClientPluginInfo =
    typeof pluginInput === "string"
      ? { id: pluginInput, enabled: true, hasClientEntry: true }
      : pluginInput;

  const pluginId = pluginInfo.id;
  if (!pluginId || SKIPPED_CLIENT_PLUGINS.has(pluginId)) {
    return false;
  }

  if (activePluginScopes.has(pluginId)) {
    if (pluginInfo.config) {
      getOrCreateConfigForm(pluginId, pluginInfo.config);
    }
    return true;
  }

  const inflight = loadingPlugins.get(pluginId);
  if (inflight) {
    return inflight;
  }

  const task = (async (): Promise<boolean> => {
    try {
      const response = await window.fetch(
        `/api/dsh-plugins/client/${encodeURIComponent(pluginId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        console.warn(
          `[dsh-plugin-client] Failed to fetch client bundle for "${pluginId}" (HTTP ${response.status})`,
        );
        return false;
      }

      const code = await response.text();
      if (!code.trim()) {
        return false;
      }

      const exported = evaluateDshClientBundle(pluginId, code);
      const applyFn =
        typeof exported?.apply === "function"
          ? exported.apply
          : typeof exported?.default?.apply === "function"
            ? exported.default.apply
            : typeof exported?.default === "function"
              ? exported.default
              : null;

      if (!applyFn) {
        console.warn(`[dsh-plugin-client] Bundle "${pluginId}" did not export an apply(ctx) function`);
        return false;
      }

      // Dispose any previous scope before mounting fresh
      disposeDshClientPlugin(pluginId);

      const scope = new EffectScope(pluginId);
      activePluginScopes.set(pluginId, scope);
      const ctx = createPluginClientContext(pluginId, scope, pluginInfo.config);

      applyFn(ctx);
      return true;
    } catch (err) {
      console.error(`[dsh-plugin-client] Error loading client plugin "${pluginId}":`, err);
      disposeDshClientPlugin(pluginId);
      return false;
    } finally {
      loadingPlugins.delete(pluginId);
    }
  })();

  loadingPlugins.set(pluginId, task);
  return task;
}

// ---------------------------------------------------------------------------
// 4. Host Sync Hook (`useDshPluginClientRuntime()`) & Hot-Reload Helper
// ---------------------------------------------------------------------------

export function notifyDshPluginsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DSH_PLUGINS_CHANGED_EVENT));
}

export function useDshPluginClientRuntime(): {
  loadedPluginIds: string[];
  refresh: () => Promise<void>;
} {
  const [loadedPluginIds, setLoadedPluginIds] = React.useState<string[]>(() =>
    Array.from(activePluginScopes.keys()),
  );
  const prevClaudeEnabledRef = React.useRef<boolean | null>(null);

  const syncPlugins = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    ensureDshHostThemeTokens();
    try {
      const response = await window.fetch("/api/dsh-plugins", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const rawList: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.plugins)
          ? data.plugins
          : [];
      const list: DshPluginInfo[] = rawList.filter(
        (item): item is DshPluginInfo => Boolean(item && typeof item === "object"),
      );

      const claudePlugin = list.find((p) => p.id === "dsh-claude-style");
      const isClaudeEnabled = Boolean(claudePlugin?.enabled);
      syncClaudeStyleMode(isClaudeEnabled, prevClaudeEnabledRef.current);
      prevClaudeEnabledRef.current = isClaudeEnabled;

      removeSlotsForPlugin("dsh-claude-style");
      if (isClaudeEnabled) {
        registerPluginSlot(
          "dsh-claude-style",
          {
            name: "plugins.item",
            id: "dsh-claude-style:settings",
            order: 10,
            label: "Claude Code Desktop",
          },
          DshClaudeStyleConfigPanel,
        );
      }

      const desiredClientPlugins = new Map<string, DshClientPluginInfo>();

      for (const item of rawList) {
        if (!item || typeof item !== "object") continue;
        const id = typeof item.id === "string" ? item.id : typeof item.name === "string" ? item.name : "";
        if (!id || SKIPPED_CLIENT_PLUGINS.has(id)) continue;

        const enabled = typeof item.enabled === "boolean" ? item.enabled : !item.disabled;
        const hasClientEntry = Boolean(item.hasClientEntry ?? item.clientEntry);
        const config =
          item.config && typeof item.config === "object" && !Array.isArray(item.config)
            ? (item.config as Record<string, unknown>)
            : undefined;

        if (config) {
          getOrCreateConfigForm(id, config);
        }

        if (enabled && hasClientEntry) {
          desiredClientPlugins.set(id, {
            id,
            name: item.name,
            version: item.version,
            description: item.description,
            enabled: true,
            hasClientEntry: true,
            hasHostEntry: Boolean(item.hasHostEntry),
            config,
            slots: Array.isArray(item.slots) ? item.slots : undefined,
          });
        }
      }

      // Dispose any currently active plugin that is no longer enabled
      for (const activeId of Array.from(activePluginScopes.keys())) {
        if (!desiredClientPlugins.has(activeId)) {
          disposeDshClientPlugin(activeId);
        }
      }

      // Load all enabled client plugins
      await Promise.all(
        Array.from(desiredClientPlugins.values()).map((plugin) => loadDshClientPlugin(plugin)),
      );

      setLoadedPluginIds(Array.from(activePluginScopes.keys()));
    } catch (err) {
      console.error("[dsh-plugin-client] Failed to sync DSH plugins:", err);
    }
  }, []);

  React.useEffect(() => {
    void syncPlugins();

    const handlePluginsChanged = () => {
      void syncPlugins();
    };
    window.addEventListener(DSH_PLUGINS_CHANGED_EVENT, handlePluginsChanged);
    return () => {
      window.removeEventListener(DSH_PLUGINS_CHANGED_EVENT, handlePluginsChanged);
    };
  }, [syncPlugins]);

  return {
    loadedPluginIds,
    refresh: syncPlugins,
  };
}
