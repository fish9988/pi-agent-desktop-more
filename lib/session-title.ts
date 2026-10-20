import { randomUUID } from "node:crypto";
import type { Agent, AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  getSupportedThinkingLevels,
  normalizeContext,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";

const TITLE_TIMEOUT_MS = 90_000;
const TITLE_MAX_TOKENS = 256;
// Models whose thinking cannot be switched off (thinkingLevelMap.off === null,
// e.g. DeepSeek V4.x, many gateway models) spend part of the output ceiling on
// reasoning. With only 256 tokens the reasoning phase regularly consumed the
// whole budget and the reply carried no text, which is why "Generate title"
// worked for some sessions and failed for others. Anthropic budget thinking
// also needs budget_tokens >= 1024, which a 256-token ceiling cannot satisfy.
const TITLE_REASONING_MAX_TOKENS = 4096;
// Second attempt after an empty/truncated reply: plenty of room, same model.
const TITLE_RETRY_MAX_TOKENS = 16_384;
const MAX_TITLE_LENGTH = 80;
// Local fallback when every model attempt fails, so the action always
// produces a title. CJK text is counted in characters, other text in words.
const FALLBACK_CJK_CHARS = 24;
const FALLBACK_WORDS = 10;

// Per-message caps. A title needs what the user asked for (every user turn,
// including mid-session pivots) and what came out of it (the last reply); the
// replies in between only need their opening line. Tool calls and results are
// dropped outright: they dominate the token count and say nothing about intent.
const USER_CHARS = 800;
const ASSISTANT_CHARS = 300;
const LAST_ASSISTANT_CHARS = 600;
const SUMMARY_CHARS = 600;
// Total budget across all messages. Without it the transcript still grows with
// the session, and a long session ends up costing more than replaying a cached
// prefix would have.
const TRANSCRIPT_CHARS = 6000;
// Share of the budget reserved for the opening turns. A session often states
// its goal early and then drifts into routine follow-ups, so spending the whole
// budget on the newest turns can title a session after its last chore.
const TRANSCRIPT_HEAD_CHARS = Math.round(TRANSCRIPT_CHARS * 0.4);

const TITLE_SYSTEM_PROMPT =
  "You name chat sessions from a transcript. Reply with the title only.";

const ELISION = "[…]";
const IMAGE_PLACEHOLDER = "[image]";

const TITLE_PROMPT = `Create a concise title for this session based on the conversation above.

Requirements:
- Match the primary language used by the user.
- Describe the user's concrete goal or the outcome, not the act of chatting.
- Use 4-12 words for space-separated languages, or 8-24 characters for CJK text when practical.
- Do not call any tools.
- Return only the title as plain text, with no quotes, label, markdown, or explanation.`;

export interface GeneratedSessionTitle {
  title: string;
  /** Model that produced the title (the session's current model). */
  model?: string;
  /** Set when the model failed and the title was derived from the transcript. */
  fallback?: { reason: string };
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface TitleRequest {
  model: Model<Api>;
  context: Context;
  options: SimpleStreamOptions;
}

/**
 * Naming is a short classification task, so thinking only adds latency and
 * tokens: use the cheapest level the model actually supports. Gemini rejects
 * "minimal" and its SDK emits that level when thinking is disabled, so it
 * skips to the next supported level instead.
 */
export function resolveTitleThinkingLevel(model: Model<Api>): ThinkingLevel {
  if (!model.reasoning) return "off";
  // getSupportedThinkingLevels lists levels in ascending cost order.
  const supported = getSupportedThinkingLevels(model);
  const rejectsMinimal = model.api === "google-generative-ai" || /gemini/i.test(model.id);
  const usable = rejectsMinimal ? supported.filter((level) => level !== "off" && level !== "minimal") : supported;
  return usable[0] ?? supported[0] ?? "off";
}

/**
 * One-shot stream options for a title request. Same idea as compact's
 * summarization path: a short system prompt, one user turn, no tools, a fresh
 * session id, and cacheRetention "none". The request is too small and too
 * unique to reuse the live session's prefix or write a cache nobody will read.
 */
export function buildTitleRequest(source: Agent, transcript: string, maxTokensOverride?: number): TitleRequest {
  const model = source.state.model;
  const thinkingLevel = resolveTitleThinkingLevel(model);
  const maxTokens = maxTokensOverride
    ?? (thinkingLevel === "off" ? TITLE_MAX_TOKENS : TITLE_REASONING_MAX_TOKENS);
  return {
    model,
    context: {
      systemPrompt: TITLE_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [{ type: "text", text: `${transcript}\n\n${TITLE_PROMPT}` }],
        timestamp: Date.now(),
      }],
    },
    options: {
      maxTokens: model.maxTokens > 0 ? Math.min(maxTokens, model.maxTokens) : maxTokens,
      cacheRetention: "none",
      sessionId: randomUUID(),
      transport: source.transport,
      thinkingBudgets: source.thinkingBudgets,
      maxRetryDelayMs: source.maxRetryDelayMs,
      ...(thinkingLevel !== "off" ? { reasoning: thinkingLevel } : {}),
    },
  };
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  let images = 0;
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const type = (block as { type?: string }).type;
    if (type === "text" && typeof (block as { text?: unknown }).text === "string") {
      parts.push((block as { text: string }).text);
    } else if (type === "image") {
      images += 1;
    }
  }
  const text = parts.join("\n").trim();
  if (images === 0) return text;
  const marker = images === 1 ? IMAGE_PLACEHOLDER : `${IMAGE_PLACEHOLDER} ×${images}`;
  return text ? `${text}\n${marker}` : marker;
}

function clip(text: string, max: number): string {
  const characters = Array.from(text);
  return characters.length <= max ? text : `${characters.slice(0, max).join("")}…`;
}

/**
 * A title needs the goal the session opened with and the outcome it reached.
 * The middle is what makes a long session expensive, so keep both ends and drop
 * it. Cost and latency then stop tracking session length.
 */
function boundTranscript(lines: string[]): string {
  const joined = lines.join("\n\n");
  if (joined.length <= TRANSCRIPT_CHARS || lines.length < 2) return joined;

  const head: string[] = [];
  let used = ELISION.length + 4;
  let next = 0;
  // The first line always survives, however long the session is.
  for (; next < lines.length; next++) {
    const size = used + lines[next].length + 2;
    if (head.length > 0 && size > TRANSCRIPT_HEAD_CHARS) break;
    head.push(lines[next]);
    used = size;
  }

  const tail: string[] = [];
  for (let i = lines.length - 1; i >= next; i--) {
    const size = used + lines[i].length + 2;
    if (size > TRANSCRIPT_CHARS) break;
    tail.unshift(lines[i]);
    used = size;
  }

  // Everything fit after all: the budget only looked tight because of joins.
  if (next + tail.length >= lines.length) return joined;
  return [...head, ELISION, ...tail].join("\n\n");
}

function lineForMessage(message: AgentMessage, lastAssistant?: AgentMessage): string | undefined {
  if (message.role === "compactionSummary" || message.role === "branchSummary") {
    const summary = message.summary.trim();
    if (!summary) return undefined;
    return `[Earlier summary] ${clip(summary, SUMMARY_CHARS)}`;
  }
  if (message.role === "custom") {
    const text = textOf(message.content).trim();
    return text ? `User: ${clip(text, USER_CHARS)}` : undefined;
  }
  if (message.role === "bashExecution") {
    const command = message.command.trim();
    return command ? `User: ${clip(`Ran \`${command}\``, USER_CHARS)}` : undefined;
  }
  if (message.role !== "user" && message.role !== "assistant") return undefined;
  const text = textOf(message.content).trim();
  if (!text) return undefined;
  if (message.role === "user") return `User: ${clip(text, USER_CHARS)}`;
  return `Assistant: ${clip(text, message === lastAssistant ? LAST_ASSISTANT_CHARS : ASSISTANT_CHARS)}`;
}

/** Flatten the session into the plain-text transcript the title model reads. */
export function buildTitleTranscript(messages: AgentMessage[]): string {
  let lastAssistant: AgentMessage | undefined;
  for (const message of messages) {
    if (message.role === "assistant" && textOf(message.content).trim()) lastAssistant = message;
  }

  const lines: string[] = [];
  for (const message of messages) {
    const line = lineForMessage(message, lastAssistant);
    if (line) lines.push(line);
  }
  return boundTranscript(lines);
}

function stripWrappingQuotes(value: string): string {
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
    ["\u201c", "\u201d"],
    ["\u300c", "\u300d"],
    ["\u300e", "\u300f"],
  ];
  for (const [start, end] of pairs) {
    if (value.startsWith(start) && value.endsWith(end) && value.length > start.length + end.length) {
      return value.slice(start.length, -end.length).trim();
    }
  }
  return value;
}

export function parseGeneratedSessionTitle(raw: string): string {
  let value = raw.trim();
  const fenced = value.match(/^```(?:json|text)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) value = fenced[1].trim();

  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { title?: unknown };
      if (typeof parsed.title === "string") value = parsed.title.trim();
    } catch {
      // Fall back to plain-text cleanup below.
    }
  }

  value = value.split(/\r?\n/, 1)[0] ?? "";
  value = value.replace(/^(?:session\s+title|title|标题)\s*[:：-]\s*/i, "");
  value = stripWrappingQuotes(value).replace(/\s+/g, " ").trim();
  value = value.replace(/[。.!]+$/u, "").trim();

  if (!/[\p{L}\p{N}]/u.test(value)) {
    throw new Error("The model did not return a usable session title");
  }

  const characters = Array.from(value);
  if (characters.length > MAX_TITLE_LENGTH) {
    value = characters.slice(0, MAX_TITLE_LENGTH).join("").trim();
  }
  return value;
}

function titleFromAssistant(message: AssistantMessage): GeneratedSessionTitle {
  if (message.stopReason === "error") {
    throw new Error(message.errorMessage || "The title model request failed");
  }
  if (message.stopReason === "aborted") {
    throw new Error("Session title generation timed out");
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) {
    throw new TitleRetryableError(message.stopReason === "length"
      ? "The model used its whole output budget before writing a title"
      : "The model did not return a session title");
  }
  return {
    title: parseGeneratedSessionTitle(text),
    ...(message.usage ? {
      usage: {
        input: message.usage.input,
        output: message.usage.output,
        cacheRead: message.usage.cacheRead,
        cacheWrite: message.usage.cacheWrite,
        total: message.usage.totalTokens,
      },
    } : {}),
  };
}

/** An empty or truncated reply: worth one more try with a larger budget. */
class TitleRetryableError extends Error {}

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff]/u;

/**
 * Title derived from the transcript without a model call: the first user
 * request, trimmed to a title-sized phrase. Used only after every model
 * attempt failed, so naming never leaves the user with nothing.
 */
export function fallbackTitleFromMessages(messages: AgentMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = textOf(message.content)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\[image\][^\n]*/g, " ")
      .replace(/[#>*_`~|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!/[\p{L}\p{N}]/u.test(text)) continue;
    // Prefer the first sentence when it is long enough to carry the goal.
    const sentence = text.split(/(?<=[。！？!?；;\n])\s*/u)[0]?.trim() ?? text;
    const base = Array.from(sentence).length >= 6 ? sentence : text;
    let title: string;
    if (CJK_PATTERN.test(base)) {
      const characters = Array.from(base.replace(/[。！？!?；;，,、：:]+$/u, ""));
      title = characters.length > FALLBACK_CJK_CHARS
        ? `${characters.slice(0, FALLBACK_CJK_CHARS).join("")}…`
        : characters.join("");
    } else {
      const words = base.replace(/[.!?;:,]+$/u, "").split(" ");
      title = words.length > FALLBACK_WORDS ? `${words.slice(0, FALLBACK_WORDS).join(" ")}…` : words.join(" ");
    }
    title = title.trim();
    if (title) return title;
  }
  return null;
}

async function requestTitle(sourceAgent: Agent, transcript: string, maxTokens?: number): Promise<GeneratedSessionTitle> {
  const { model, context, options } = buildTitleRequest(sourceAgent, transcript, maxTokens);
  const apiKey = await sourceAgent.getApiKey?.(model.provider);
  const controller = new AbortController();
  const requestOptions: SimpleStreamOptions = {
    ...options,
    signal: controller.signal,
    ...(apiKey ? { apiKey } : {}),
  };

  const timeout = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);

  try {
    // Providers read the prompt from the transcript's leading system message.
    const stream = await sourceAgent.streamFunction(model, normalizeContext(context), requestOptions);
    return { ...titleFromAssistant(await stream.result()), model: `${model.provider}/${model.id}` };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Session title generation timed out");
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Name the session with the session's own current model.
 *
 * Attempt 1 uses a small budget (larger when thinking cannot be disabled).
 * An empty or truncated reply is retried once with a much larger budget, and
 * any other failure is retried once as well (transient gateway errors are the
 * common case). If the model still fails, the title falls back to the first
 * user request so the action always succeeds; `fallback.reason` carries the
 * model error for the UI.
 */
export async function generateSessionTitle(source: AgentSession): Promise<GeneratedSessionTitle> {
  const sourceAgent = source.agent;
  // Snapshot whatever the session holds right now. The transcript is plain
  // text the model reads once, so a turn still in flight only means the
  // newest reply is missing from it; there is nothing to wait for.
  const messages = [...sourceAgent.state.messages];
  const transcript = buildTitleTranscript(messages);
  if (!transcript.trim()) {
    throw new Error("The session has no usable text to name");
  }

  let lastError: unknown;
  for (const maxTokens of [undefined, TITLE_RETRY_MAX_TOKENS]) {
    try {
      return await requestTitle(sourceAgent, transcript, maxTokens);
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message === "Session title generation timed out") break;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  const fallback = fallbackTitleFromMessages(messages);
  if (!fallback) throw lastError instanceof Error ? lastError : new Error(reason);
  return { title: fallback, fallback: { reason } };
}
