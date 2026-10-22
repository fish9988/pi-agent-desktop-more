/**
 * Name for an extension custom panel's frame (Plus 1.7). The `custom` UI
 * request carries only the panel's rendered terminal lines, no command or
 * title, so the frame uses the panel's own first non-empty line with ANSI
 * codes and box-drawing / block characters stripped: "╭ Smart Compact ──╮"
 * reads "Smart Compact". `null` (nothing short left) falls back to the
 * generic "Extension panel"; so does a line with no letters (a bare progress bar).
 */
export function customPanelTitle(lines: readonly string[]): string | null {
  for (const line of lines) {
    // eslint-disable-next-line no-control-regex
    const plain = line.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "");
    if (!plain.trim()) continue;
    const label = plain.replace(/[\u2500-\u257f\u2580-\u259f]+/g, " ").replace(/\s+/g, " ").trim();
    return label.length <= 40 && /\p{L}/u.test(label) ? label : null;
  }
  return null;
}
