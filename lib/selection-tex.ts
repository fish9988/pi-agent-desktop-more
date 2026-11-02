/**
 * The clipboard reading of a rendered selection that contains math.
 *
 * KaTeX paints one formula twice — a MathML tree for assistive technology and
 * a visual tree of positioned spans — and both are real text in the document.
 * The platform's own copy therefore writes a formula out as its glyphs, twice
 * over, and never as the source the answer was written in. The TeX the formula
 * was built from is already in the document, in the MathML `annotation`, so a
 * selection that covers a formula is read from the annotation instead of from
 * the rendering.
 */

/** KaTeX keeps the TeX it rendered in this MathML annotation. */
export const KATEX_TEX_SELECTOR = 'annotation[encoding="application/x-tex"]';
/** One rendered formula, whichever of its two trees a node sits in. */
export const KATEX_SELECTOR = ".katex";
/** The wrapper KaTeX puts around a display formula. */
export const KATEX_DISPLAY_SELECTOR = ".katex-display";
/** The MathML tree, hidden by KaTeX's own stylesheet and by nothing else. */
const KATEX_MATHML_SELECTOR = ".katex-mathml";
/** The outermost element of a formula a range boundary landed inside. */
const KATEX_BOUNDARY_SELECTOR = `${KATEX_DISPLAY_SELECTOR}, ${KATEX_SELECTOR}`;

/**
 * Inline math stays inside its line (`$…$`); display math takes a line of its
 * own (`$$\n…\n$$`). The fence is widened past any `$` run inside the formula.
 */
export function texSource(tex: string, display: boolean): string {
  const inner = Math.max(
    0,
    ...Array.from(tex.matchAll(/\$+/g), (run) => run[0].length),
  );
  const fence = "$".repeat(Math.max(display ? 2 : 1, inner + 1));
  if (display) return `${fence}\n${tex}\n${fence}`;
  const padded =
    /^[ \r\n]/.test(tex) && /[ \r\n]$/.test(tex) && /[^ \r\n]/.test(tex);
  const pad = padded || tex.startsWith("$") || tex.endsWith("$");
  const source = `${fence}${pad ? ` ${tex} ` : tex}${fence}`;
  return fence.length > 1 && /[\r\n]/.test(tex)
    ? `<span>${source}</span>`
    : source;
}

function texSlot(tex: string, display: boolean, doc: Document): HTMLElement {
  const slot = doc.createElement(display ? "p" : "span");
  slot.style.whiteSpace = "pre";
  slot.textContent = texSource(tex, display);
  return slot;
}

function replaceKatex(wrapper: Element, doc: Document): HTMLElement[] {
  const slots: HTMLElement[] = [];
  for (const katex of Array.from(wrapper.querySelectorAll(KATEX_SELECTOR))) {
    const tex = katex.querySelector(KATEX_TEX_SELECTOR)?.textContent;
    if (!tex?.trim()) {
      katex.querySelector(KATEX_MATHML_SELECTOR)?.remove();
      continue;
    }
    const display = katex.closest(KATEX_DISPLAY_SELECTOR);
    const slot = texSlot(tex, Boolean(display), doc);
    (display ?? katex).replaceWith(slot);
    slots.push(slot);
  }
  return slots;
}

function expandRangeToWholeKatex(range: Range): Range {
  const expanded = range.cloneRange();
  const boundaryFor = (node: Node | null): Element | null => {
    const element =
      node?.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null);
    const katex = element?.closest?.(KATEX_BOUNDARY_SELECTOR) ?? null;
    return katex?.closest?.(KATEX_DISPLAY_SELECTOR) ?? katex;
  };
  const start = boundaryFor(expanded.startContainer);
  const end = boundaryFor(expanded.endContainer);
  if (start) expanded.setStartBefore(start);
  if (end) expanded.setEndAfter(end);
  return expanded;
}

function createCopyMarker(): string {
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `copy-tex:${randomId}:`;
}

function renderedText(
  wrapper: HTMLElement,
  host: Element,
  slots: HTMLElement[],
): string {
  const doc = host.ownerDocument;
  wrapper.style.cssText = "position:fixed;left:-99999px;top:0";
  host.append(wrapper);
  const selection = doc.defaultView?.getSelection() ?? null;
  const restore =
    selection?.anchorNode && selection.focusNode
      ? ([
          selection.anchorNode,
          selection.anchorOffset,
          selection.focusNode,
          selection.focusOffset,
        ] as const)
      : null;
  try {
    if (!selection) return "";
    const marker = createCopyMarker();
    const sources = slots.map((slot, index) => {
      const source = slot.textContent ?? "";
      slot.textContent = `${marker}${index}${marker}`;
      return source;
    });
    const range = doc.createRange();
    range.selectNodeContents(wrapper);
    selection.removeAllRanges();
    selection.addRange(range);
    const escape = (run: string) => run.replace(/[\\$]/g, "\\$&");
    const parts = selection.toString().split(new RegExp(`${marker}(\\d+)${marker}`));
    if (parts.length === 1) return parts[0];
    return parts.map((part, index) => {
      if (index % 2) {
        const source = sources[Number(part)];
        const touchesFence =
          index > 1 && !parts[index - 1] &&
          sources[Number(parts[index - 2])].endsWith("$") &&
          source.startsWith("$");
        return (touchesFence ? " " : "") + source;
      }
      const escaped = part.replace(/\\*\$/g, escape);
      return index === parts.length - 1 ? escaped : escaped.replace(/\\+$/, escape);
    }).join("");
  } finally {
    wrapper.remove();
    if (restore) selection?.setBaseAndExtent(...restore);
    else selection?.removeAllRanges();
  }
}

function hostElementOf(range: Range): Element | null {
  const container = range.commonAncestorContainer;
  return container.nodeType === 1
    ? (container as Element)
    : (container.parentElement ?? null);
}

function selectionRange(selection: Selection | null): Range | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  return selection.getRangeAt(0);
}

function mayContainKatex(host: Element): boolean {
  return Boolean(
    host.closest(KATEX_SELECTOR) ?? host.querySelector(KATEX_SELECTOR),
  );
}

/**
 * The `text/plain` a copy should carry for `selection`, or null when the
 * selection contains no rendered KaTeX formula.
 */
export function texClipboardPayload(selection: Selection | null): string | null {
  const live = selectionRange(selection);
  const host = live ? hostElementOf(live) : null;
  if (!live || !host || !mayContainKatex(host)) return null;
  const doc = host.ownerDocument;

  const wrapper = doc.createElement("div");
  wrapper.append(expandRangeToWholeKatex(live).cloneContents());
  if (!wrapper.querySelector(KATEX_SELECTOR)) return null;

  const slots = replaceKatex(wrapper, doc);
  return renderedText(wrapper, host, slots) || null;
}
