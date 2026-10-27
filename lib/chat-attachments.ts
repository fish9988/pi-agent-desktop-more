/**
 * Text files attached to a chat message.
 *
 * A chat has no file tools, so an attached file travels inside the message itself: the
 * composer reads it in the browser and appends it as an `<attached_file>` block, and the
 * transcript renders that block as a chip instead of a wall of text. The model sees the
 * block as ordinary message text.
 */

import { APP_PREF_KEYS, getPref, setPref } from "./app-prefs";

export const CHAT_ATTACHMENT_MAX_FILE_BYTES = 256 * 1024;
export const CHAT_ATTACHMENT_MAX_TOTAL_BYTES = 512 * 1024;
export const CHAT_ATTACHMENT_MAX_FILES = 5;
/** A Word file is unzipped on the server, so its own size is capped separately from its text. */
export const CHAT_ATTACHMENT_EXTRACT_MAX_BYTES = 10 * 1024 * 1024;

/** Default line threshold above which pasted text is converted into an attached file. */
export const DEFAULT_PASTE_TO_FILE_LINES = 30;
export const PASTE_TO_FILE_PRESETS = [0, 15, 30, 50, 100] as const;
export const PASTE_ATTACHMENT_MAX_FILE_BYTES = 1024 * 1024;
export const PASTE_ATTACHMENT_MAX_FILES = 10;

export interface ChatTextAttachment {
  id: string;
  name: string;
  size: number;
  text: string;
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "mdx", "rst", "log", "csv", "tsv", "json", "jsonl", "ndjson",
  "yaml", "yml", "toml", "ini", "cfg", "conf", "env", "xml", "html", "htm", "svg", "css",
  "scss", "less", "js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx", "vue", "svelte",
  "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cc", "cpp", "hpp", "cs", "php",
  "sh", "bash", "zsh", "fish", "ps1", "bat", "sql", "graphql", "gql", "proto", "lua", "r",
  "dart", "scala", "tex", "diff", "patch", "gitignore", "dockerfile", "makefile", "lock",
]);

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-sh",
  "application/x-yaml",
  "application/toml",
  "image/svg+xml",
]);

function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return (dot < 0 ? base : base.slice(dot + 1)).toLowerCase();
}

/** Whether a file is plain text the composer can inline (code, notes, data). */
export function isChatTextAttachment(file: { name: string; type?: string }): boolean {
  if (file.type?.startsWith("image/") && file.type !== "image/svg+xml") return false;
  if (file.type?.startsWith("text/") || (file.type && TEXT_MIME_TYPES.has(file.type))) return true;
  return TEXT_EXTENSIONS.has(extensionOf(file.name));
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A Word document (.docx): read as plain text by the server, which has the parser. */
export function isChatDocxAttachment(file: { name: string; type?: string }): boolean {
  return file.type === DOCX_MIME || extensionOf(file.name) === "docx";
}

/** Ask the server for a Word document's text; throws a rejection reason on failure. */
export async function extractDocxText(file: File): Promise<string> {
  const response = await fetch("/api/chat-attachments/extract", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  const data = await response.json().catch(() => ({})) as { text?: unknown; error?: unknown };
  if (response.ok && typeof data.text === "string") return data.text;
  throw new Error(data.error === "too-large" ? "too-large" : "not-text");
}

export type ChatAttachmentRejection =
  | { name: string; reason: "unsupported" }
  | { name: string; reason: "too-large"; limit: number }
  | { name: string; reason: "not-text" }
  | { name: string; reason: "too-many"; limit: number }
  | { name: string; reason: "total-too-large"; limit: number };

export interface ChatAttachmentReadResult {
  accepted: ChatTextAttachment[];
  rejected: ChatAttachmentRejection[];
}

/**
 * Read picked files as UTF-8 text, within the per-file, per-message and count limits.
 * `existing` is what the composer already holds, so the limits cover the whole message.
 */
export async function readChatTextAttachments(
  files: readonly File[],
  existing: readonly ChatTextAttachment[] = [],
  /** Reads a Word file's text; the composer passes `extractDocxText`. Without it .docx is unsupported. */
  extractDocx?: (file: File) => Promise<string>,
): Promise<ChatAttachmentReadResult> {
  const accepted: ChatTextAttachment[] = [];
  const rejected: ChatAttachmentRejection[] = [];
  let count = existing.length;
  let totalBytes = existing.reduce((sum, file) => sum + file.size, 0);

  for (const file of files) {
    const docx = Boolean(extractDocx) && isChatDocxAttachment(file);
    if (!docx && !isChatTextAttachment(file)) {
      rejected.push({ name: file.name, reason: "unsupported" });
      continue;
    }
    if (count >= CHAT_ATTACHMENT_MAX_FILES) {
      rejected.push({ name: file.name, reason: "too-many", limit: CHAT_ATTACHMENT_MAX_FILES });
      continue;
    }
    if (docx && extractDocx) {
      if (file.size > CHAT_ATTACHMENT_EXTRACT_MAX_BYTES) {
        rejected.push({ name: file.name, reason: "too-large", limit: CHAT_ATTACHMENT_EXTRACT_MAX_BYTES });
        continue;
      }
      let extracted: string;
      try {
        extracted = await extractDocx(file);
      } catch (error) {
        rejected.push(error instanceof Error && error.message === "too-large"
          ? { name: file.name, reason: "too-large", limit: CHAT_ATTACHMENT_MAX_FILE_BYTES }
          : { name: file.name, reason: "not-text" });
        continue;
      }
      const bytes = new TextEncoder().encode(extracted).length;
      if (totalBytes + bytes > CHAT_ATTACHMENT_MAX_TOTAL_BYTES) {
        rejected.push({ name: file.name, reason: "total-too-large", limit: CHAT_ATTACHMENT_MAX_TOTAL_BYTES });
        continue;
      }
      count += 1;
      totalBytes += bytes;
      accepted.push({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: bytes,
        text: extracted,
      });
      continue;
    }
    if (file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
      rejected.push({ name: file.name, reason: "too-large", limit: CHAT_ATTACHMENT_MAX_FILE_BYTES });
      continue;
    }
    if (totalBytes + file.size > CHAT_ATTACHMENT_MAX_TOTAL_BYTES) {
      rejected.push({ name: file.name, reason: "total-too-large", limit: CHAT_ATTACHMENT_MAX_TOTAL_BYTES });
      continue;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      rejected.push({ name: file.name, reason: "not-text" });
      continue;
    }
    if (text.includes("\0")) {
      rejected.push({ name: file.name, reason: "not-text" });
      continue;
    }
    count += 1;
    totalBytes += file.size;
    accepted.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      size: file.size,
      text: text.replace(/^﻿/, ""),
    });
  }
  return { accepted, rejected };
}

const OPEN_TAG = /<attached_file name="([^"]*)">\n/;
const CLOSE_TAG = "\n</attached_file>";

function escapeName(name: string): string {
  return name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/[\r\n]+/g, " ");
}

function unescapeName(name: string): string {
  return name.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/** The block one attached file becomes inside a message. */
export function formatAttachedFileBlock(file: { name: string; text: string }): string {
  // A file that contains the closing tag must not end its own block early.
  const body = file.text.replace(/<\/attached_file>/g, "<\\/attached_file>");
  return `<attached_file name="${escapeName(file.name)}">\n${body}${CLOSE_TAG}`;
}

/** The message text with every attached file appended after what the user typed. */
export function composeMessageWithAttachedFiles(
  text: string,
  files: readonly { name: string; text: string }[],
): string {
  if (files.length === 0) return text;
  const blocks = files.map(formatAttachedFileBlock).join("\n\n");
  return text ? `${text}\n\n${blocks}` : blocks;
}

export interface SplitAttachedFiles {
  text: string;
  files: { name: string; text: string }[];
}

/** Separate the attached-file blocks from the text around them (the reverse of compose). */
export function splitAttachedFiles(content: string): SplitAttachedFiles {
  if (!content.includes("<attached_file name=")) return { text: content, files: [] };
  const files: { name: string; text: string }[] = [];
  let rest = content;
  let text = "";
  for (;;) {
    const open = OPEN_TAG.exec(rest);
    if (!open) {
      text += rest;
      break;
    }
    const bodyStart = open.index + open[0].length;
    const close = rest.indexOf(CLOSE_TAG, bodyStart);
    if (close < 0) {
      text += rest;
      break;
    }
    text += rest.slice(0, open.index);
    files.push({
      name: unescapeName(open[1] ?? ""),
      text: rest.slice(bodyStart, close).replace(/<\\\/attached_file>/g, "</attached_file>"),
    });
    rest = rest.slice(close + CLOSE_TAG.length);
  }
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), files };
}

let restoredFileCounter = 0;

/**
 * A submitted message back as composer content: the typed text, and its attached-file
 * blocks as attachments again (fresh ids), so editing or restoring a message never puts
 * the files' markup into the text box.
 */
export function splitMessageForComposer(content: string): { text: string; files: ChatTextAttachment[] } {
  const { text, files } = splitAttachedFiles(content);
  return {
    text,
    files: files.map((file) => ({
      id: `restored-${Date.now().toString(36)}-${(restoredFileCounter += 1)}`,
      name: file.name,
      size: new TextEncoder().encode(file.text).length,
      text: file.text,
    })),
  };
}

/** A short label for a session list or tab: the typed text, else the file names. */
export function attachmentAwareTitle(content: string): string {
  const { text, files } = splitAttachedFiles(content);
  if (text) return text;
  return files.map((file) => file.name).join(", ");
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getPasteToFileLineThreshold(): number {
  const raw = getPref(APP_PREF_KEYS.pasteToFileLines);
  if (raw === null || raw.trim() === "") return DEFAULT_PASTE_TO_FILE_LINES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PASTE_TO_FILE_LINES;
  if (parsed <= 0) return 0;
  return Math.max(5, Math.min(1000, parsed));
}

export function setPasteToFileLineThreshold(lines: number): void {
  const normalized = !Number.isFinite(lines) || lines <= 0
    ? 0
    : Math.max(5, Math.min(1000, Math.round(lines)));
  setPref(APP_PREF_KEYS.pasteToFileLines, String(normalized));
}

export function countPasteLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

/**
 * Whether a pasted text snippet should be converted into an attached file.
 * Triggers when line count >= lineThreshold, or when character count exceeds
 * a proportional fallback (`max(1800, lineThreshold * 100)`) so giant single-line
 * pastes (minified JSON, logs, long paragraphs) are also caught.
 */
export function shouldConvertPasteToAttachment(
  text: string,
  lineThreshold = getPasteToFileLineThreshold(),
): boolean {
  if (!text || lineThreshold <= 0) return false;
  const lines = countPasteLines(text);
  if (lines >= lineThreshold) return true;
  const charThreshold = Math.max(1800, lineThreshold * 100);
  return text.length >= charThreshold;
}

/** Detect whether pasted text looks like Markdown (.md) or plain text (.txt). */
export function detectPastedFileExtension(text: string): "md" | "txt" {
  if (/^```/m.test(text)) return "md";
  if (/^#{1,6}\s+\S/m.test(text)) return "md";
  if (/!?\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(text)) return "md";
  if (/^\|.+\|\s*\r?\n\|[\s:|-]+\|/m.test(text)) return "md";
  if (/^\s*[-*+]\s+\[[ xX]\]\s+/m.test(text)) return "md";
  if (/^\s*[-*+]\s+\S/m.test(text) && /(\*\*[^*\n]+\*\*|`[^`\n]+`)/.test(text)) return "md";
  return "txt";
}

function extractPasteTitleSlug(text: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  for (const rawLine of lines) {
    const cleaned = rawLine
      .trim()
      .replace(/^[#>*\-+\d.)\s`"'“”‘’【】[\]()（）]+/, "")
      .replace(/[\\/:*?"<>|#`~^$&{}[\];,+=!@%]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    // Skip lines that look like raw code/JSON/URLs rather than a human title
    if (/^(https?:\/\/|import\s|export\s|const\s|let\s|function\s|class\s|\{|\[|<\/?[a-z])/i.test(cleaned)) {
      return "";
    }
    const slug = cleaned.slice(0, 16).trim().replace(/\s+/g, "-");
    if (slug.length >= 2) return slug;
    return "";
  }
  return "";
}

/** Build a `ChatTextAttachment` from pasted text, or `null` if limits are exceeded. */
export function createPastedTextAttachment(
  text: string,
  existing: readonly ChatTextAttachment[] = [],
  preferredExt?: "md" | "txt",
): ChatTextAttachment | null {
  if (existing.length >= PASTE_ATTACHMENT_MAX_FILES) return null;
  const normalized = text.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const bytes = new TextEncoder().encode(normalized).length;
  if (bytes === 0 || bytes > PASTE_ATTACHMENT_MAX_FILE_BYTES) return null;

  const ext = preferredExt ?? detectPastedFileExtension(normalized);
  const existingNames = new Set(existing.map((f) => f.name.toLowerCase()));
  const slug = extractPasteTitleSlug(normalized);

  let index = existing.length + 1;
  let name = slug ? `pasted-${index}-${slug}.${ext}` : `pasted-${index}.${ext}`;
  while (existingNames.has(name.toLowerCase())) {
    index += 1;
    name = slug ? `pasted-${index}-${slug}.${ext}` : `pasted-${index}.${ext}`;
  }

  return {
    id: `paste-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    size: bytes,
    text: normalized,
  };
}
