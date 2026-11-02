/**
 * Plus: message index — `entryId` ↔ DOM row ↔ layout offset.
 *
 * Why: `ConversationNavigator` re-measured every `[data-conversation-turn]`
 * anchor with `getBoundingClientRect()` on each scroll event, and `ChatFindBar`
 * ran an attribute query plus two rect measurements for every match jump. In a
 * 1 000-message transcript that is a forced layout per frame. Today both go
 * through this module, so a jump/frame costs arithmetic on cached numbers.
 *
 * Instead we build the row list once per "the message list or its mounting
 * changed" and cache each row's `offsetTop`/`offsetHeight`. `offsetTop` is a
 * layout position, so it does not change when the container scrolls — reading it
 * once is enough, and looking a row up during scrolling is pure arithmetic on
 * the cached numbers (binary search for the navigator's active turn).
 *
 * Rebuild triggers:
 * - a new watcher/subscription (`watchMessageIndex`) always takes a fresh build;
 * - DOM mutations inside the container (new rows mounted, groups opened,
 *   streamed text growing) mark the index dirty, and the next lookup rebuilds
 *   it at most once per `MIN_REBUILD_INTERVAL_MS`, so streaming does not force a
 *   full layout flush on every token;
 * - a container resize (window resize changes row heights) rebuilds at once.
 *
 * The index is deliberately position-based over *mounted* rows, which is what
 * both components need today. When the list is virtualized, `buildIndex` needs
 * an optional `entryIds` list to map message indexes onto mounted rows;
 * `estimateGeometry()` already produces placeholder geometry for rows that are
 * not mounted (see `viewportEntry`).
 */

export interface MessageIndexEntry {
  entryId: string;
  element: HTMLElement;
  /** Layout top relative to the container's content origin; independent of `scrollTop`. */
  offsetTop: number;
  /** `offsetHeight` at build time. */
  height: number;
  /** `data-conversation-turn` when the row is a turn anchor, else `null`. */
  turn: number | null;
}

export interface TurnAnchor {
  turn: number;
  /** Position in `MessageIndex.entries` (mounted order). */
  position: number;
  offsetTop: number;
}

export interface MessageIndex {
  container: HTMLElement | null;
  /** Mounted rows in document order. */
  entries: MessageIndexEntry[];
  /** Position → element. */
  elementByIndex: Map<number, HTMLElement>;
  /** `entryId` → position. */
  indexByEntryId: Map<string, number>;
  /** `data-conversation-turn` → position. */
  indexByTurn: Map<number, number>;
  /** Turn anchors sorted by `offsetTop`, for the navigator's active search. */
  turnEntries: TurnAnchor[];
  /** Average mounted row height, used to estimate rows that are not mounted. */
  averageHeight: number;
  /** `scrollHeight` at build time. */
  contentHeight: number;
  /** Monotonic build counter (handy in tests and for cache checks). */
  revision: number;
  builtAt: number;
}

export interface ViewportEntry {
  /** Position in the index (mounted order). */
  position: number;
  entryId: string | null;
  /** The row element is mounted and part of this index. */
  mounted: boolean;
  /** Geometry was interpolated because the row is not mounted. */
  estimated: boolean;
  offsetTop: number;
  height: number;
  /** `offsetTop - scrollTop`: 0 at the scrollport's top edge, negative above it. */
  top: number;
  bottom: number;
  visible: boolean;
}

export interface ScrollToEntryOptions {
  /** Pixels of content to leave above the row (default `DEFAULT_SCROLL_OFFSET`). */
  offset?: number;
  behavior?: ScrollBehavior;
}

/** Distance from the scrollport's top edge used by the find bar's jump. */
export const DEFAULT_SCROLL_OFFSET = 72;
/** The navigator treats the row 28px below the scrollport's top edge as "current". */
export const ACTIVE_TURN_PROBE = 28;
/** Minimum spacing between two mutation-driven rebuilds (streaming safety). */
export const MIN_REBUILD_INTERVAL_MS = 200;
/** How old a cached index may be before a detached lookup rebuilds it. */
const MAX_DETACHED_INDEX_AGE_MS = 200;

let revisionCounter = 0;

const watchers = new WeakMap<HTMLElement, Watcher>();
const detached = new WeakMap<HTMLElement, MessageIndex>();
const rowCache = new WeakMap<HTMLElement, Map<string, { height: number; turn: number | null }>>();
const configuredEntries = new WeakMap<HTMLElement, {
  entryIds: readonly string[];
  turnByEntryId?: ReadonlyMap<string, number>;
}>();

const DETACHED_ROW_ELEMENT = Object.freeze({
  isConnected: false,
  dataset: Object.freeze({}),
}) as unknown as HTMLElement;

function getContainerRowCache(container: HTMLElement): Map<string, { height: number; turn: number | null }> {
  let cache = rowCache.get(container);
  if (!cache) {
    cache = new Map();
    rowCache.set(container, cache);
  }
  return cache;
}

/** Record or update a row's measured height in the container's geometry cache. */
export function recordRowHeight(
  container: HTMLElement | null,
  entryId: string | null | undefined,
  height: number,
  turn?: number | null,
): void {
  if (!container || !entryId || !Number.isFinite(height) || height <= 0) return;
  const cache = getContainerRowCache(container);
  const previous = cache.get(entryId);
  cache.set(entryId, {
    height,
    turn: turn !== undefined ? turn : (previous?.turn ?? null),
  });
}

/** Read a row's cached height if it was previously mounted in `container`. */
export function getCachedRowHeight(
  container: HTMLElement | null,
  entryId: string | null | undefined,
): number | undefined {
  if (!container || !entryId) return undefined;
  return rowCache.get(container)?.get(entryId)?.height;
}

/**
 * Configure the full ordered `entryIds` list (and optional `entryId -> turn` map)
 * for a virtualized container so `buildIndex(container)` can interpolate geometry
 * for unmounted rows. Passing an empty list clears the configuration.
 */
export function setIndexedEntries(
  container: HTMLElement | null,
  entryIds: readonly string[] | null | undefined,
  turnByEntryId?: ReadonlyMap<string, number>,
): void {
  if (!container) return;
  if (!entryIds || entryIds.length === 0) {
    configuredEntries.delete(container);
  } else {
    configuredEntries.set(container, { entryIds, turnByEntryId });
  }
  invalidateIndex(container);
}

function now(): number {
  return Date.now();
}

function emptyIndex(container: HTMLElement | null): MessageIndex {
  return {
    container,
    entries: [],
    elementByIndex: new Map(),
    indexByEntryId: new Map(),
    indexByTurn: new Map(),
    turnEntries: [],
    averageHeight: 0,
    contentHeight: 0,
    revision: ++revisionCounter,
    builtAt: now(),
  };
}

function escapeAttributeValue(value: string): string {
  const css = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS;
  if (css?.escape) return css.escape(value);
  // entry ids are short hex-ish strings; this only has to survive quotes.
  return value.replace(/["\\\n\r]/g, (character) => `\\${character}`);
}

function selectorForEntry(entryId: string): string {
  return `[data-entry-id="${escapeAttributeValue(entryId)}"]`;
}

/**
 * Distances from the container's content origin, accumulated along the
 * `offsetParent` chain. `offsetTop` is a layout value: scrolling the container
 * does not change it, and reading `offsetTop`/`offsetHeight` is what the browser
 * already has to do once per build.
 */
function chainOffsets(container: HTMLElement, elements: readonly HTMLElement[]): Map<HTMLElement, number> {
  const chain = new Map<HTMLElement, number>();
  const absoluteTop = (element: HTMLElement): number => {
    const cached = chain.get(element);
    if (cached !== undefined) return cached;
    const parent = element.offsetParent as HTMLElement | null;
    const value = element.offsetTop + (parent ? absoluteTop(parent) : 0);
    chain.set(element, value);
    return value;
  };
  const base = absoluteTop(container);
  const offsets = new Map<HTMLElement, number>();
  for (const element of elements) offsets.set(element, absoluteTop(element) - base);
  return offsets;
}

function rectOffsets(container: HTMLElement, elements: readonly HTMLElement[]): Map<HTMLElement, number> {
  const containerTop = container.getBoundingClientRect().top;
  const scrollTop = container.scrollTop;
  const offsets = new Map<HTMLElement, number>();
  for (const element of elements) {
    offsets.set(element, element.getBoundingClientRect().top - containerTop + scrollTop);
  }
  return offsets;
}

/**
 * `offsetTop`-chain offsets, validated against one rect measurement. When the
 * container is not on the chain (a `position: fixed` row, a transformed
 * ancestor) the whole build falls back to rects — still once per build, never
 * per frame.
 */
function measureOffsets(container: HTMLElement, elements: readonly HTMLElement[]): Map<HTMLElement, number> {
  if (elements.length === 0) return new Map();
  const offsets = chainOffsets(container, elements);
  const sample = elements[0];
  const viaChain = offsets.get(sample);
  const viaRect = rectOffsets(container, [sample]).get(sample);
  if (viaChain === undefined || viaRect === undefined || Math.abs(viaChain - viaRect) > 1) {
    return rectOffsets(container, elements);
  }
  return offsets;
}

/** Rebuild the index for a container. Call this on message/mount/resize changes. */
export function buildIndex(
  container: HTMLElement | null,
  entryIds?: readonly string[],
  turnByEntryId?: ReadonlyMap<string, number>,
): MessageIndex {
  if (!container) return emptyIndex(null);
  const nodes = container.querySelectorAll<HTMLElement>("[data-entry-id]");
  const rows: { entryId: string; element: HTMLElement; turn: number | null }[] = [];
  const seen = new Set<string>();
  for (const element of nodes) {
    const entryId = element.dataset.entryId;
    // Nested rows repeat an ancestor's id (a timeline step inside its message
    // row); the outer one owns the id, exactly like a single querySelector.
    if (!entryId || seen.has(entryId)) continue;
    seen.add(entryId);
    const rawTurn = element.dataset.conversationTurn;
    const turn = rawTurn === undefined || rawTurn === "" ? null : Number(rawTurn);
    rows.push({ entryId, element, turn: turn !== null && Number.isFinite(turn) ? turn : null });
  }

  const offsets = measureOffsets(container, rows.map((row) => row.element));
  const mountedEntries: MessageIndexEntry[] = rows.map((row) => ({
    entryId: row.entryId,
    element: row.element,
    offsetTop: offsets.get(row.element) ?? 0,
    height: row.element.offsetHeight,
    turn: row.turn,
  }));

  const cache = getContainerRowCache(container);
  let mountedTotalHeight = 0;
  for (const entry of mountedEntries) {
    mountedTotalHeight += entry.height;
    if (entry.height > 0 || !cache.has(entry.entryId)) {
      cache.set(entry.entryId, { height: entry.height, turn: entry.turn });
    } else if (entry.turn !== null) {
      const prev = cache.get(entry.entryId)!;
      cache.set(entry.entryId, { height: prev.height, turn: entry.turn });
    }
  }

  const configured = configuredEntries.get(container);
  const fullEntryIds = entryIds ?? configured?.entryIds;
  const fullTurns = turnByEntryId ?? configured?.turnByEntryId;

  let averageHeight = mountedEntries.length > 0 ? mountedTotalHeight / mountedEntries.length : 0;
  if (averageHeight <= 0 && cache.size > 0) {
    let cachedSum = 0;
    let cachedCount = 0;
    for (const item of cache.values()) {
      if (item.height > 0) {
        cachedSum += item.height;
        cachedCount += 1;
      }
    }
    if (cachedCount > 0) averageHeight = cachedSum / cachedCount;
  }

  let entries: MessageIndexEntry[];
  if (!fullEntryIds || fullEntryIds.length === 0) {
    entries = mountedEntries;
  } else {
    const mountedById = new Map<string, MessageIndexEntry>();
    for (const entry of mountedEntries) mountedById.set(entry.entryId, entry);
    const orderedIds: string[] = [];
    const seenIds = new Set<string>();
    for (const id of fullEntryIds) {
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      orderedIds.push(id);
    }
    for (const entry of mountedEntries) {
      if (!seenIds.has(entry.entryId)) {
        seenIds.add(entry.entryId);
        orderedIds.push(entry.entryId);
      }
    }
    const fallbackHeight = averageHeight > 0 ? averageHeight : 120;
    entries = orderedIds.map((entryId) => {
      const mounted = mountedById.get(entryId);
      if (mounted) {
        const turn = mounted.turn ?? fullTurns?.get(entryId) ?? null;
        return turn === mounted.turn ? mounted : { ...mounted, turn };
      }
      const cached = cache.get(entryId);
      const height = cached && cached.height > 0 ? cached.height : fallbackHeight;
      const turn = fullTurns?.get(entryId) ?? cached?.turn ?? null;
      return {
        entryId,
        element: DETACHED_ROW_ELEMENT,
        offsetTop: 0,
        height,
        turn,
      };
    });

    // Interpolate offsetTop for unmounted entries around mounted anchors.
    const firstMountedIdx = entries.findIndex((entry) => isLiveEntry(entry));
    if (firstMountedIdx === -1) {
      let cursor = 0;
      for (const entry of entries) {
        entry.offsetTop = cursor;
        cursor += entry.height;
      }
    } else {
      let backCursor = entries[firstMountedIdx].offsetTop;
      for (let i = firstMountedIdx - 1; i >= 0; i -= 1) {
        backCursor = Math.max(0, backCursor - entries[i].height);
        entries[i].offsetTop = backCursor;
      }
      let forwardCursor = entries[firstMountedIdx].offsetTop + entries[firstMountedIdx].height;
      for (let i = firstMountedIdx + 1; i < entries.length; i += 1) {
        const entry = entries[i];
        if (isLiveEntry(entry)) {
          forwardCursor = entry.offsetTop + entry.height;
        } else {
          entry.offsetTop = forwardCursor;
          forwardCursor += entry.height;
        }
      }
    }
  }

  const index = emptyIndex(container);
  index.entries = entries;
  let totalHeight = 0;
  entries.forEach((entry, position) => {
    if (isLiveEntry(entry)) index.elementByIndex.set(position, entry.element);
    index.indexByEntryId.set(entry.entryId, position);
    if (entry.turn !== null) index.indexByTurn.set(entry.turn, position);
    totalHeight += entry.height;
  });
  index.turnEntries = entries
    .filter((entry) => entry.turn !== null)
    .map((entry) => ({ turn: entry.turn as number, position: index.indexByEntryId.get(entry.entryId) ?? 0, offsetTop: entry.offsetTop }))
    .sort((a, b) => a.offsetTop - b.offsetTop);
  index.averageHeight = averageHeight > 0 ? averageHeight : (entries.length > 0 ? totalHeight / entries.length : 0);
  index.contentHeight = container.scrollHeight;
  index.builtAt = now();
  if (!watchers.has(container)) detached.set(container, index);
  return index;
}

/** `true` while the cached element still is the row for this entry. */
function isLiveEntry(entry: MessageIndexEntry): boolean {
  const element = entry.element;
  return element.isConnected !== false && element.dataset.entryId === entry.entryId;
}

/**
 * `true` when something changed since the last build (a row mounted, a group
 * opened, a page was prepended) and the cached offsets may be out of date.
 * A detached index (nobody is watching it) counts as stale once its short TTL
 * ran out.
 */
export function indexIsStale(container: HTMLElement | null): boolean {
  if (!container) return true;
  const watcher = watchers.get(container);
  if (watcher) return watcher.dirty;
  const cached = detached.get(container);
  return !cached || now() - cached.builtAt >= MAX_DETACHED_INDEX_AGE_MS;
}

export function indexOfEntry(index: MessageIndex, entryId: string | null | undefined): number | undefined {
  if (!entryId) return undefined;
  return index.indexByEntryId.get(entryId);
}

export function indexOfTurn(index: MessageIndex, turn: number | null | undefined): number | undefined {
  if (turn === null || turn === undefined || !Number.isFinite(turn)) return undefined;
  return index.indexByTurn.get(turn);
}

export function entryAt(index: MessageIndex, position: number): MessageIndexEntry | null {
  if (!Number.isFinite(position) || position < 0) return null;
  return index.entries[position] ?? null;
}

/** The mounted element for a position, or `null` when it is not mounted (anymore). */
export function elementOf(index: MessageIndex, position: number): HTMLElement | null {
  const entry = entryAt(index, position);
  if (!entry || !isLiveEntry(entry)) return null;
  return entry.element;
}

/** The mounted element for an entry id, or `null`. */
export function elementForEntry(container: HTMLElement | null, entryId: string | null | undefined): HTMLElement | null {
  if (!container || !entryId) return null;
  const index = messageIndex(container);
  const cached = elementOf(index, indexOfEntry(index, entryId) ?? -1);
  if (cached) return cached;
  // Not in the index (a group that just opened, a row mounted after the last
  // build): one attribute query instead of re-scanning the transcript.
  return container.querySelector<HTMLElement>(selectorForEntry(entryId));
}

function estimateGeometry(index: MessageIndex, position: number): { offsetTop: number; height: number } {
  const entries = index.entries;
  const height = index.averageHeight > 0 ? index.averageHeight : 0;
  if (entries.length === 0) return { offsetTop: 0, height };
  if (position >= entries.length) {
    const last = entries[entries.length - 1];
    return { offsetTop: last.offsetTop + last.height + (position - entries.length) * height, height };
  }
  if (position <= 0) return { offsetTop: entries[0].offsetTop - (0 - position + 1) * height, height };
  const previous = entries[position - 1];
  return { offsetTop: previous.offsetTop + previous.height, height };
}

/** Where a position sits relative to the scrollport, from cached offsets only. */
export function viewportEntry(container: HTMLElement | null, position: number): ViewportEntry {
  if (!container) {
    return { position, entryId: null, mounted: false, estimated: true, offsetTop: 0, height: 0, top: 0, bottom: 0, visible: false };
  }
  const index = messageIndex(container);
  const entry = entryAt(index, position);
  const mounted = Boolean(entry && isLiveEntry(entry));
  const geometry = entry
    ? { offsetTop: entry.offsetTop, height: entry.height }
    : estimateGeometry(index, position);
  const top = geometry.offsetTop - container.scrollTop;
  const bottom = top + geometry.height;
  return {
    position,
    entryId: entry ? entry.entryId : null,
    mounted,
    estimated: !mounted,
    offsetTop: geometry.offsetTop,
    height: geometry.height,
    top,
    bottom,
    visible: bottom > 0 && top < Math.max(container.clientHeight, 0),
  };
}

/** The turn whose anchor is closest to `offset` (content coordinates), if any. */
export function turnIndexAtOffset(container: HTMLElement | null, offset: number): number | null {
  if (!container) return null;
  const anchors = messageIndex(container).turnEntries;
  if (anchors.length === 0) return null;
  let low = 0;
  let high = anchors.length - 1;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const anchor = anchors[middle];
    const distance = Math.abs(anchor.offsetTop - offset);
    if (distance < bestDistance) {
      best = middle;
      bestDistance = distance;
    }
    if (anchor.offsetTop < offset) low = middle + 1;
    else if (anchor.offsetTop > offset) high = middle - 1;
    else break;
  }
  // Compare the insertion neighbours too: binary search may stop one short of
  // the nearest anchor when several share an offset.
  for (const candidate of [best - 1, best + 1]) {
    if (candidate < 0 || candidate >= anchors.length) continue;
    const distance = Math.abs(anchors[candidate].offsetTop - offset);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return anchors[best].turn;
}

/**
 * Scroll the container so the row sits `offset` px below the top edge. Uses the
 * cached offset when the index is fresh (no DOM query, no layout read), and one
 * rect measurement — the old cost — when the row mounted just now or the index
 * was invalidated (a prepended page or an opened group moves every row below
 * it, so a jump right after one must not trust the cache).
 */
export function scrollToEntry(
  container: HTMLElement | null,
  entryId: string | null | undefined,
  options: ScrollToEntryOptions = {},
): boolean {
  if (!container || !entryId) return false;
  const element = elementForEntry(container, entryId);
  const index = messageIndex(container);
  const position = indexOfEntry(index, entryId);
  const entry = position === undefined ? null : entryAt(index, position);
  if (!element) {
    if (!entry) return false;
    container.scrollTo({
      top: Math.max(0, entry.offsetTop - (options.offset ?? DEFAULT_SCROLL_OFFSET)),
      behavior: options.behavior ?? "smooth",
    });
    return true;
  }
  const useCache = Boolean(entry && entry.element === element && isLiveEntry(entry)) && !indexIsStale(container);
  const offsetTop = useCache && entry
    ? entry.offsetTop
    : element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  if (entry && entry.element === element && !useCache) {
    // Keep the cache warm for the row that just scrolled, so the following
    // lookup does not have to re-measure it.
    entry.offsetTop = offsetTop;
    entry.height = element.offsetHeight;
  }
  container.scrollTo({
    top: Math.max(0, offsetTop - (options.offset ?? DEFAULT_SCROLL_OFFSET)),
    behavior: options.behavior ?? "smooth",
  });
  return true;
}

interface Watcher {
  index: MessageIndex;
  listeners: Set<(index: MessageIndex) => void>;
  dirty: boolean;
  mutationObserver: MutationObserver | null;
  resizeObserver: ResizeObserver | null;
}

function rebuild(watcher: Watcher, notify: boolean): void {
  const container = watcher.index.container;
  if (!container) return;
  watcher.index = buildIndex(container);
  watcher.dirty = false;
  if (!notify) return;
  for (const listener of watcher.listeners) listener(watcher.index);
}

function createWatcher(container: HTMLElement): Watcher {
  const watcher: Watcher = {
    index: buildIndex(container),
    listeners: new Set(),
    dirty: false,
    mutationObserver: null,
    resizeObserver: null,
  };
  const MutationObserverCtor = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;
  if (MutationObserverCtor) {
    watcher.mutationObserver = new MutationObserverCtor(() => {
      // Only a flag: the next lookup decides whether a rebuild is due.
      watcher.dirty = true;
    });
    watcher.mutationObserver.observe(container, { childList: true, subtree: true, characterData: true });
  }
  const ResizeObserverCtor = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  if (ResizeObserverCtor) {
    let skipInitial = true;
    watcher.resizeObserver = new ResizeObserverCtor(() => {
      // The first callback arrives right after `observe()` and would duplicate
      // the build above.
      if (skipInitial) {
        skipInitial = false;
        return;
      }
      rebuild(watcher, true);
    });
    watcher.resizeObserver.observe(container);
  }
  return watcher;
}

function disposeWatcher(container: HTMLElement, watcher: Watcher): void {
  watcher.mutationObserver?.disconnect();
  watcher.resizeObserver?.disconnect();
  watcher.mutationObserver = null;
  watcher.resizeObserver = null;
  watcher.listeners.clear();
  watchers.delete(container);
  detached.delete(container);
}

/** The current index for a container; rebuilds lazily when it went stale. */
export function messageIndex(container: HTMLElement | null): MessageIndex {
  if (!container) return emptyIndex(null);
  const watcher = watchers.get(container);
  if (!watcher) {
    const cached = detached.get(container);
    if (cached && now() - cached.builtAt < MAX_DETACHED_INDEX_AGE_MS) return cached;
    const built = buildIndex(container);
    detached.set(container, built);
    return built;
  }
  if (watcher.dirty && now() - watcher.index.builtAt >= MIN_REBUILD_INTERVAL_MS) rebuild(watcher, true);
  return watcher.index;
}

/**
 * Keep an index for `container` fresh while a component uses it.
 *
 * Subscribing rebuilds once (the caller usually wants fresh geometry right
 * after mount), then mutations mark the index dirty and resizes rebuild it.
 * `listener` runs after every rebuild the watcher performs itself.
 */
export function watchMessageIndex(
  container: HTMLElement,
  listener?: (index: MessageIndex) => void,
): { index: MessageIndex; dispose: () => void } {
  let watcher = watchers.get(container);
  if (!watcher) {
    watcher = createWatcher(container);
    watchers.set(container, watcher);
  } else {
    // Subscribing is one of the "mount changed" moments: take a fresh build so
    // a component that just opened never starts from stale offsets.
    rebuild(watcher, false);
  }
  if (listener) watcher.listeners.add(listener);
  const shared = watcher;
  return {
    index: shared.index,
    dispose: () => {
      if (listener) shared.listeners.delete(listener);
      if (shared.listeners.size === 0) disposeWatcher(container, shared);
    },
  };
}

/** Mark the index stale without rebuilding yet (e.g. after a known mount change). */
export function invalidateIndex(container: HTMLElement | null): void {
  if (!container) return;
  const watcher = watchers.get(container);
  if (watcher) {
    watcher.dirty = true;
    return;
  }
  detached.delete(container);
}
