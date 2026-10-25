"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BASE_THEME,
  compileUserThemeCss,
  deriveSyntax,
  SYNTAX_KEYS,
  type SyntaxKey,
  type ThemeDefinition,
  type ThemePalette,
} from "@/lib/plus-theme-catalog";
import { FONT_FALLBACKS, fontStack, setUserThemeCss } from "@/lib/plus-theme";
import { FontPicker } from "./FontPicker";
import { THEME_PREVIEW_ATTR } from "./PlusAppearanceRuntime";

type Translate = (key: string, params?: Record<string, string | number>) => string;

// Plus 1.9: a theme's fonts stack on the base's; an unset size or leading is the base's.
const BASE_SIZE = BASE_THEME.typography?.readingSize ?? 14;
const BASE_LEADING = BASE_THEME.typography?.readingLeading ?? 1.7;
type Mode = "light" | "dark";
type PaletteKey = Exclude<keyof ThemePalette, "syntax">;

/** Palette fields shown in the editor, grouped. */
const GROUPS: ReadonlyArray<{ id: string; keys: readonly PaletteKey[] }> = [
  { id: "surfaces", keys: ["bg", "panel", "workbench", "surface", "user", "border"] },
  { id: "text", keys: ["text", "muted", "dim"] },
  { id: "accent", keys: ["accent", "accentText", "fill", "fillText", "marker"] },
  { id: "code", keys: ["code", "codeHeader", "codeText", "inlineCode", "inlineCodeBg"] },
  { id: "status", keys: ["danger", "success", "warning"] },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Hex shown for a field the palette leaves to derivation. */
function fallbackColour(p: ThemePalette, key: PaletteKey, mode: Mode): string {
  const dark = mode === "dark";
  switch (key) {
    case "accentText": return dark ? p.workbench : "#ffffff";
    case "fill": return p.accent;
    case "fillText": return p.fill ? "#ffffff" : (p.accentText ?? (dark ? p.workbench : "#ffffff"));
    case "marker": return p.accent;
    case "codeHeader": return p.code;
    case "codeText": return p.text;
    case "inlineCodeBg": return p.code;
    case "danger": return dark ? "#ff6961" : "#d92d20";
    case "success": return dark ? "#30d158" : "#248a3d";
    case "warning": return dark ? "#ffd60a" : "#b87503";
    default: return "#000000";
  }
}

function toHex(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (HEX.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v.slice(1).split("").map((c) => c + c).join("")}`.toLowerCase();
  return null;
}

/** The font names a stored family list starts with (for the picker). */
function pickerValue(stack: string | undefined): string {
  if (!stack) return "";
  let s = stack;
  for (const tail of Object.values(FONT_FALLBACKS)) {
    if (s.endsWith(`, ${tail}`)) s = s.slice(0, -tail.length - 2);
  }
  return s.replace(/"/g, "");
}

function ColourField({ label, value, derived, onChange, onReset }: {
  label: string;
  value: string;
  derived: boolean;
  onChange: (value: string) => void;
  onReset?: () => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className={`plus-palette-field${derived ? " is-derived" : ""}`}>
      <input type="color" value={toHex(value) ?? "#000000"} onChange={(event) => onChange(event.target.value)} aria-label={label} />
      <span className="plus-palette-field-text">
        <span className="plus-palette-field-label">{label}</span>
        <input
          className="plus-palette-field-hex"
          value={text}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            const hex = toHex(event.target.value);
            if (hex) onChange(hex);
          }}
          onBlur={() => setText(value)}
        />
      </span>
      {onReset && !derived && (
        <button type="button" className="plus-palette-field-reset" onClick={(event) => { event.preventDefault(); onReset(); }} title="↺" aria-label="reset">↺</button>
      )}
    </label>
  );
}

export interface PaletteThemeEditorProps {
  t: Translate;
  id: string;
  name: string;
  definition: ThemeDefinition;
  css: string;
  onSave: (input: { name: string; definition: ThemeDefinition; css: string; compiled: string }) => Promise<void>;
  onClose: () => void;
}

/**
 * Plus: palette editor for a custom theme. Every change previews live on the
 * whole window (both modes can be previewed); the theme's extra CSS goes
 * after the generated tokens.
 */
export function PaletteThemeEditor({ t, id, name: initialName, definition: initialDefinition, css: initialCss, onSave, onClose }: PaletteThemeEditorProps) {
  const [name, setName] = useState(initialName);
  const [def, setDef] = useState<ThemeDefinition>(initialDefinition);
  const [css, setCss] = useState(initialCss);
  const [mode, setMode] = useState<Mode>(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  const [section, setSection] = useState<"colours" | "syntax" | "type" | "css">("colours");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(JSON.stringify({ initialName, initialDefinition, initialCss }));
  const originalDark = useRef(document.documentElement.classList.contains("dark"));

  const compiled = useMemo(() => compileUserThemeCss(def, css), [def, css]);
  const dirty = JSON.stringify({ initialName: name, initialDefinition: def, initialCss: css }) !== savedRef.current;

  // Live preview of the compiled theme on the whole window.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset[THEME_PREVIEW_ATTR] = "";
    root.dataset.plusStyle = "clean";
    const timer = window.setTimeout(() => setUserThemeCss(compiled), 60);
    return () => window.clearTimeout(timer);
  }, [compiled]);

  // Preview the mode being edited; restore the real mode on close.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, [mode]);
  useEffect(() => {
    const dark = originalDark.current;
    return () => { document.documentElement.classList.toggle("dark", dark); };
  }, []);

  const palette = (def[mode] ?? def.light ?? def.dark)!;
  const setPalette = (next: ThemePalette) => setDef((current) => ({ ...current, [mode]: next }));
  const setColour = (key: PaletteKey, value: string | undefined) => {
    const next = { ...palette } as Record<string, unknown>;
    if (value === undefined) delete next[key];
    else next[key] = value;
    setPalette(next as unknown as ThemePalette);
  };
  const syntax = deriveSyntax(palette, mode === "dark");
  const setSyntax = (key: SyntaxKey, value: string) => setPalette({ ...palette, syntax: { ...syntax, ...palette.syntax, [key]: value } });

  const typography = def.typography ?? {};
  const setTypography = (patch: Partial<NonNullable<ThemeDefinition["typography"]>>) => {
    const next = { ...typography, ...patch };
    for (const key of Object.keys(next) as Array<keyof typeof next>) {
      if (next[key] === undefined || next[key] === "" || next[key] === false) delete next[key];
    }
    setDef((current) => ({ ...current, typography: Object.keys(next).length ? next : undefined }));
  };

  const save = async () => {
    setStatus("saving");
    setError(null);
    try {
      await onSave({ name, definition: def, css, compiled });
      savedRef.current = JSON.stringify({ initialName: name, initialDefinition: def, initialCss: css });
      setStatus("saved");
      window.setTimeout(() => setStatus((value) => (value === "saved" ? "idle" : value)), 1600);
    } catch (saveError) {
      setStatus("error");
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const otherMode: Mode = mode === "light" ? "dark" : "light";

  return (
    <div className="plus-theme-editor" data-theme-id={id}>
      <div className="plus-theme-editor-head">
        <input className="plus-theme-name-input" value={name} aria-label={t("plus.themeName")} onChange={(event) => setName(event.target.value)} />
        <div className="settings-choice-group" role="radiogroup" aria-label={t("plus.editorMode")}>
          {(["light", "dark"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              className={`config-button config-button-small ${mode === value ? "config-button-primary" : "config-button-secondary"}`}
              onClick={() => setMode(value)}
            >
              {t(value === "light" ? "plus.editorLight" : "plus.editorDark")}
            </button>
          ))}
        </div>
      </div>

      <div className="plus-theme-editor-tabs" role="tablist">
        {(["colours", "syntax", "type", "css"] as const).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={section === value} className={section === value ? "is-active" : ""} onClick={() => setSection(value)}>
            {t(`plus.editorTab.${value}`)}
          </button>
        ))}
      </div>

      {section === "colours" && (
        <div className="plus-palette">
          {GROUPS.map((group) => (
            <div key={group.id} className="plus-palette-group">
              <div className="plus-palette-group-title">{t(`plus.paletteGroup.${group.id}`)}</div>
              <div className="plus-palette-grid">
                {group.keys.map((key) => {
                  const own = palette[key] as string | undefined;
                  const required = ["bg", "panel", "workbench", "surface", "text", "muted", "dim", "accent", "border", "user", "code", "inlineCode"].includes(key);
                  return (
                    <ColourField
                      key={key}
                      label={t(`plus.palette.${key}`)}
                      value={own ?? fallbackColour(palette, key, mode)}
                      derived={!required && own === undefined}
                      onChange={(value) => setColour(key, value)}
                      onReset={required ? undefined : () => setColour(key, undefined)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          <div className="plus-palette-actions">
            <button type="button" className="config-button config-button-small config-button-secondary" onClick={() => setDef((current) => ({ ...current, [otherMode]: JSON.parse(JSON.stringify(palette)) }))}>
              {t(mode === "light" ? "plus.copyToDark" : "plus.copyToLight")}
            </button>
          </div>
        </div>
      )}

      {section === "syntax" && (
        <div className="plus-palette">
          <div className="plus-palette-grid">
            {SYNTAX_KEYS.map((key) => (
              <ColourField key={key} label={t(`plus.syntax.${key}`)} value={toHex(syntax[key]) ?? syntax[key]} derived={false} onChange={(value) => setSyntax(key, value)} />
            ))}
          </div>
          <pre className="plus-syntax-sample" aria-hidden="true">
            <span style={{ color: syntax.comment, fontStyle: "italic" }}>{"// "}{t("plus.syntaxSample")}</span>{"\n"}
            <span style={{ color: syntax.keyword }}>export async function</span> <span style={{ color: syntax.function }}>load</span>
            <span style={{ color: syntax.punctuation }}>(</span><span style={{ color: syntax.variable }}>id</span><span style={{ color: syntax.operator }}>:</span> <span style={{ color: syntax.class }}>string</span><span style={{ color: syntax.punctuation }}>) {"{"}</span>{"\n"}
            {"  "}<span style={{ color: syntax.keyword }}>const</span> <span style={{ color: syntax.variable }}>url</span> <span style={{ color: syntax.operator }}>=</span> <span style={{ color: syntax.string }}>{"\"/api/items/\""}</span> <span style={{ color: syntax.operator }}>+</span> <span style={{ color: syntax.variable }}>id</span><span style={{ color: syntax.punctuation }}>;</span>{"\n"}
            {"  "}<span style={{ color: syntax.keyword }}>return</span> <span style={{ color: syntax.function }}>fetch</span><span style={{ color: syntax.punctuation }}>(</span><span style={{ color: syntax.variable }}>url</span><span style={{ color: syntax.punctuation }}>, {"{"}</span> <span style={{ color: syntax.property }}>retries</span><span style={{ color: syntax.operator }}>:</span> <span style={{ color: syntax.number }}>3</span> <span style={{ color: syntax.punctuation }}>{"});"}</span>{"\n"}
            <span style={{ color: syntax.punctuation }}>{"}"}</span>
          </pre>
        </div>
      )}

      {section === "type" && (
        <div className="plus-palette">
          <div className="plus-appearance-row">
            <span><span>{t("plus.typeReading")}</span><span className="settings-option-hint">{t("plus.typeReadingHint")}</span></span>
            <FontPicker role="chat" label={t("plus.typeReading")} value={pickerValue(typography.reading)} onChange={(value) => setTypography({ reading: fontStack(value, "chat") ?? undefined })} />
          </div>
          <div className="plus-appearance-row">
            <span><span>{t("plus.typeHeading")}</span><span className="settings-option-hint">{t("plus.typeHeadingHint")}</span></span>
            <FontPicker role="chat" label={t("plus.typeHeading")} value={pickerValue(typography.heading)} onChange={(value) => setTypography({ heading: fontStack(value, "chat") ?? undefined })} />
          </div>
          <div className="plus-appearance-row">
            <span><span>{t("plus.typeSize")}</span></span>
            <span className="plus-range-value">
              <input type="range" min={12} max={18} step={0.5} value={typography.readingSize ?? BASE_SIZE} onChange={(event) => setTypography({ readingSize: Number(event.target.value) === BASE_SIZE ? undefined : Number(event.target.value) })} />
              <span>{typography.readingSize ?? BASE_SIZE}px</span>
            </span>
          </div>
          <div className="plus-appearance-row">
            <span><span>{t("plus.typeLeading")}</span></span>
            <span className="plus-range-value">
              <input type="range" min={1.4} max={2} step={0.02} value={typography.readingLeading ?? BASE_LEADING} onChange={(event) => setTypography({ readingLeading: Number(event.target.value) === BASE_LEADING ? undefined : Number(event.target.value) })} />
              <span>{(typography.readingLeading ?? BASE_LEADING).toFixed(2)}</span>
            </span>
          </div>
          <label className="plus-appearance-row plus-check-row">
            <span><span>{t("plus.typeThinkingItalic")}</span></span>
            <input type="checkbox" checked={typography.thinkingItalic === true} onChange={(event) => setTypography({ thinkingItalic: event.target.checked })} />
          </label>
        </div>
      )}

      {section === "css" && (
        <div className="plus-css-editor">
          <span className="settings-option-hint">{t("plus.editorCssHint")}</span>
          <textarea value={css} spellCheck={false} aria-label={t("plus.editorTab.css")} onChange={(event) => setCss(event.target.value)} />
        </div>
      )}

      <div className="plus-css-editor-actions">
        <span>
          {status === "saving" ? t("plus.cssSaving")
            : status === "saved" ? t("plus.cssSaved")
              : status === "error" ? (error ?? t("plus.cssError"))
                : dirty ? t("plus.cssPreviewing") : t("plus.editorHint")}
        </span>
        <span className="spacer" />
        <button type="button" className="config-button config-button-small config-button-secondary" onClick={onClose}>
          {dirty ? t("plus.cssDiscard") : t("plus.cssClose")}
        </button>
        <button type="button" className="config-button config-button-small config-button-primary" disabled={!dirty || status === "saving"} onClick={() => void save()}>
          {t("plus.cssSave")}
        </button>
      </div>
    </div>
  );
}
