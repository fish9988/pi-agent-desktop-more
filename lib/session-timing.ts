interface TimingEntry {
  type: string;
  timestamp: string;
  message?: { role?: string };
}

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
