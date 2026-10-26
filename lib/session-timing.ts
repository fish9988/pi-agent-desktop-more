interface TimingEntry {
  id?: string;
  type: string;
  timestamp: string;
  message?: { role?: string };
}

interface TimingEntriesSource {
  getEntries(): unknown[];
}

interface CachedSessionTiming {
  length: number;
  lastEntryId: string | undefined;
  previousTimestamp: number | undefined;
  totalActiveMs: number;
}

const activeMsBySession = new WeakMap<TimingEntriesSource, CachedSessionTiming>();

/**
 * Estimate active wall-clock time from the append-only session log.
 *
 * Raw entries preserve compacted history and every executed branch exactly
 * once. Gaps ending at user messages are treated as human idle. User-initiated
 * bash entries are also boundaries because the log records only their finish
 * time, so counting the incoming gap could include arbitrary human idle.
 */
export function computeSessionTotalActiveMs(entries: readonly TimingEntry[]): number {
  let totalActiveMs = 0;
  let previousTimestamp: number | undefined;

  for (const entry of entries) {
    if (!isTimingEntry(entry.type)) continue;

    const timestamp = Date.parse(entry.timestamp);
    if (!Number.isFinite(timestamp)) continue;

    const role = entry.type === "message" ? entry.message?.role : undefined;
    if (role === "user" || role === "bashExecution") {
      previousTimestamp = timestamp;
      continue;
    }

    if (previousTimestamp !== undefined && timestamp > previousTimestamp) {
      totalActiveMs += timestamp - previousTimestamp;
    }
    previousTimestamp = timestamp;
  }

  return totalActiveMs;
}

/**
 * Incremental {@link computeSessionTotalActiveMs} for a live `SessionManager`.
 *
 * `get_state` runs on every status poll while a prompt streams; scanning only
 * the entries appended since the last call keeps the poll O(new entries). Any
 * non-append change (fewer entries or a replaced prefix) falls back to a full
 * scan.
 */
export function computeLiveSessionTotalActiveMs(manager: TimingEntriesSource): number {
  if (typeof manager?.getEntries !== "function") return 0;
  const entries = manager.getEntries() as readonly TimingEntry[];
  const cached = activeMsBySession.get(manager);
  if (
    cached
    && entries.length >= cached.length
    && (cached.length === 0 || entries[cached.length - 1]?.id === cached.lastEntryId)
  ) {
    let { previousTimestamp, totalActiveMs } = cached;
    for (let i = cached.length; i < entries.length; i++) {
      const entry = entries[i];
      if (!isTimingEntry(entry.type)) continue;
      const timestamp = Date.parse(entry.timestamp);
      if (!Number.isFinite(timestamp)) continue;
      const role = entry.type === "message" ? entry.message?.role : undefined;
      if (role !== "user" && role !== "bashExecution" && previousTimestamp !== undefined && timestamp > previousTimestamp) {
        totalActiveMs += timestamp - previousTimestamp;
      }
      previousTimestamp = timestamp;
    }
    activeMsBySession.set(manager, {
      length: entries.length,
      lastEntryId: entries[entries.length - 1]?.id,
      previousTimestamp,
      totalActiveMs,
    });
    return totalActiveMs;
  }

  let totalActiveMs = 0;
  let previousTimestamp: number | undefined;
  for (const entry of entries) {
    if (!isTimingEntry(entry.type)) continue;
    const timestamp = Date.parse(entry.timestamp);
    if (!Number.isFinite(timestamp)) continue;
    const role = entry.type === "message" ? entry.message?.role : undefined;
    if (role !== "user" && role !== "bashExecution" && previousTimestamp !== undefined && timestamp > previousTimestamp) {
      totalActiveMs += timestamp - previousTimestamp;
    }
    previousTimestamp = timestamp;
  }
  activeMsBySession.set(manager, {
    length: entries.length,
    lastEntryId: entries[entries.length - 1]?.id,
    previousTimestamp,
    totalActiveMs,
  });
  return totalActiveMs;
}

function isTimingEntry(type: string): boolean {
  return type === "message"
    || type === "compaction"
    || type === "branch_summary"
    || type === "custom_message";
}

interface TimedMessage {
  role?: string;
  timestamp?: number;
}

/**
 * Active time kept current while a session runs (upstream pi-web #1334): the
 * server's total covers the snapshot that was loaded; messages that arrived
 * since (newer than the newest loaded one) add their own gaps, by the same
 * rules as computeSessionTotalActiveMs.
 */
export function liveSessionActiveMs(
  snapshotMs: number | undefined,
  loadedMessages: readonly TimedMessage[],
  currentMessages: readonly TimedMessage[],
): number | undefined {
  if (snapshotMs === undefined) return undefined;
  const time = (message: TimedMessage) => (typeof message.timestamp === "number" ? message.timestamp : Number.NaN);
  let newest = Number.NEGATIVE_INFINITY;
  for (const message of loadedMessages) {
    const t = time(message);
    if (t > newest) newest = t;
  }
  if (!Number.isFinite(newest)) return snapshotMs;
  const fresh = currentMessages.filter((message) => time(message) > newest).sort((a, b) => time(a) - time(b));
  if (fresh.length === 0) return snapshotMs;
  const entries: TimingEntry[] = [
    { type: "message", timestamp: new Date(newest).toISOString(), message: { role: "assistant" } },
    ...fresh.map((message) => ({ type: "message", timestamp: new Date(time(message)).toISOString(), message: { role: message.role } })),
  ];
  return snapshotMs + computeSessionTotalActiveMs(entries);
}
