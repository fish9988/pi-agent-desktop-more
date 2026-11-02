import test from "node:test";
import assert from "node:assert/strict";

async function loadSubject() {
  return import("./message-index.ts");
}

function rect(top, height) {
  return { top, bottom: top + height, height, left: 0, right: 0, width: 0 };
}

/**
 * A tiny DOM stand-in: only what `lib/message-index.ts` touches
 * (`querySelectorAll`, `offsetTop`/`offsetHeight`/`offsetParent`,
 * `getBoundingClientRect`, `scrollTo`). Deliberately not jsdom — the module has
 * to work with plain layout numbers.
 */
function createContainer({ clientHeight = 600, scrollTop = 0 } = {}) {
  const nodes = [];
  const container = {
    dataset: {},
    offsetTop: 0,
    offsetHeight: clientHeight,
    offsetParent: null,
    isConnected: true,
    scrollTop,
    clientHeight,
    scrollHeight: 0,
    scrollCalls: [],
    nodes,
    getBoundingClientRect() {
      return rect(0, clientHeight);
    },
    contains(node) {
      let current = node;
      while (current) {
        if (current === container) return true;
        current = current.parent ?? current.offsetParent ?? null;
      }
      return false;
    },
    querySelectorAll(selector) {
      return selector === "[data-entry-id]" ? nodes.filter((node) => node.dataset.entryId !== undefined) : [];
    },
    querySelector(selector) {
      const match = /^\[data-entry-id="(.*)"\]$/.exec(selector);
      if (!match) return null;
      return nodes.find((node) => node.dataset.entryId === match[1]) ?? null;
    },
    scrollTo(options) {
      container.scrollCalls.push(options);
      if (typeof options.top === "number") container.scrollTop = options.top;
    },
  };
  return container;
}

function createRow(container, { entryId, top = 0, height = 100, turn, parent = null } = {}) {
  const dataset = {};
  if (entryId !== undefined) dataset.entryId = entryId;
  if (turn !== undefined) dataset.conversationTurn = String(turn);
  const row = {
    dataset,
    offsetTop: top,
    offsetHeight: height,
    offsetParent: parent ?? container,
    parent,
    isConnected: true,
    rectCalls: 0,
    getBoundingClientRect() {
      row.rectCalls += 1;
      const absolute = row.offsetTop + (row.offsetParent.offsetTop ?? 0);
      return rect(absolute - container.scrollTop, row.offsetHeight);
    },
  };
  container.nodes.push(row);
  return row;
}

test("indexes mounted rows by position and by entry id", async () => {
  const { buildIndex, indexOfEntry, elementOf, elementForEntry, entryAt } = await loadSubject();
  const container = createContainer();
  const first = createRow(container, { entryId: "aaa", top: 0, height: 120 });
  const second = createRow(container, { entryId: "bbb", top: 120, height: 200 });
  const third = createRow(container, { entryId: "ccc", top: 320, height: 80 });
  container.scrollHeight = 400;

  const index = buildIndex(container);
  assert.equal(index.entries.length, 3);
  assert.equal(indexOfEntry(index, "aaa"), 0);
  assert.equal(indexOfEntry(index, "bbb"), 1);
  assert.equal(indexOfEntry(index, "ccc"), 2);
  assert.equal(elementOf(index, 1), second);
  assert.equal(elementForEntry(container, "ccc"), third);
  assert.equal(entryAt(index, 0)?.element, first);
  assert.equal(index.elementByIndex.get(2), third);
  assert.deepEqual(index.entries.map((entry) => entry.offsetTop), [0, 120, 320]);
  assert.equal(index.contentHeight, 400);
});

test("an empty container yields an empty index instead of throwing", async () => {
  const { buildIndex, indexOfEntry, elementOf, viewportEntry, turnIndexAtOffset } = await loadSubject();
  const container = createContainer();
  const index = buildIndex(container);
  assert.deepEqual(index.entries, []);
  assert.equal(index.averageHeight, 0);
  assert.equal(indexOfEntry(index, "nope"), undefined);
  assert.equal(elementOf(index, 0), null);
  assert.equal(turnIndexAtOffset(container, 0), null);
  const viewport = viewportEntry(container, 0);
  assert.equal(viewport.mounted, false);
  assert.equal(viewport.estimated, true);
  assert.equal(viewport.visible, false);
  // and a null container is safe too
  assert.deepEqual(buildIndex(null).entries, []);
  assert.equal(elementOf(buildIndex(null), 0), null);
});

test("nested rows repeating an id are indexed once, outermost first", async () => {
  const { buildIndex, indexOfEntry, elementOf, elementForEntry } = await loadSubject();
  const container = createContainer();
  const wrapper = createRow(container, { entryId: "aaa", top: 0, height: 300 });
  const nested = createRow(container, { entryId: "aaa", top: 40, height: 20, parent: wrapper });
  const other = createRow(container, { entryId: "bbb", top: 300, height: 100 });

  const index = buildIndex(container);
  assert.deepEqual(index.entries.map((entry) => entry.entryId), ["aaa", "bbb"]);
  assert.equal(indexOfEntry(index, "aaa"), 0);
  assert.equal(elementOf(index, 0), wrapper);
  assert.notEqual(elementOf(index, 0), nested);
  assert.equal(elementForEntry(container, "aaa"), wrapper);
  assert.equal(elementOf(index, 1), other);
});

test("out-of-range positions and unknown ids are safe", async () => {
  const { buildIndex, indexOfEntry, indexOfTurn, elementOf, entryAt, viewportEntry } = await loadSubject();
  const container = createContainer();
  createRow(container, { entryId: "aaa", top: 0, height: 100 });
  createRow(container, { entryId: "bbb", top: 100, height: 100 });
  const index = buildIndex(container);

  assert.equal(indexOfEntry(index, "ghost"), undefined);
  assert.equal(indexOfEntry(index, ""), undefined);
  assert.equal(indexOfEntry(index, null), undefined);
  assert.equal(indexOfTurn(index, 9), undefined);
  assert.equal(indexOfTurn(index, null), undefined);
  assert.equal(entryAt(index, -1), null);
  assert.equal(elementOf(index, 99), null);
  assert.equal(elementOf(index, Number.NaN), null);

  const past = viewportEntry(container, 5);
  assert.equal(past.mounted, false);
  assert.equal(past.estimated, true);
  assert.ok(past.offsetTop >= 200, `expected an estimate past the last row, got ${past.offsetTop}`);
  assert.equal(past.entryId, null);
});

test("viewportEntry reads cached offsets, not rects", async () => {
  const { buildIndex, viewportEntry } = await loadSubject();
  const container = createContainer({ clientHeight: 600 });
  const first = createRow(container, { entryId: "aaa", top: 0, height: 100 });
  createRow(container, { entryId: "bbb", top: 100, height: 100 });
  createRow(container, { entryId: "ccc", top: 200, height: 700 });
  buildIndex(container);

  // Any layout read after the build would show up here (and is what made the
  // old per-frame implementation slow).
  for (const node of container.nodes) {
    node.getBoundingClientRect = () => {
      throw new Error("viewportEntry must not measure rects");
    };
  }
  first.offsetTop = -9999;

  container.scrollTop = 150;
  const middle = viewportEntry(container, 1);
  assert.equal(middle.mounted, true);
  assert.equal(middle.entryId, "bbb");
  assert.equal(middle.offsetTop, 100);
  assert.equal(middle.height, 100);
  assert.equal(middle.top, -50);
  assert.equal(middle.bottom, 50);
  assert.equal(middle.visible, true);

  container.scrollTop = 700;
  const below = viewportEntry(container, 1);
  assert.equal(below.visible, false);
  assert.equal(below.top, -600);

  container.scrollTop = 0;
  const third = viewportEntry(container, 2);
  assert.equal(third.visible, true);
  assert.equal(third.height, 700);
});

test("turn anchors map turn numbers to positions and answer by offset", async () => {
  const { buildIndex, indexOfTurn, turnIndexAtOffset } = await loadSubject();
  const container = createContainer({ clientHeight: 600 });
  createRow(container, { entryId: "u0", top: 0, height: 100, turn: 0 });
  createRow(container, { entryId: "a0", top: 100, height: 400 });
  createRow(container, { entryId: "u1", top: 500, height: 100, turn: 1 });
  createRow(container, { entryId: "a1", top: 600, height: 400 });
  createRow(container, { entryId: "u2", top: 1000, height: 100, turn: 2 });
  const index = buildIndex(container);

  assert.equal(indexOfTurn(index, 0), 0);
  assert.equal(indexOfTurn(index, 1), 2);
  assert.equal(indexOfTurn(index, 2), 4);
  assert.equal(index.turnEntries.length, 3);
  assert.deepEqual(index.turnEntries.map((anchor) => anchor.turn), [0, 1, 2]);

  assert.equal(turnIndexAtOffset(container, 0), 0);
  assert.equal(turnIndexAtOffset(container, 28), 0);
  assert.equal(turnIndexAtOffset(container, 300), 1);
  assert.equal(turnIndexAtOffset(container, 400), 1);
  assert.equal(turnIndexAtOffset(container, 480), 1);
  assert.equal(turnIndexAtOffset(container, 528), 1);
  assert.equal(turnIndexAtOffset(container, 950), 2);
  assert.equal(turnIndexAtOffset(container, 1000), 2);
  assert.equal(turnIndexAtOffset(container, 5000), 2);

  const plain = createContainer();
  createRow(plain, { entryId: "x", top: 0, height: 10 });
  buildIndex(plain);
  assert.equal(turnIndexAtOffset(plain, 0), null);
});

test("a rebuild picks up resized rows and drops unmounted ones", async () => {
  const { buildIndex } = await loadSubject();
  const container = createContainer();
  const first = createRow(container, { entryId: "aaa", top: 0, height: 100 });
  const second = createRow(container, { entryId: "bbb", top: 100, height: 100 });
  const before = buildIndex(container);
  assert.deepEqual(before.entries.map((entry) => entry.height), [100, 100]);

  // window resize / a group opening: same rows, new geometry
  first.offsetHeight = 160;
  second.offsetTop = 160;
  second.offsetHeight = 240;
  const resized = buildIndex(container);
  assert.ok(resized.revision > before.revision);
  assert.deepEqual(resized.entries.map((entry) => entry.height), [160, 240]);
  assert.deepEqual(resized.entries.map((entry) => entry.offsetTop), [0, 160]);

  // a row unmounted by pagination disappears from the index
  container.nodes.splice(container.nodes.indexOf(first), 1);
  const after = buildIndex(container);
  assert.deepEqual(after.entries.map((entry) => entry.entryId), ["bbb"]);
});

test("messageIndex caches and invalidateIndex forces a fresh build", async () => {
  const { buildIndex, messageIndex, invalidateIndex } = await loadSubject();
  const container = createContainer();
  const row = createRow(container, { entryId: "aaa", top: 0, height: 100 });
  const built = buildIndex(container);
  const cached = messageIndex(container);
  assert.equal(cached.revision, built.revision);
  assert.equal(messageIndex(container).revision, cached.revision);

  row.offsetHeight = 500;
  invalidateIndex(container);
  const rebuilt = messageIndex(container);
  assert.ok(rebuilt.revision > cached.revision);
  assert.equal(rebuilt.entries[0].height, 500);

  // and a stale detached cache expires on its own (clock stubbed, no waiting)
  const realNow = Date.now;
  const base = realNow();
  try {
    Date.now = () => base + 10_000;
    const stale = messageIndex(container);
    assert.ok(stale.revision > rebuilt.revision);
  } finally {
    Date.now = realNow;
  }
});

test("scrollToEntry uses the cached offset and prefers scrollTo", async () => {
  const { buildIndex, scrollToEntry, DEFAULT_SCROLL_OFFSET } = await loadSubject();
  const container = createContainer();
  createRow(container, { entryId: "aaa", top: 0, height: 100 });
  const middle = createRow(container, { entryId: "bbb", top: 100, height: 100 });
  createRow(container, { entryId: "ccc", top: 900, height: 100 });
  buildIndex(container);

  assert.equal(scrollToEntry(container, "ccc"), true);
  assert.deepEqual(container.scrollCalls.at(-1), { top: 900 - DEFAULT_SCROLL_OFFSET, behavior: "smooth" });

  // fresh index: the jump is pure arithmetic (no rect reads at all)
  const rectsBefore = middle.rectCalls;
  assert.equal(scrollToEntry(container, "bbb", { offset: 16, behavior: "auto" }), true);
  assert.deepEqual(container.scrollCalls.at(-1), { top: 84, behavior: "auto" });
  assert.equal(middle.rectCalls, rectsBefore);

  // clamped at the top
  assert.equal(scrollToEntry(container, "aaa", { offset: 72 }), true);
  assert.deepEqual(container.scrollCalls.at(-1), { top: 0, behavior: "smooth" });

  // unknown / empty ids do not scroll
  const calls = container.scrollCalls.length;
  assert.equal(scrollToEntry(container, "ghost"), false);
  assert.equal(scrollToEntry(container, null), false);
  assert.equal(container.scrollCalls.length, calls);

  // a row that mounted after the build is still found (one query, one measure)
  const late = createRow(container, { entryId: "ddd", top: 1200, height: 80 });
  assert.equal(scrollToEntry(container, "ddd", { offset: 0 }), true);
  assert.deepEqual(container.scrollCalls.at(-1), { top: 1200, behavior: "smooth" });
  assert.ok(late.rectCalls > 0);
});

test("scrollToEntry re-measures when the index was invalidated", async () => {
  const { buildIndex, messageIndex, invalidateIndex, scrollToEntry, indexIsStale } = await loadSubject();
  const container = createContainer();
  const row = createRow(container, { entryId: "aaa", top: 100, height: 100 });
  buildIndex(container);
  assert.equal(indexIsStale(container), false);
  messageIndex(container);

  // a prepended page moved the row, the index has not been rebuilt yet
  row.offsetTop = 5000;
  invalidateIndex(container);
  assert.equal(indexIsStale(container), true);
  const rectsBefore = row.rectCalls;
  assert.equal(scrollToEntry(container, "aaa", { offset: 0 }), true);
  assert.deepEqual(container.scrollCalls.at(-1), { top: 5000, behavior: "smooth" });
  assert.ok(row.rectCalls > rectsBefore, "a stale jump must measure the row again");
});

test("watchMessageIndex rebuilds on subscribe and shares one watcher", async () => {
  const { messageIndex, watchMessageIndex, buildIndex } = await loadSubject();
  const container = createContainer();
  const row = createRow(container, { entryId: "aaa", top: 0, height: 100 });
  const before = buildIndex(container);

  let notified = 0;
  const first = watchMessageIndex(container, () => { notified += 1; });
  assert.ok(first.index.revision > before.revision);

  row.offsetHeight = 260;
  const second = watchMessageIndex(container);
  assert.ok(second.index.revision > first.index.revision);
  assert.equal(second.index.entries[0].height, 260);
  // the shared cache is what every lookup sees
  assert.equal(messageIndex(container).revision, second.index.revision);

  first.dispose();
  second.dispose();
  // after the last subscriber leaves, a fresh subscribe starts a new watcher
  const third = watchMessageIndex(container);
  assert.ok(third.index.revision >= second.index.revision);
  third.dispose();
  assert.equal(notified, 0);
});
