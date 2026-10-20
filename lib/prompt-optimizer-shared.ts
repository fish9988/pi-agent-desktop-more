/**
 * Plus: settings of the composer's "improve prompt" button (types and
 * constants shared by the client and the server).
 */

export const OPTIMIZER_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type OptimizerThinkingLevel = (typeof OPTIMIZER_THINKING_LEVELS)[number];
export const OPTIMIZER_STYLES = ["auto", "concise", "structured"] as const;
export type OptimizerStyle = (typeof OPTIMIZER_STYLES)[number];
export const OPTIMIZER_INSTRUCTIONS_MAX = 4000;

export interface PromptOptimizerSettings {
  /** Model to use; null follows the model selected in the composer. */
  model: { provider: string; modelId: string } | null;
  /** Reasoning level; null picks the cheapest level the model supports. */
  thinkingLevel: OptimizerThinkingLevel | null;
  style: OptimizerStyle;
  /** Give the model an abridged transcript of the running conversation. */
  useContext: boolean;
  /** Extra rules appended to the built-in instructions. */
  instructions: string;
}

export const DEFAULT_OPTIMIZER_SETTINGS: PromptOptimizerSettings = {
  model: null,
  thinkingLevel: null,
  style: "auto",
  useContext: true,
  instructions: "",
};

export function normalizeOptimizerSettings(value: unknown, base: PromptOptimizerSettings = DEFAULT_OPTIMIZER_SETTINGS): PromptOptimizerSettings {
const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: PromptOptimizerSettings = { ...base };
  if ("model" in input) {
    const m = input.model as Record<string, unknown> | null;
    out.model = m && typeof m.provider === "string" && typeof m.modelId === "string" && m.provider && m.modelId
      ? { provider: m.provider.slice(0, 200), modelId: m.modelId.slice(0, 200) }
      : null;
  }
  if ("thinkingLevel" in input) {
    out.thinkingLevel = OPTIMIZER_THINKING_LEVELS.includes(input.thinkingLevel as OptimizerThinkingLevel) ? input.thinkingLevel as OptimizerThinkingLevel : null;
  }
  if (OPTIMIZER_STYLES.includes(input.style as OptimizerStyle)) out.style = input.style as OptimizerStyle;
  if (typeof input.useContext === "boolean") out.useContext = input.useContext;
  if (typeof input.instructions === "string") out.instructions = input.instructions.slice(0, OPTIMIZER_INSTRUCTIONS_MAX);
  return out;
}

