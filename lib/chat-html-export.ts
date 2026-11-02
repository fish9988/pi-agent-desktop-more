/**
 * Plus: self-contained themed HTML export of a conversation transcript.
 *
 * Captures the active Plus theme's CSS variables (`--bg`, `--bg-panel`,
 * `--bg-subtle`, `--text`, `--text-muted`, `--text-dim`, `--border`,
 * `--accent`, `--accent-soft`, `--user-bg`, `--font-sans`, `--font-mono`,
 * `--plus-reading-font`, `--plus-bold-font`) so the exported HTML file looks
 * like the theme it was exported from, and renders thinking blocks and tool
 * calls + tool results inside interactive collapsible `<details>` blocks.
 */

import type {
  AgentMessage,
  AssistantContentBlock,
  AssistantMessage,
  BashExecutionMessage,
  CustomMessage,
  ToolCallContent,
  ToolResultMessage,
} from "./types";

export const EXPORTED_THEME_VARIABLES = [
  "--bg",
  "--bg-panel",
  "--bg-subtle",
  "--text",
  "--text-muted",
  "--text-dim",
  "--border",
  "--accent",
  "--accent-soft",
  "--user-bg",
  "--font-sans",
  "--font-mono",
  "--plus-reading-font",
  "--plus-bold-font",
] as const;

export type ExportThemeVariable = (typeof EXPORTED_THEME_VARIABLES)[number];

const DEFAULT_LIGHT_VARIABLES: Record<ExportThemeVariable, string> = {
  "--bg": "#f7f1de",
  "--bg-panel": "#efe7d2",
  "--bg-subtle": "#e7dec6",
  "--text": "#231f1a",
  "--text-muted": "#5c5449",
  "--text-dim": "#857b6d",
  "--border": "#d6ccb4",
  "--accent": "#c44d36",
  "--accent-soft": "rgba(196, 77, 54, 0.12)",
  "--user-bg": "#ece3cc",
  "--font-sans": "system-ui, -apple-system, sans-serif",
  "--font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  "--plus-reading-font": "system-ui, -apple-system, serif",
  "--plus-bold-font": "system-ui, -apple-system, serif",
};

const DEFAULT_DARK_VARIABLES: Record<ExportThemeVariable, string> = {
  "--bg": "#18181b",
  "--bg-panel": "#202024",
  "--bg-subtle": "#27272a",
  "--text": "#f4f4f5",
  "--text-muted": "#a1a1aa",
  "--text-dim": "#71717a",
  "--border": "#3f3f46",
  "--accent": "#e06c50",
  "--accent-soft": "rgba(224, 108, 80, 0.16)",
  "--user-bg": "#27272a",
  "--font-sans": "system-ui, -apple-system, sans-serif",
  "--font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  "--plus-reading-font": "system-ui, -apple-system, serif",
  "--plus-bold-font": "system-ui, -apple-system, serif",
};

export interface ChatHtmlExportOptions {
  title?: string | null;
  cwd?: string | null;
  messages: readonly AgentMessage[];
  toolResults?: ReadonlyMap<string, ToolResultMessage>;
  themeVariables?: Partial<Record<ExportThemeVariable, string>>;
  isDark?: boolean;
  locale?: string;
}

export function escapeExportHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

/** Read the active Plus theme variables from a document root when in the browser. */
export function readActiveThemeVariables(
  doc: Document | null = typeof document !== "undefined" ? document : null,
): { variables: Partial<Record<ExportThemeVariable, string>>; isDark: boolean } {
  const root = doc?.documentElement;
  const view = doc?.defaultView;
  if (!root || !view || typeof view.getComputedStyle !== "function") {
    return { variables: {}, isDark: false };
  }
  const computed = view.getComputedStyle(root);
  const variables: Partial<Record<ExportThemeVariable, string>> = {};
  for (const name of EXPORTED_THEME_VARIABLES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) variables[name] = value;
  }
  const isDark = root.classList?.contains("dark") ?? false;
  return { variables, isDark };
}

function buildToolResultsLookup(
  messages: readonly AgentMessage[],
  provided?: ReadonlyMap<string, ToolResultMessage>,
): Map<string, ToolResultMessage> {
  const map = new Map<string, ToolResultMessage>(provided);
  for (const message of messages) {
    if (message.role === "toolResult") {
      const result = message as ToolResultMessage;
      map.set(result.toolCallId, result);
    }
  }
  return map;
}

function formatToolResultText(result: ToolResultMessage | undefined): string {
  if (!result) return "";
  return (result.content ?? [])
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function renderToolCallDetails(
  block: ToolCallContent,
  result: ToolResultMessage | undefined,
  zh: boolean,
): string {
  const isError = Boolean(result?.isError);
  const statusBadge = result
    ? isError
      ? `<span class="tool-badge is-error">${zh ? "失败" : "Error"}</span>`
      : `<span class="tool-badge is-ok">${zh ? "完成" : "Done"}</span>`
    : "";
  const inputJson = block.rawInput ?? JSON.stringify(block.input ?? {}, null, 2);
  const outputText = formatToolResultText(result);
  return `<details class="export-tool${isError ? " is-error" : ""}">
  <summary class="export-tool-summary">
    <span class="export-tool-icon" aria-hidden="true">🔧</span>
    <code class="export-tool-name">${escapeExportHtml(block.toolName)}</code>
    ${statusBadge}
  </summary>
  <div class="export-tool-body">
    <div class="export-tool-section">
      <div class="export-tool-label">${zh ? "参数" : "Arguments"}</div>
      <pre class="export-pre">${escapeExportHtml(inputJson)}</pre>
    </div>${outputText ? `
    <div class="export-tool-section">
      <div class="export-tool-label">${zh ? "输出" : "Output"}</div>
      <pre class="export-pre">${escapeExportHtml(outputText)}</pre>
    </div>` : ""}
  </div>
</details>`;
}

function renderAssistantBlock(
  block: AssistantContentBlock,
  toolResults: ReadonlyMap<string, ToolResultMessage>,
  zh: boolean,
): string {
  if (block.type === "thinking") {
    const thinking = block.thinking?.trim();
    if (!thinking) return "";
    return `<details class="export-thinking">
  <summary class="export-thinking-summary">💭 ${zh ? "思考过程" : "Thinking"}</summary>
  <pre class="export-pre">${escapeExportHtml(thinking)}</pre>
</details>`;
  }
  if (block.type === "toolCall") {
    return renderToolCallDetails(block, toolResults.get(block.toolCallId), zh);
  }
  if (block.type === "text") {
    const text = block.text?.trim();
    if (!text) return "";
    return `<div class="export-text">${escapeExportHtml(text)}</div>`;
  }
  return "";
}

function renderMessageSection(
  message: AgentMessage,
  toolResults: ReadonlyMap<string, ToolResultMessage>,
  zh: boolean,
): string {
  if (message.role === "toolResult") return "";
  if (message.role === "user") {
    const text = typeof message.content === "string"
      ? message.content
      : message.content
          .filter((block): block is { type: "text"; text: string } => block.type === "text")
          .map((block) => block.text)
          .join("\n");
    return `<section class="msg user">
  <header class="msg-header">${zh ? "用户" : "User"}</header>
  <div class="msg-body">
    <div class="export-text">${escapeExportHtml(text)}</div>
  </div>
</section>`;
  }
  if (message.role === "assistant") {
    const assistant = message as AssistantMessage;
    const blocks = (assistant.content ?? [])
      .map((block) => renderAssistantBlock(block, toolResults, zh))
      .filter(Boolean)
      .join("\n");
    const errorNotice = assistant.stopReason === "error" && assistant.errorMessage
      ? `<div class="export-error" role="alert">${escapeExportHtml(assistant.errorMessage)}</div>`
      : "";
    if (!blocks && !errorNotice) return "";
    const modelLabel = assistant.model ? ` · ${escapeExportHtml(assistant.model)}` : "";
    return `<section class="msg assistant">
  <header class="msg-header">${zh ? "助手" : "Assistant"}${modelLabel}</header>
  <div class="msg-body">
    ${blocks}${errorNotice}
  </div>
</section>`;
  }
  if (message.role === "bashExecution") {
    const bash = message as BashExecutionMessage;
    return `<section class="msg bashExecution">
  <header class="msg-header">Shell</header>
  <div class="msg-body">
    <details class="export-tool" open>
      <summary class="export-tool-summary"><code class="export-tool-name">$ ${escapeExportHtml(bash.command)}</code></summary>
      <div class="export-tool-body"><pre class="export-pre">${escapeExportHtml(bash.output ?? "")}</pre></div>
    </details>
  </div>
</section>`;
  }
  if (message.role === "custom") {
    const custom = message as CustomMessage;
    const text = typeof custom.content === "string"
      ? custom.content
      : (custom.content ?? [])
          .filter((block): block is { type: "text"; text: string } => block.type === "text")
          .map((block) => block.text)
          .join("\n");
    return `<section class="msg custom">
  <header class="msg-header">${zh ? "摘要" : "Summary"}</header>
  <div class="msg-body">
    <details class="export-thinking">
      <summary class="export-thinking-summary">${escapeExportHtml(custom.customType || (zh ? "摘要" : "Summary"))}</summary>
      <pre class="export-pre">${escapeExportHtml(text)}</pre>
    </details>
  </div>
</section>`;
  }
  return "";
}

/** Build a self-contained HTML string with Plus theme variables and `<details>` tool blocks. */
export function buildChatHtmlExport(options: ChatHtmlExportOptions): string {
  const active = readActiveThemeVariables();
  const isDark = options.isDark ?? active.isDark;
  const defaults = isDark ? DEFAULT_DARK_VARIABLES : DEFAULT_LIGHT_VARIABLES;
  const merged: Record<ExportThemeVariable, string> = {
    ...defaults,
    ...active.variables,
    ...(options.themeVariables ?? {}),
  };
  const zh = (options.locale ?? "en").toLowerCase().startsWith("zh");
  const title = options.title?.trim() || (zh ? "对话导出" : "Conversation Export");
  const toolResults = buildToolResultsLookup(options.messages, options.toolResults);
  const cssVars = EXPORTED_THEME_VARIABLES
    .map((name) => `${name}:${merged[name]}`)
    .join(";");
  const sections = options.messages
    .map((message) => renderMessageSection(message, toolResults, zh))
    .filter(Boolean)
    .join("\n");
  const metaParts = [
    options.cwd ? escapeExportHtml(options.cwd) : null,
    `${options.messages.filter((m) => m.role !== "toolResult").length} ${zh ? "条消息" : "messages"}`,
  ].filter(Boolean).join(" · ");

  return `<!doctype html>
<html lang="${zh ? "zh-CN" : "en"}" class="${isDark ? "dark" : "light"}" data-plus-style="clean">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeExportHtml(title)}</title>
<style>
:root{color-scheme:${isDark ? "dark" : "light"};${cssVars}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--plus-reading-font,var(--font-sans));font-size:15px;line-height:1.72}
main{max-width:820px;margin:0 auto;padding:28px 18px 64px}
h1{font-family:var(--plus-bold-font,var(--font-sans));font-size:22px;margin:0 0 6px;color:var(--text)}
.meta{color:var(--text-muted);font-size:12px;margin-bottom:24px}
.msg{border:1px solid var(--border);border-radius:10px;margin:14px 0;background:var(--bg-panel);overflow:hidden}
.msg.user{background:var(--user-bg);border-left:3px solid var(--accent)}
.msg-header{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);padding:7px 14px;border-bottom:1px solid var(--border)}
.msg-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.export-text{white-space:pre-wrap;word-break:break-word}
.export-thinking,.export-tool{border:1px solid var(--border);border-radius:8px;background:var(--bg-subtle);overflow:hidden}
.export-tool.is-error{border-color:rgba(248,113,113,0.45)}
.export-thinking-summary,.export-tool-summary{cursor:pointer;user-select:none;padding:6px 10px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px}
.export-tool-name{font-family:var(--font-mono);color:var(--text)}
.tool-badge{margin-left:auto;font-size:11px;padding:1px 6px;border-radius:999px}
.tool-badge.is-ok{color:var(--accent);background:var(--accent-soft)}
.tool-badge.is-error{color:#ef4444;background:rgba(239,68,68,0.12)}
.export-tool-body{border-top:1px solid var(--border);padding:8px 10px;display:flex;flex-direction:column;gap:8px}
.export-tool-label{font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:4px;text-transform:uppercase}
.export-pre{margin:0;padding:8px 10px;background:var(--bg);border-radius:6px;white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:12.5px;line-height:1.55;color:var(--text-muted);overflow-x:auto}
.export-error{padding:8px 10px;border-radius:6px;border:1px solid rgba(239,68,68,0.4);color:#ef4444;font-size:13px}
</style>
</head>
<body>
<main>
<h1>${escapeExportHtml(title)}</h1>
<div class="meta">${metaParts}</div>
${sections}
</main>
</body>
</html>`;
}

/** Trigger a browser download of the self-contained themed HTML export. */
export function downloadChatHtmlExport(options: ChatHtmlExportOptions & { filename?: string }): string {
  const html = buildChatHtmlExport(options);
  if (typeof document !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const safeName = (options.filename ?? options.title ?? "conversation")
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 64) || "conversation";
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName.endsWith(".html") ? safeName : `${safeName}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return html;
}
