// Ground work for real message-list virtualization (plus-status 待办 1.19.0 #1).
// Three prerequisites, each of which has its own way of looking fine in a manual
// test and then shifting the viewport under a reader:
//   1. native scroll anchoring off on the transcript (it fights the manual restore)
//   2. height compensation for mounted rows (folded groups, images, KaTeX)
//   3. prepend restore by entry id + offset instead of "distance to the bottom"
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { findFoldRowIndex, foldAnchorScrollDelta } = await jiti.import("./ChatWindow.tsx");
const source = (await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const plusCss = (await readFile(new URL("../app/plus.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const themeCssRaw = (await readFile(new URL("../app/plus-theme.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
// Declarations only: the comments explain the old 240px guess by name.
const themeCss = themeCssRaw.replace(/\/\*[\s\S]*?\*\//g, "");

function slice(from, to) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `missing: ${from}`);
  const end = source.indexOf(to, start);
  assert.notEqual(end, -1, `missing: ${to}`);
  return source.slice(start, end);
}

test("native scroll anchoring is off on the transcript, for every style", () => {
  // Two mechanisms restoring the same scrollTop undo each other.
  const rule = plusCss.slice(plusCss.indexOf(".chat-scroll-container {"));
  assert.match(rule.slice(0, rule.indexOf("}")), /overflow-anchor: none;/);
  // The manual restore lives in ChatWindow, so the rule cannot be clean-only.
  const block = plusCss.slice(plusCss.lastIndexOf("/* -- Plus: the transcript keeps its own scroll anchor"), plusCss.indexOf(".chat-scroll-container {"));
  assert.doesNotMatch(block, /data-plus-style/);
});

test("height estimates are confined to code blocks and folded groups", () => {
  // The 240px guess used to sit on every message row. A prepended page then
  // landed the viewport at the top of the new page.
  assert.doesNotMatch(themeCss, /contain-intrinsic-size: auto 240px/);
  assert.doesNotMatch(themeCss, /\.chat-scroll-container \[data-entry-id\] \{\s*content-visibility: auto;/);
  const rule = themeCss.slice(themeCss.indexOf("html[data-plus-style=\"clean\"] .chat-scroll-container .markdown-body :is(pre, table, .katex-display),"));
  assert.match(rule.slice(0, rule.indexOf("}")), /process-details\.work-group:not\(\.is-open\) \{\s*content-visibility: auto;\s*contain-intrinsic-size: auto 72px;/);
});

test("the fold row is found by binary search over rows in document order", () => {
  const rows = [
    { top: -300, bottom: -100 },
    { top: -100, bottom: 60 },
    { top: 60, bottom: 400 },
    { top: 400, bottom: 520 },
  ];
  const rectAt = (index) => rows[index];
  // Straddling the top edge wins, then the last row starting at/above it.
  assert.equal(findFoldRowIndex(rows.length, 0, rectAt), 1);
  assert.equal(findFoldRowIndex(rows.length, -100, rectAt), 1);
  assert.equal(findFoldRowIndex(rows.length, -101, rectAt), 0);
  assert.equal(findFoldRowIndex(rows.length, 60, rectAt), 2);
  assert.equal(findFoldRowIndex(rows.length, 900, rectAt), 3);
  // Nothing has scrolled past the edge yet: the topmost row owns the fold, so a
  // prepend at scrollTop 0 still has an anchor to pin.
  assert.equal(findFoldRowIndex(rows.length, -400, rectAt), 0);
  assert.equal(findFoldRowIndex(0, 0, rectAt), -1);
});

test("compensation is the anchored element's offset change, and nothing else", () => {
  // Growth above the fold moves the anchored element down by exactly that much.
  assert.equal(foldAnchorScrollDelta(48, 12), 36);
  assert.equal(foldAnchorScrollDelta(-500, -120), -380);
  // Sub-pixel layout noise is not a jump.
  assert.equal(foldAnchorScrollDelta(12.4, 12), 0);
  // A change below the fold leaves the anchored element where it was.
  assert.equal(foldAnchorScrollDelta(12, 12), 0);
});

test("every mounted message row is observed for height changes", () => {
  const sync = slice("function syncRowObservations()", "// Hold a prepended page's anchor for a few frames");
  assert.match(sync, /for \(const row of rows\) \{\s*if \(observedRowsRef\.current\.has\(row\)\) continue;\s*observer\.observe\(row\);/);
  assert.match(sync, /observer\.observe\(content\);/);
  // Rows, not arbitrary nodes: nested [data-entry-id] rows would be counted
  // twice by the observer and once by the row that contains them.
  assert.match(source, /const rows = messageRowElements\(content\);/);
  // The observer outlives renders: re-creating it per page lost every change
  // that happened in the same frame as the commit.
  assert.match(source, /rowObserverRef\.current = observer;\n\s*syncRowObservations\(\);/);
  assert.doesNotMatch(source, /new ResizeObserver\(\(entries\) =>/);
  const compensate = slice("const observer = new ResizeObserver(() => {", "rowObserverRef.current = observer;");
  // A stale baseline (a scroll we never sampled) must re-take it, not apply the
  // scroll distance as an adjustment.
  assert.match(compensate, /anchor\.scrollTop !== container\.scrollTop/);
  assert.match(compensate, /foldAnchorRef\.current = captureFoldAnchor\(container, foldRowsRef\.current\);/);
  // While a prepend is being pinned the observer stands down, or the line moves
  // twice.
  assert.match(compensate, /if \(pinFrameRef\.current !== null\) return;/);
});

test("a prepend's anchor is pinned for a moment, not measured once", () => {
  // Placeholders above the fold resolve after the restore; a single measurement
  // left 30-190px of drift in the measured session.
  const pin = slice("function pinPrependAnchor(", "// Height compensation for mounted message rows.");
  assert.match(pin, /if \(frames > 90\) return;/);
  assert.match(pin, /if \(Math\.abs\(container\.scrollTop - expected\) > 1\) return;/);
  assert.match(source, /if \(prepend\) pinPrependAnchor\(container, prepend\);/);
  assert.match(source, /stopPrependPin\(\);/);
});

test("the baseline follows the scrollport and the list", () => {
  // Effects run in declaration order, so the baseline is taken after the prepend
  // restore has set scrollTop.
  const restoreAt = source.indexOf("const restored = prepend ? restorePrependAnchor(container, prepend) : null;");
  const baselineAt = source.indexOf("foldRowsRef.current = messageRowElements(content);\n    foldAnchorRef.current = captureFoldAnchor");
  assert.notEqual(restoreAt, -1);
  assert.notEqual(baselineAt, -1);
  assert.ok(baselineAt > restoreAt, "the baseline must be taken after the prepend restore");
  // Bound on the document: the scrollport mounts after this effect first runs.
  assert.match(source, /document\.addEventListener\("scroll", onScroll, \{ capture: true, passive: true \}\);/);
});

test("a prepend holds the entry that owns the top edge, with the distance as fallback", () => {
  const request = slice("const requestOlderPage = useCallback(", "}, [activeLeafId, hasEarlierMessages, historyCursor, loadContext, retryLoad, scrollContainerRef, session?.id]);");
  assert.match(request, /prependAnchorRef\.current = content \? capturePrependAnchor\(container, captureFoldAnchor\(container, foldRowsRef\.current\)\) : null;/);
  assert.match(request, /prevScrollDistanceRef\.current = captureScrollDistance\(container\.scrollHeight, container\.scrollTop\);/);
  // A page that brings nothing must not leave a restore behind for the next
  // unrelated commit.
  assert.match(request, /if \(added === 0\) \{\s*prependAnchorRef\.current = null;\s*prevScrollDistanceRef\.current = null;/);

  const restore = slice("const restored = prepend ? restorePrependAnchor(container, prepend) : null;", "}, [entryIds, messages.length, scrollContainerRef]);");
  assert.match(restore, /container\.scrollTop = restored;/);
  // The anchored row may have been sliced out of the window: keep the old
  // distance-to-the-bottom behaviour rather than doing nothing.
  assert.match(restore, /else if \(savedDistance != null\) \{\s*container\.scrollTop = restoreScrollTop\(container\.scrollHeight, savedDistance\);/);
});

test("the anchoring work does not take over the paging triggers", () => {
  // Everything the older-history test pins stays where it was: a second trigger
  // path or a reset of the stall counter would page in a loop or latch off.
  assert.match(source, /if \(loadingOlderRef\.current\) return;/);
  assert.match(source, /if \(stalledOlderLoadsRef\.current >= 2\) return;/);
  assert.match(source, /if \(Date\.now\(\) - lastOlderLoadAtRef\.current < 600\) return;/);
  assert.match(source, /if \(container\.scrollTop > 24\) return;/);
  assert.match(source, /const MAX_RESTORE_PAGES = 2;/);
});

test("user scroll gestures immediately cancel pinPrependAnchor and in-flight height changes update prependAnchorRef", () => {
  const gestureBlock = slice("const markIntent = (event: Event) =>", "}, [requestOlderPage, scrollContainerRef]);");
  assert.match(gestureBlock, /stopPrependPin\(\);/);
  assert.match(gestureBlock, /"touchmove"/);
  const observerBlock = slice("const observer = new ResizeObserver(() => {", "rowObserverRef.current = observer;");
  assert.match(observerBlock, /if \(loadingOlderRef\.current && prependAnchorRef\.current\) \{/);
});

test("branch pager reads tree and activeLeafId directly from useAgentSession without a forwardBranchData state loop", () => {
  assert.doesNotMatch(source, /forwardBranchData|setBranchView/);
  assert.match(source, /getBranchDecisions\(data\.tree, activeLeafId\)/);
  assert.match(source, /event\.target\.closest\("\.message-branch-pager"\)/);
});

test("long transcripts recycle off-screen rows and sync entry geometry with lib/message-index", () => {
  assert.match(source, /setIndexedEntries\(container, entryIds, turnMap\)/);
  assert.match(source, /recordRowHeight\(scrollContainerRef\.current, row\.dataset\.entryId, row\.offsetHeight/);
  assert.match(source, /data-virtual-spacer="top"/);
  assert.match(source, /data-virtual-spacer="bottom"/);
});

test("copying a selection with KaTeX formulas writes TeX source to the clipboard", () => {
  assert.match(source, /texClipboardPayload\(selection\)/);
  assert.match(source, /document\.addEventListener\("copy", onCopy\)/);
});
