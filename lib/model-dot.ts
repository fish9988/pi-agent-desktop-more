/**
 * Plus 1.7: the small colour dot in front of a model name (reply footer,
 * composer model chip). It tells model families apart at a glance; the
 * provider id is often a relay ("cpa", "magpie"), so the model id decides.
 * Unknown families get a neutral dot.
 */
const FAMILIES: ReadonlyArray<[RegExp, string]> = [
  [/claude|anthropic|opus|sonnet|haiku/i, "#d9784a"],
  [/gemini|gemma|google/i, "#4d8bf5"],
  [/deepseek/i, "#5b6cf0"],
  [/gpt|openai|codex|\bo[134]\b/i, "#10a37f"],
  [/qwen|qwq/i, "#7c5cf2"],
  [/kimi|moonshot/i, "#1f9bd1"],
  [/glm|zhipu/i, "#3b82f6"],
  [/grok|xai/i, "#8a8a8a"],
  [/mistral|codestral/i, "#f08a24"],
];

export function modelDotColor(provider?: string | null, model?: string | null): string {
  const id = `${model ?? ""} ${provider ?? ""}`;
  for (const [pattern, color] of FAMILIES) if (pattern.test(id)) return color;
  return "var(--text-dim)";
}
