// Reading older history is the part of the transcript that regressed twice, in
// opposite directions: first it paged on its own at mount (megabytes of history
// nobody asked for), then the "wait for a real gesture" gate was attached to an
// element that did not exist yet, and scrolling did nothing at all. These pin the
// pieces that keep it working in both directions.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("the gesture gate listens on the document, so a late-mounting scrollport still counts", () => {
  // An effect keyed on the ref never re-runs, so binding to
  // scrollContainerRef.current there missed the container on a cold open.
  const effect = source.slice(
    source.indexOf("const markIntent = (event: Event) =>"),
    source.indexOf("}, [requestOlderPage, scrollContainerRef]);"),
  );
  assert.match(effect, /document\.addEventListener\(event, markIntent, \{ capture: true, passive: true \}\)/);
  assert.match(effect, /if \(inside\(event\)\) userScrollIntentRef\.current = true;/);
  assert.match(effect, /document\.addEventListener\("scroll", onScroll, \{ capture: true, passive: true \}\)/);
});

test("reaching the top of the transcript requests the previous page", () => {
  // The sentinel only reports a *change* of intersection, so it can fire once at
  // mount and never again. The scroll position is the reliable trigger.
  assert.match(source, /if \(!userScrollIntentRef\.current\) return;\n\s*\/\/ Only at the very top of the loaded window/);
  assert.match(source, /if \(container\.scrollTop > 24\) return;/);
  assert.match(source, /frame = requestAnimationFrame\(\(\) => \{\n\s*frame = null;\n\s*requestOlderPage\(\);/);
  // Programmatic jumps (the jump to the bottom, a restored position) set no
  // intent, so they cannot start the old page-after-page cascade.
  assert.doesNotMatch(source, /scrollTop = 0;[\s\S]{0,80}userScrollIntentRef\.current = true/);
});

test("the load-earlier row is a button, and both paths share one request", () => {
  assert.match(source, /const requestOlderPage = useCallback\(\(\) => \{/);
  // The observer and the button must not grow separate copies of the guards.
  assert.equal((source.match(/loadContext\(sid, activeLeafId, oldestId\)/g) ?? []).length, 1);
  assert.match(source, /className="chat-load-earlier"/);
  assert.match(source, /userScrollIntentRef\.current = true;\n\s*requestOlderPage\(\);/);
});

test("a page that does not make the transcript taller stops trying", () => {
  assert.match(source, /if \(stalledOlderLoadsRef\.current >= 2\) return;/);
  assert.match(source, /stalledOlderLoadsRef\.current = container\.scrollHeight > heightBefore \+ 24/);
  // The prepend's anchor restore fires a scroll event of its own; without this
  // window the load chained off itself while the reader sat at the top.
  assert.match(source, /lastOlderLoadAtRef\.current = Date\.now\(\);/);
  assert.match(source, /if \(Date\.now\(\) - lastOlderLoadAtRef\.current < 600\) return;/);
});

test("restoring a saved position pages back a bounded number of times", () => {
  assert.match(source, /const MAX_RESTORE_PAGES = 2;/);
  assert.match(source, /if \(pages >= MAX_RESTORE_PAGES\) break;/);
});
