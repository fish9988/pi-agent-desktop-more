import { randomUUID } from "node:crypto";
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";
import {
  normalizeContext,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import { ModelRuntime, getAgentDir } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { createModelRuntimeWithExtensions } from "./model-runtime";
import { buildTitleTranscript, resolveTitleThinkingLevel } from "./session-title";

/**
 * Plus: rewrite a rough draft from the composer into a clear prompt with the
 * model the composer has selected. When the draft belongs to a live session,
 * a bounded transcript of it is given as context so "fix that" style
 * references can be made explicit.
 */

export const MAX_DRAFT_CHARS = 20_000;
const TIMEOUT_MS = 120_000;
const MAX_TOKENS = 8192;
const REASONING_MAX_TOKENS = 16_384;

export const OPTIMIZE_SYSTEM_PROMPT = `You turn a user's rough, casual message to an AI coding agent into a clear, well-organised prompt that the agent can act on.

Rules:
- Write in the same language as the user's message.
- Keep every requirement, fact, file path, name, number, code snippet and constraint the user gave. Do not drop details and do not invent new requirements, technologies or scope.
- Never add specifics the user did not give (exact paths, file names, versions, numbers); describe them the way the user did, or leave them for the agent to find out.
- Fix typos and ambiguity; when the conversation context makes a vague reference clear ("that bug", "the same as before"), spell it out.
- Organise only as much as the request needs: a short request stays a short paragraph; a larger one may use a goal line followed by brief bullet points (context, requirements, constraints, expected result).
- Keep the user's voice and intent; be concise, no filler, no greetings.
- Do not answer or carry out the request.
- Output only the rewritten prompt, with no preface, quotes, or explanation.`;

export interface OptimizeInput {
  text: string;
  /** Composer model; required unless a live session agent is supplied. */
  provider?: string;
  modelId?: string;
  /** Live session agent, when the draft belongs to a running session. */
  agent?: Agent;
}

export interface OptimizeResult {
  text: string;
  model: string;
}

export function buildOptimizeContext(text: string, history: AgentMessage[] = []): Context {
  const transcript = history.length ? buildTitleTranscript(history) : "";
  const parts = [
    transcript.trim()
      ? `Conversation so far (for context only, abridged):\n<conversation>\n${transcript}\n</conversation>\n`
      : "",
    `Message to rewrite:\n<message>\n${text}\n</message>`,
  ].filter(Boolean);
  return {
    systemPrompt: OPTIMIZE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: [{ type: "text", text: parts.join("\n") }], timestamp: Date.now() }],
  };
}

/** Text of a reply, minus wrappers models sometimes add anyway. */
export function cleanOptimizedText(raw: string): string {
  let text = raw.trim();
  const fenced = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenced) text = fenced[1].trim();
  const tagged = /^<message>\s*([\s\S]*?)\s*<\/message>$/i.exec(text);
  if (tagged) text = tagged[1].trim();
  return text;
}

function textOfReply(message: AssistantMessage): string {
  if (message.stopReason === "error") throw new Error(message.errorMessage || "The model request failed");
  if (message.stopReason === "aborted") throw new Error("Prompt optimisation timed out");
  const text = cleanOptimizedText(message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n"));
  if (!text) {
    throw new Error(message.stopReason === "length"
      ? "The model used its whole output budget before writing the prompt"
      : "The model returned no text");
  }
  return text;
}

function budget(model: Model<Api>): { maxTokens: number; reasoning?: SimpleStreamOptions["reasoning"] } {
  const level = resolveTitleThinkingLevel(model);
  const wanted = level === "off" ? MAX_TOKENS : REASONING_MAX_TOKENS;
  return {
    maxTokens: model.maxTokens > 0 ? Math.min(wanted, model.maxTokens) : wanted,
    ...(level !== "off" ? { reasoning: level as SimpleStreamOptions["reasoning"] } : {}),
  };
}

async function viaAgent(agent: Agent, context: Context): Promise<OptimizeResult> {
  const model = agent.state.model;
  const apiKey = await agent.getApiKey?.(model.provider);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const stream = await agent.streamFunction(model, normalizeContext(context), {
      ...budget(model),
      cacheRetention: "none",
      sessionId: randomUUID(),
      transport: agent.transport,
      thinkingBudgets: agent.thinkingBudgets,
      maxRetryDelayMs: agent.maxRetryDelayMs,
      signal: controller.signal,
      ...(apiKey ? { apiKey } : {}),
    });
    return { text: textOfReply(await stream.result()), model: `${model.provider}/${model.id}` };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Prompt optimisation timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function viaRuntime(provider: string, modelId: string, context: Context): Promise<OptimizeResult> {
  const agentDir = getAgentDir();
  let runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  let model = runtime.getModel(provider, modelId);
  let resolved = model ? await runtime.getAuth(model) : undefined;
  if (!model || !resolved?.auth.apiKey) {
    // Providers registered by extensions are only known after loading them.
    runtime = await createModelRuntimeWithExtensions(runtime);
    model = runtime.getModel(provider, modelId);
    resolved = model ? await runtime.getAuth(model) : undefined;
  }
  if (!model) throw new Error(`Model not found: ${provider}/${modelId}`);
  if (!resolved?.auth.apiKey) throw new Error(`No API key found for "${provider}"`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const message = await completeSimple(model, normalizeContext(context), {
      ...budget(model),
      apiKey: resolved.auth.apiKey,
      headers: resolved.auth.headers,
      cacheRetention: "none",
      signal: controller.signal,
    });
    return { text: textOfReply(message), model: `${model.provider}/${model.id}` };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Prompt optimisation timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function optimizePrompt(input: OptimizeInput): Promise<OptimizeResult> {
  const text = input.text.trim();
  if (!text) throw new Error("Nothing to optimise");
  if (text.length > MAX_DRAFT_CHARS) throw new Error(`The draft is longer than ${MAX_DRAFT_CHARS} characters`);
  const agent = input.agent;
  const history = agent ? [...agent.state.messages] : [];
  const context = buildOptimizeContext(text, history);
  const sameModel = agent && (!input.provider || (agent.state.model.provider === input.provider && agent.state.model.id === input.modelId));
  if (agent && sameModel) return viaAgent(agent, context);
  if (!input.provider || !input.modelId) {
    if (agent) return viaAgent(agent, context);
    throw new Error("No model selected");
  }
  return viaRuntime(input.provider, input.modelId, context);
}
