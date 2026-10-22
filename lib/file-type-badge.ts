/**
 * Plus 1.7: the small coloured type tag in front of a file name in the files
 * card ("RS", "TSX", "PS1"). The tone groups languages so a list of changes
 * reads at a glance; unknown types fall back to a neutral tag.
 */
export type FileBadgeTone = "blue" | "yellow" | "orange" | "indigo" | "green" | "pink" | "cyan" | "grey";

const TONES: Record<string, FileBadgeTone> = {
  ts: "blue", tsx: "blue", mts: "blue", cts: "blue",
  js: "yellow", jsx: "yellow", mjs: "yellow", cjs: "yellow", json: "yellow",
  rs: "orange", html: "orange", toml: "orange", java: "orange", swift: "orange",
  ps1: "indigo", psm1: "indigo", psd1: "indigo", bat: "indigo", cmd: "indigo", sh: "indigo",
  py: "green", go: "cyan", c: "cyan", cpp: "cyan", h: "cyan", cs: "green", vue: "green",
  css: "pink", scss: "pink", less: "pink", svg: "pink",
};

export function fileTypeBadge(fileName: string): { label: string; tone: FileBadgeTone } {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (!ext) return { label: "·", tone: "grey" };
  return { label: ext.slice(0, 4).toUpperCase(), tone: TONES[ext] ?? "grey" };
}
