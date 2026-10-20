import fs from "node:fs/promises";
import path from "node:path";
import { plusAgentDir } from "./plus-prefs";
import { DEFAULT_OPTIMIZER_SETTINGS, normalizeOptimizerSettings, type PromptOptimizerSettings } from "./prompt-optimizer-shared";

export * from "./prompt-optimizer-shared";

/**
 * Plus: settings of the composer's "improve prompt" button, stored in
 * `<agentDir>/desktop/plus-prompt-optimizer.json`.
 */

export function optimizerSettingsFile(agentDir: string = plusAgentDir()): string {
  return path.join(agentDir, "desktop", "plus-prompt-optimizer.json");
}

export async function readOptimizerSettings(file: string = optimizerSettingsFile()): Promise<PromptOptimizerSettings> {
  try {
    return normalizeOptimizerSettings(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return { ...DEFAULT_OPTIMIZER_SETTINGS };
  }
}

export async function updateOptimizerSettings(patch: unknown, file: string = optimizerSettingsFile()): Promise<PromptOptimizerSettings> {
  const next = normalizeOptimizerSettings(patch, await readOptimizerSettings(file));
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(temp, file);
  return next;
}
