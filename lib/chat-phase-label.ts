import type { AgentPhase } from "@/hooks/useAgentSession";

/** The i18n translate function shape this module needs. */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * The status line shown while the agent is working.
 *
 * `isCompacting` takes precedence over the phase: auto-compaction can hold a turn for a
 * while before the next token arrives, and reporting the underlying "waiting for model"
 * phase in the meantime reads as a hang. Compaction is what the user needs to know.
 */
export function phaseLabel(
  phase: AgentPhase,
  t: Translate,
  isCompacting?: boolean,
  /** Plus 1.7: name the slash command being run, and say when its panel waits for input. */
  command?: { name?: string | null; awaitingPanel?: boolean },
): string | null {
  if (isCompacting) return t("chat.compacting");
  if (phase?.kind === "running_tools") {
    const latest = phase.tools[phase.tools.length - 1];
    if (latest?.progress) {
      return `${t("chat.runningNamedTool", { name: latest.name })} ${latest.progress}`;
    }
    const names = phase.tools.map((tool) => tool.name);
    if (names.length === 0) return t("chat.runningTool");
    if (names.length === 1) return t("chat.runningNamedTool", { name: names[0] });
    if (names.length <= 3) return t("chat.runningTools", { names: names.join(", ") });
    return t("chat.runningToolsMore", { names: names.slice(0, 2).join(", "), count: names.length - 2 });
  }
  if (phase?.kind === "waiting_model") return t("chat.waitingModel");
  if (phase?.kind === "running_command") {
    if (!command?.name) return t("chat.runningCommand");
    const running = t("plus.runningSlashCommand", { command: command.name });
    return command.awaitingPanel ? `${running} · ${t("plus.waitingForPanel")}` : running;
  }
  return null;
}

/**
 * Plus 1.7: the slash command the latest user turn ran ("/smart-compact"), if
 * that turn was a command; `null` for ordinary messages.
 */
export function lastSlashCommand(messages: ReadonlyArray<{ role?: string; content?: unknown }>): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const content = message.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => (part && typeof part === "object" && (part as { type?: string }).type === "text" ? String((part as { text?: unknown }).text ?? "") : "")).join("")
        : "";
    const match = /^\s*(\/[A-Za-z0-9][\w:.-]*)/.exec(text);
    return match ? match[1] : null;
  }
  return null;
}