// Read-only fast path for opening very large session files.
//
// Browser-automation tools persist a full DOM outline in a tool result's
// `details` (measured: 120 of 129 MB in one session file). The UI never reads
// those fields (lib/tool-result-details.ts), yet `SessionManager.open()` decodes
// and JSON.parses every byte of them: ~650 ms and ~270 MB of transient heap for
// that file. This loader cuts the `details` span out of an oversized tool-result
// line *as bytes*, before decoding, so the dead payload is never turned into a
// string or an object graph.
//
// Only the read-only cached view uses it (`openSessionManager` without
// `mutable`): the manager it builds has persist=false, so a slimmed entry can
// never be written back over the real file.
//
// Every shortcut is verified and falls back to a plain parse of the whole line,
// so a surprising line shape costs speed, never correctness.

import { readFileSync, statSync } from "fs";
import { open, stat } from "fs/promises";
import { dirname, resolve } from "path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

/** Lines shorter than this are parsed as-is; the strip only pays off on big ones. */
const SLIM_MIN_LINE_BYTES = 32 * 1024;
/** Files below this size keep the SDK's own open path. */
export const SLIM_LOAD_MIN_FILE_BYTES = 2 * 1024 * 1024;
/**
 * Ceiling for the *synchronous* loader only: it reads the file into one Buffer,
 * so a bigger file would have to be materialized whole. The cooperative loader
 * streams instead and has no size ceiling — a >1 GB session used to fall back to
 * `SessionManager.open()`, which parses the entire file without a single yield.
 */
const SLIM_LOAD_MAX_FILE_BYTES = 1024 * 1024 * 1024;
/** `"role":"toolResult"` sits right after the first few short keys. */
const ROLE_PROBE_BYTES = 1024;
/** Async reader chunk size: a read plus one chunk's line work stays well under 10 ms. */
const ASYNC_READ_CHUNK_BYTES = 1024 * 1024;
/** Cooperative reader yields after roughly this much synchronous line work. */
const ASYNC_YIELD_INTERVAL_MS = 1;
/**
 * A line at least this big is parsed on a fresh event-loop turn. Its cost can
 * only be paid whole (a JSON text cannot be parsed in pieces), but it must not
 * be *added* to the work that came before it in the same turn.
 */
const BIG_LINE_YIELD_BYTES = 256 * 1024;
/**
 * Beyond this, one line may carry megabytes of *live* content (tool-result
 * text, base64 image data) that `details` stripping cannot touch. Such a line
 * goes through a cooperative path: an oversized `text` value is cut and marked
 * (see trimOversizedTextValuesSteps) so the unavoidable `JSON.parse` stays
 * bounded, and every phase runs on its own event-loop turn. Image payloads are
 * never cut — the lazy image route serves them.
 */
export const OVERSIZE_LINE_BYTES = 8 * 1024 * 1024;
/** Longest `"text"` value kept verbatim inside one oversized line. */
export const MAX_TEXT_FIELD_BYTES = 2 * 1024 * 1024;
/**
 * Where the oversized `text` key is looked for. A live value is a content block
 * of the message, so its key sits in the first few hundred bytes; a key outside
 * this window means a details-heavy line, which the details path handles.
 */
const OVERSIZE_TEXT_PROBE_BYTES = 64 * 1024;
/** At most this many text values are cut in one line. */
const MAX_TRIMMED_TEXT_VALUES = 4;
/** Rebuilding the line must free at least this much, or the plain parse runs. */
const MIN_TRIMMED_SAVING_BYTES = 1024 * 1024;

const MESSAGE_KEYS = new Set(["role", "toolCallId", "toolName", "content", "details", "isError", "timestamp"]);

const ROLE_TOOL_RESULT = Buffer.from('"role":"toolResult"');
const CONTENT_KEY = Buffer.from('"content":');
const DETAILS_KEY = Buffer.from('"details":');
const IS_ERROR_KEY = Buffer.from(',"isError":');
const TIMESTAMP_KEY = Buffer.from(',"timestamp":');
const TEXT_KEY = Buffer.from('"text":');
// Details the UI renders must survive (KEPT_DETAIL_KEYS + subagent cards in
// lib/tool-result-details.ts). Seeing any of them means "use the normal path".
// Tested on a latin1 view of the span: ASCII bytes map 1:1, so this cannot miss
// a marker, and one regex pass is ~6x faster than five Buffer.indexOf scans
// (short, quote-led needles hit `"` on every few bytes of DOM-outline JSON).
const KEPT_DETAIL_MARKERS = /"(?:patch|diff|preview|result)":|"pi-web-subagent"/;

type RawEntry = Record<string, unknown>;

function parseLine(text: string): RawEntry | null {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as RawEntry;
  } catch {
    return null; // malformed lines are skipped, matching the SDK loader
  }
}

/**
 * The line without its `details` value, or null when it is not a plain
 * tool-result message or carries details the UI needs. Works on `buf[start, end)`.
 */
function stripDetails(buf: Buffer, start: number, end: number): string | null {
  const line = buf.subarray(start, end);

  const roleAt = line.indexOf(ROLE_TOOL_RESULT);
  if (roleAt < 0 || roleAt > ROLE_PROBE_BYTES) return null;

  const detailsAt = line.indexOf(DETAILS_KEY);
  if (detailsAt <= 0 || line[detailsAt - 1] !== 0x2c) return null;
  const contentAt = line.indexOf(CONTENT_KEY);
  if (contentAt < 0 || contentAt > detailsAt) return null;

  // `isError` / `timestamp` are the keys pi writes after `details`; the last
  // occurrence of each is the message-level one, the first byte after the value.
  let tailAt = line.lastIndexOf(IS_ERROR_KEY);
  if (tailAt < detailsAt) tailAt = line.lastIndexOf(TIMESTAMP_KEY);
  if (tailAt < detailsAt) return null;

  if (KEPT_DETAIL_MARKERS.test(line.toString("latin1", detailsAt, tailAt))) return null;

  return line.toString("utf8", 0, detailsAt - 1) + line.toString("utf8", tailAt);
}

function isPlainSlimmedToolResult(entry: RawEntry | null): entry is RawEntry {
  if (!entry || entry.type !== "message") return false;
  const message = entry.message as RawEntry | undefined;
  if (!message || message.role !== "toolResult" || "details" in message) return false;
  if (message.content === undefined) return false;
  for (const key of Object.keys(message)) {
    if (!MESSAGE_KEYS.has(key)) return false;
  }
  return true;
}

/** One JSON string value that gets cut, in the coordinate space of the line. */
interface TrimmableStringSpan {
  contentStart: number;
  contentEnd: number;
  /** Where to stop keeping bytes: never inside an escape sequence or a UTF-8 character. */
  keepEnd: number;
}

/** Bytes of a giant value examined per event-loop turn. */
const SCAN_WINDOW_BYTES = 1024 * 1024;

/**
 * End of a JSON string value that starts at `from`, or -1 when it is
 * unterminated. Scans window by window and yields once per window of progress,
 * so walking 30 MB of text is never one turn's work.
 */
function* findJsonStringEndSteps(line: Buffer, from: number): Generator<void, number, void> {
  let position = from;
  let nextYieldAt = from + SCAN_WINDOW_BYTES;
  while (position < line.length) {
    const windowEnd = Math.min(line.length, position + SCAN_WINDOW_BYTES);
    const window = line.subarray(position, windowEnd);
    const quoteRel = window.indexOf(0x22);
    const backslashRel = window.indexOf(0x5c);
    const quote = quoteRel < 0 ? -1 : position + quoteRel;
    const backslash = backslashRel < 0 ? -1 : position + backslashRel;
    // No escape before the quote: that quote closes the string.
    if (quote >= 0 && (backslash < 0 || quote < backslash)) return quote;
    if (backslash < 0) {
      position = windowEnd;
      yield;
      nextYieldAt = position + SCAN_WINDOW_BYTES;
      continue;
    }
    // Step over the escape token; it may run past the window edge.
    position = backslash + (line[backslash + 1] === 0x75 ? 6 : 2);
    if (position >= nextYieldAt) {
      yield;
      nextYieldAt = position + SCAN_WINDOW_BYTES;
    }
  }
  return -1;
}

/**
 * Locate one `"text"` value and decide where a cut is safe. `keepEnd` is the
 * last position at or below `limit` bytes that does not split an escape
 * sequence (`\\n`, `\\uXXXX`) or a multi-byte UTF-8 character.
 */
function* scanOversizedStringSteps(
  line: Buffer,
  quoteAt: number,
  limit: number,
): Generator<void, TrimmableStringSpan | null, void> {
  const contentStart = quoteAt + 1;
  const limitAt = contentStart + limit;
  let position = contentStart;
  let keepEnd = contentStart;
  let nextYieldAt = contentStart + SCAN_WINDOW_BYTES;

  while (position < line.length) {
    const windowEnd = Math.min(line.length, position + SCAN_WINDOW_BYTES);
    const window = line.subarray(position, windowEnd);
    const quoteRel = window.indexOf(0x22);
    const backslashRel = window.indexOf(0x5c);
    const quote = quoteRel < 0 ? -1 : position + quoteRel;
    const backslash = backslashRel < 0 ? -1 : position + backslashRel;

    if (quote >= 0 && (backslash < 0 || quote < backslash)) {
      // Plain run up to the closing quote.
      let cut = Math.min(quote, limitAt);
      while (cut > contentStart && (line[cut] & 0xc0) === 0x80) cut -= 1;
      return { contentStart, contentEnd: quote, keepEnd: Math.max(keepEnd, cut) };
    }
    if (backslash < 0) {
      // Neither closed nor escaped inside this window: keep reading.
      position = windowEnd;
      yield;
      nextYieldAt = position + SCAN_WINDOW_BYTES;
      continue;
    }
    const tokenEnd = backslash + (line[backslash + 1] === 0x75 ? 6 : 2);
    if (tokenEnd > limitAt) {
      // Past the budget: only the end of the value still matters.
      const contentEnd = yield* findJsonStringEndSteps(line, tokenEnd);
      return contentEnd < 0 ? null : { contentStart, contentEnd, keepEnd };
    }
    keepEnd = tokenEnd;
    position = tokenEnd;
    if (position >= nextYieldAt) {
      yield;
      nextYieldAt = position + SCAN_WINDOW_BYTES;
    }
  }
  return null;
}

/**
 * Cut any single oversized `"text"` value in an oversized line and leave a
 * visible marker in its place. Returns null when nothing needed cutting.
 *
 * Only `text` blocks are touched: they are rendered as text, so a marked cut is
 * honest; image `data` (served by the lazy image route), `thinking` (served by
 * the deferred-thinking route) and kept `details` are left intact, and callers
 * verify the trimmed line still parses — if it does not, the untrimmed line is
 * parsed instead.
 *
 * A giant *live* value is a message content block, so its key sits in the first
 * few hundred bytes of the line. A key outside the probe window means a
 * details-heavy line instead: that case pays only the 64 KB probe and goes to
 * the details path, which cuts its span out as bytes anyway.
 */
function* trimOversizedTextValuesSteps(
  buf: Buffer,
  start: number,
  end: number,
): Generator<void, string | null, void> {
  const line = buf.subarray(start, end);
  const probeEnd = Math.min(line.length, OVERSIZE_TEXT_PROBE_BYTES);
  const firstKey = line.indexOf(TEXT_KEY, 0);
  if (firstKey < 0 || firstKey >= probeEnd) return null;

  const spans: TrimmableStringSpan[] = [];
  let searchAt = firstKey;

  while (searchAt < line.length && spans.length < MAX_TRIMMED_TEXT_VALUES) {
    const keyAt = line.indexOf(TEXT_KEY, searchAt);
    if (keyAt < 0) break;
    let quoteAt = keyAt + TEXT_KEY.length;
    while (quoteAt < line.length && line[quoteAt] === 0x20) quoteAt += 1;
    searchAt = keyAt + TEXT_KEY.length;
    if (line[quoteAt] !== 0x22) continue;
    const span = yield* scanOversizedStringSteps(line, quoteAt, MAX_TEXT_FIELD_BYTES);
    if (!span) continue;
    searchAt = span.contentEnd + 1;
    if (span.contentEnd - span.contentStart <= MAX_TEXT_FIELD_BYTES) continue;
    if (span.keepEnd <= span.contentStart) continue;
    spans.push(span);
  }
  if (spans.length === 0) return null;

  const parts: Buffer[] = [];
  let cursor = 0;
  let saved = 0;
  for (const span of spans) {
    const dropped = span.contentEnd - span.keepEnd;
    parts.push(line.subarray(cursor, span.keepEnd));
    // Inside a JSON string: the marker needs escaped newlines, nothing else.
    parts.push(Buffer.from(
      `\\n\\n[... pi-web truncated the remaining ${dropped} bytes of this text: one session line carried more than ${MAX_TEXT_FIELD_BYTES / (1024 * 1024)} MB of live content ...]`,
      "utf8",
    ));
    saved += dropped;
    cursor = span.contentEnd;
  }
  // Not worth rebuilding unless a real amount of bytes goes away.
  if (saved < MIN_TRIMMED_SAVING_BYTES) return null;
  parts.push(line.subarray(cursor));
  return Buffer.concat(parts).toString("utf8");
}

/**
 * One JSONL line, with oversized dead `details` stripped and (only for a line
 * that is still enormous afterwards) oversized live text values cut + marked.
 *
 * A `yield` is a resume point: the synchronous driver drains it, and the
 * cooperative driver turns it into a real event-loop turn. The order matters —
 * the trim probe runs *before* the `details` scan because it is bounded to the
 * head of the line, so a details-heavy line pays just the 64 KB probe, while a
 * text-heavy line avoids the full-line `details` scan that used to run first and
 * fail. `details` is then stripped from the (small) trimmed line, and every
 * shortcut is verified by parsing — a surprising shape falls back to parsing
 * the untouched line.
 *
 * Only lines at or above OVERSIZE_LINE_BYTES come here: an ordinary line's worst
 * case (decode + parse of a few MB) is already inside the read path's budget, so
 * the common case pays neither a generator nor an extra scan.
 */
function* parseOversizedLineSteps(
  buf: Buffer,
  start: number,
  end: number,
): Generator<void, RawEntry | null, void> {
  const trimmed = yield* trimOversizedTextValuesSteps(buf, start, end);
  if (trimmed !== null) {
    // Each of these is a separate turn: none of them is allowed to stack on the
    // next (decode of the trimmed line, its `details` strip, its parse).
    yield;
    const small = Buffer.from(trimmed, "utf8");
    yield;
    const strippedSmall = stripDetails(small, 0, small.length);
    yield;
    const candidate = parseLine(strippedSmall ?? trimmed);
    if (candidate && typeof candidate.type === "string") return candidate;
  }

  // Nothing to cut (an image payload, or a `details` line too big to reach the
  // probe window): fall back to the ordinary path, but never let its `details`
  // scan and its decode+parse stack in one turn.
  yield;
  let entry: RawEntry | null = null;
  const stripped = stripDetails(buf, start, end);
  if (stripped !== null) {
    yield;
    const candidate = parseLine(stripped);
    if (isPlainSlimmedToolResult(candidate)) entry = candidate;
  }
  if (!entry) {
    yield;
    entry = parseLine(buf.toString("utf8", start, end));
  }
  return entry;
}

/** The ordinary line path: `details` strip for big lines, then decode + parse. */
function parseOrdinaryLine(buf: Buffer, start: number, end: number): RawEntry | null {
  let entry: RawEntry | null = null;
  if (end - start >= SLIM_MIN_LINE_BYTES) {
    const stripped = stripDetails(buf, start, end);
    if (stripped !== null) {
      const candidate = parseLine(stripped);
      if (isPlainSlimmedToolResult(candidate)) entry = candidate;
    }
  }
  if (!entry) entry = parseLine(buf.toString("utf8", start, end));
  return entry;
}

/** Synchronous line parse (same shortcut code, driven straight through). */
function parseSessionLineBuffer(buf: Buffer, start: number, end: number): RawEntry | null {
  if (end - start < OVERSIZE_LINE_BYTES) return parseOrdinaryLine(buf, start, end);
  const steps = parseOversizedLineSteps(buf, start, end);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Cooperative line parse: yields between scan windows and between phases. */
async function parseSessionLineBufferAsync(buf: Buffer, start: number, end: number): Promise<RawEntry | null> {
  if (end - start < OVERSIZE_LINE_BYTES) return parseOrdinaryLine(buf, start, end);
  const steps = parseOversizedLineSteps(buf, start, end);
  let step = steps.next();
  while (!step.done) {
    await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
    step = steps.next();
  }
  return step.value;
}

/** Entries of a session file, with oversized dead tool-result details never parsed. */
export function loadSlimSessionEntries(buf: Buffer): RawEntry[] {
  const entries: RawEntry[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let end = buf.indexOf(0x0a, pos);
    if (end < 0) end = buf.length;
    const entry = parseSessionLineBuffer(buf, pos, end);
    if (entry) entries.push(entry);
    pos = end + 1;
  }
  return entries;
}

/**
 * Cooperative equivalent of loadSlimSessionEntries: reads the file in chunks
 * and yields to the event loop between chunks and after about 1 ms of line
 * work, so one large session cannot block SSE or other API routes.
 *
 * Lines are assembled as Buffers, never as one decoded string for the whole
 * file: the oversized dead `details` span is still stripped before decoding.
 */
export async function loadSlimSessionEntriesFromFile(
  filePath: string,
  options: { yieldIntervalMs?: number } = {},
): Promise<RawEntry[]> {
  const yieldIntervalMs = options.yieldIntervalMs ?? ASYNC_YIELD_INTERVAL_MS;
  const handle = await open(filePath, "r");
  try {
    const entries: RawEntry[] = [];
    const chunk = Buffer.allocUnsafe(ASYNC_READ_CHUNK_BYTES);
    let pendingParts: Buffer[] = [];
    let pendingBytes = 0;
    let lastYield = Date.now();

    const yieldIfDue = async (): Promise<void> => {
      if (Date.now() - lastYield < yieldIntervalMs) return;
      await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
      lastYield = Date.now();
    };

    /**
     * One line's parse cannot be interrupted in its innermost step (a JSON text
     * is indivisible), but it is split into windows and phases, each on its own
     * event-loop turn, so an oversized line never extends the turn that read it.
     */
    const parseLineCooperatively = async (lineBuf: Buffer): Promise<void> => {
      if (lineBuf.length >= BIG_LINE_YIELD_BYTES) {
        await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
      }
      const entry = await parseSessionLineBufferAsync(lineBuf, 0, lineBuf.length);
      lastYield = Date.now();
      if (entry) entries.push(entry);
    };

    while (true) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;

      let pos = 0;
      while (pos < bytesRead) {
        const newline = chunk.indexOf(0x0a, pos);
        if (newline < 0 || newline >= bytesRead) {
          // Copy: the read buffer is reused by the next iteration.
          if (pos < bytesRead) {
            const part = Buffer.from(chunk.subarray(pos, bytesRead));
            pendingParts.push(part);
            pendingBytes += part.length;
          }
          break;
        }

        let lineBuf: Buffer;
        if (pendingParts.length > 0) {
          const part = chunk.subarray(pos, newline);
          pendingParts.push(part);
          lineBuf = Buffer.concat(pendingParts, pendingBytes + part.length);
          pendingParts = [];
          pendingBytes = 0;
        } else {
          lineBuf = chunk.subarray(pos, newline);
        }
        await parseLineCooperatively(lineBuf);
        pos = newline + 1;
        await yieldIfDue();
      }
    }

    if (pendingBytes > 0) {
      const lineBuf = Buffer.concat(pendingParts, pendingBytes);
      await parseLineCooperatively(lineBuf);
    }
    await yieldIfDue();
    return entries;
  } finally {
    await handle.close();
  }
}

type SessionManagerCtor = new (
  cwd: string,
  sessionDir: string,
  sessionFile: string,
  persist: boolean,
  newSessionOptions: undefined,
  preloadedFileEntries: RawEntry[],
) => SessionManager;

function buildSlimSessionManager(resolved: string, entries: RawEntry[]): SessionManager | undefined {
  const header = entries[0];
  if (!header || header.type !== "session" || typeof header.id !== "string") return undefined;

  // persist=false: the manager can never rewrite or append to the real file.
  // The constructor is private in the typings but public at runtime;
  // session-slim-load.test.mjs pins this against SessionManager.open().
  const Ctor = SessionManager as unknown as SessionManagerCtor;
  const cwd = typeof header.cwd === "string" ? header.cwd : process.cwd();
  return new Ctor(cwd, dirname(resolved), resolved, false, undefined, entries);
}

/**
 * A read-only SessionManager for `filePath` built from slimmed entries, or
 * undefined when the file is not a good fit (small, huge, no valid header, or
 * the SDK constructor changed shape) — callers then use `SessionManager.open`.
 */
export function openSlimSessionManager(filePath: string): SessionManager | undefined {
  try {
    const resolved = resolve(filePath);
    const { size } = statSync(resolved);
    if (size < SLIM_LOAD_MIN_FILE_BYTES || size > SLIM_LOAD_MAX_FILE_BYTES) return undefined;

    return buildSlimSessionManager(resolved, loadSlimSessionEntries(readFileSync(resolved)));
  } catch {
    return undefined;
  }
}

/**
 * Cooperative counterpart of openSlimSessionManager. Same result shape, but
 * the file is streamed and the event loop is yielded regularly. Callers fall
 * back to the synchronous opener / SessionManager.open if this returns
 * undefined or throws.
 *
 * `minFileBytes: 0` lets read-only routes use this for every session size, not
 * just the oversized ones the synchronous slim path was written for.
 *
 * There is deliberately no upper size bound here: the loader reads in fixed
 * chunks and yields between them, so a session above the synchronous ceiling is
 * simply slow, not blocking — the old ceiling sent those files to a full
 * synchronous `SessionManager.open()` parse.
 */
export async function openSlimSessionManagerAsync(
  filePath: string,
  options: { minFileBytes?: number } = {},
): Promise<SessionManager | undefined> {
  try {
    const resolved = resolve(filePath);
    const { size } = await stat(resolved);
    const minFileBytes = options.minFileBytes ?? SLIM_LOAD_MIN_FILE_BYTES;
    if (size < minFileBytes) return undefined;

    return buildSlimSessionManager(resolved, await loadSlimSessionEntriesFromFile(resolved));
  } catch {
    return undefined;
  }
}
