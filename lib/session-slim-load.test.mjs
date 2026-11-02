import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const jiti = createJiti(import.meta.url);
const { loadSlimSessionEntries, openSlimSessionManager, loadSlimSessionEntriesFromFile, openSlimSessionManagerAsync, MAX_TEXT_FIELD_BYTES } = await jiti.import("./session-slim-load.ts");
const { projectToolResultDetails } = await jiti.import("./tool-result-details.ts");

const BIG = "x".repeat(400 * 1024);

function header(cwd = "/tmp/proj") {
  return { type: "session", version: 3, id: "s1", timestamp: "2026-01-01T00:00:00.000Z", cwd };
}
function user(id, parentId, text) {
  return { type: "message", id, parentId, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: text, timestamp: 1 } };
}
function toolResult(id, parentId, details, extra = {}) {
  return {
    type: "message",
    id,
    parentId,
    timestamp: "2026-01-01T00:00:02.000Z",
    message: {
      role: "toolResult",
      toolCallId: "t-" + id,
      toolName: "evaluate_browser",
      content: [{ type: "text", text: "ok — 页面 ✓" }],
      details,
      isError: false,
      timestamp: 2,
      ...extra,
    },
  };
}
const toBuffer = (entries) => Buffer.from(entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

test("oversized dead details are never parsed; everything else is unchanged", () => {
  const entries = [
    header(),
    user("a", null, "hi"),
    toolResult("b", "a", { outline: BIG, url: "https://x" }),
    toolResult("c", "b", { outline: BIG }, { isError: true }),
  ];
  const slim = loadSlimSessionEntries(toBuffer(entries));
  assert.equal(slim.length, 4);
  for (const index of [2, 3]) {
    const message = slim[index].message;
    assert.equal("details" in message, false);
    assert.deepEqual(message.content, entries[index].message.content);
    assert.equal(message.isError, entries[index].message.isError);
    assert.equal(message.timestamp, 2);
    assert.equal(message.toolCallId, entries[index].message.toolCallId);
  }
  assert.deepEqual(slim[1], entries[1]);
});

test("details the UI renders are kept, via the normal path", () => {
  const withDiff = toolResult("b", "a", { diff: BIG, extra: 1 });
  const withSubagent = toolResult("c", "b", { kind: "pi-web-subagent", transcript: BIG });
  const slim = loadSlimSessionEntries(toBuffer([header(), user("a", null, "hi"), withDiff, withSubagent]));
  assert.deepEqual(slim[2], withDiff);
  assert.deepEqual(slim[3], withSubagent);
});

test("the shortcut agrees with projectToolResultDetails on every line", () => {
  const entries = [
    header(),
    user("a", null, "hi"),
    toolResult("b", "a", { outline: BIG, "nested": { isError: 1, timestamp: 2 } }),
    toolResult("c", "b", { outline: BIG, result: { appliedFiles: ["a"] } }),
  ];
  const slim = loadSlimSessionEntries(toBuffer(entries));
  entries.forEach((entry, index) => {
    if (entry.message?.role !== "toolResult") return;
    // Lines kept whole still get projected later, by the cache's slimCachedEntries.
    const expected = projectToolResultDetails(entry.message.details);
    assert.deepEqual(projectToolResultDetails(slim[index].message.details), expected);
  });
});

test("unrecognised shapes fall back to a full parse", () => {
  // No isError/timestamp after details, an unknown message key, and a nested
  // details object inside content: none may lose data.
  const noTail = { type: "message", id: "b", parentId: "a", message: { role: "toolResult", toolCallId: "t", content: [], details: { outline: BIG } } };
  const extraKey = toolResult("c", "b", { outline: BIG }, { custom: BIG.slice(0, 10) });
  const nested = toolResult("d", "c", { outline: BIG });
  nested.message.content = [{ type: "text", text: "t", details: { keep: "me" } }];
  const slim = loadSlimSessionEntries(toBuffer([header(), user("a", null, "hi"), noTail, extraKey, nested]));
  assert.equal(slim.length, 5);
  assert.equal(slim[3].message.custom, "xxxxxxxxxx");
  assert.deepEqual(slim[4].message.content, nested.message.content);
});

test("malformed and blank lines are skipped like the SDK loader", () => {
  const text = [JSON.stringify(header()), "", "{not json", JSON.stringify(user("a", null, "hi"))].join("\n");
  assert.equal(loadSlimSessionEntries(Buffer.from(text)).length, 2);
});

test("openSlimSessionManager matches SessionManager.open and never persists", () => {
  const dir = mkdtempSync(join(tmpdir(), "slim-load-"));
  try {
    const entries = [header(dir), user("a", null, "hi")];
    let parent = "a";
    for (let i = 0; i < 45; i++) {
      const id = `r${i}`;
      entries.push(toolResult(id, parent, { outline: BIG, n: i }));
      parent = id;
    }
    entries.push({ type: "session_info", id: "n1", parentId: parent, timestamp: "2026-01-01T00:00:03.000Z", name: "named" });
    const file = join(dir, "2026-01-01T00-00-00-000Z_s1.jsonl");
    writeFileSync(file, toBuffer(entries));
    const before = Buffer.from(toBuffer(entries));

    const slim = openSlimSessionManager(file);
    assert.ok(slim, "files over the threshold take the slim path");
    const reference = SessionManager.open(file, undefined);

    assert.equal(slim.getSessionFile(), reference.getSessionFile());
    assert.equal(slim.getSessionId(), reference.getSessionId());
    assert.equal(slim.getCwd(), reference.getCwd());
    assert.equal(slim.getLeafId(), reference.getLeafId());
    assert.equal(slim.getSessionName(), reference.getSessionName());
    assert.deepEqual(
      slim.getEntries().map((e) => e.id),
      reference.getEntries().map((e) => e.id),
    );
    assert.equal(slim.getBranch().length, reference.getBranch().length);
    assert.equal("details" in slim.getEntries()[5].message, false);

    // A mutation on the slim view must not touch the file on disk.
    slim.appendMessage({ role: "user", content: "later", timestamp: 3 });
    const after = SessionManager.open(file, undefined);
    assert.equal(after.getEntries().length, reference.getEntries().length);
    assert.ok(before.length > 16 * 1024 * 1024);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("small files are left to the SDK", () => {
  const dir = mkdtempSync(join(tmpdir(), "slim-load-small-"));
  try {
    const file = join(dir, "s.jsonl");
    writeFileSync(file, toBuffer([header(dir), user("a", null, "hi")]));
    assert.equal(openSlimSessionManager(file), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an oversized live text value is cut and marked, never silently dropped", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slim-load-hugeline-"));
  try {
    const huge = "a".repeat(9 * 1024 * 1024);
    const entries = [
      header(dir),
      user("a", null, "hi"),
      {
        type: "message",
        id: "b",
        parentId: "a",
        timestamp: "2026-01-01T00:00:02.000Z",
        message: {
          role: "toolResult",
          toolCallId: "t-b",
          toolName: "bash",
          content: [
            { type: "text", text: "leading line" },
            { type: "text", text: huge },
          ],
          isError: false,
          timestamp: 2,
        },
      },
    ];
    const file = join(dir, "2026-01-01T00-00-00-000Z_s1.jsonl");
    writeFileSync(file, toBuffer(entries));
    assert.ok(statSync(file).size > 9 * 1024 * 1024, "the line really is past the trim threshold");

    const loaded = (await loadSlimSessionEntriesFromFile(file))[2];
    assert.equal(loaded.id, "b");
    assert.equal(loaded.message.content[0].text, "leading line", "small values are untouched");
    const text = loaded.message.content[1].text;
    assert.ok(text.length >= MAX_TEXT_FIELD_BYTES, "most of the value is still there");
    assert.ok(text.length < 3 * 1024 * 1024, "the value was cut back near the cap");
    assert.match(text, /pi-web truncated the remaining \d+ bytes of this text/);
    assert.ok(huge.startsWith(text.slice(0, 1024)), "the kept prefix is verbatim");

    // Same shape as the cooperative reader: the sync buffer path trims too.
    const sync = loadSlimSessionEntries(readFileSync(file));
    assert.deepEqual(sync[2].message.content[1].text, text);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a cut never lands inside an escape sequence or a multi-byte character", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slim-load-escapes-"));
  try {
    // Dense escapes (\n, \t, \", \u0001) and 3-byte characters around the cut
    // point: a naive byte cut would leave invalid JSON or a broken character.
    const unit = "ab\n\t\"é\u0001✓";
    const huge = unit.repeat(Math.ceil((9 * 1024 * 1024) / unit.length));
    const entries = [
      header(dir),
      user("a", null, "hi"),
      {
        type: "message",
        id: "b",
        parentId: "a",
        timestamp: "2026-01-01T00:00:02.000Z",
        message: { role: "toolResult", toolCallId: "t-b", toolName: "bash", content: [{ type: "text", text: huge }], isError: false, timestamp: 2 },
      },
    ];
    const file = join(dir, "2026-01-01T00-00-00-000Z_s1.jsonl");
    writeFileSync(file, toBuffer(entries));

    const loaded = (await loadSlimSessionEntriesFromFile(file))[2];
    const text = loaded.message.content[0].text;
    assert.match(text, /pi-web truncated the remaining \d+ bytes/);
    assert.ok(huge.startsWith(text.slice(0, 512)), "the kept prefix matches the original");
    assert.equal(text.includes("\uFFFD"), false, "no replacement characters from a split UTF-8 sequence");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("image payloads in an oversized line are never trimmed (the lazy image route serves them)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slim-load-image-"));
  try {
    const data = "A".repeat(9 * 1024 * 1024);
    const entry = {
      type: "message",
      id: "b",
      parentId: "a",
      timestamp: "2026-01-01T00:00:02.000Z",
      message: {
        role: "toolResult",
        toolCallId: "t-b",
        toolName: "screenshot",
        content: [{ type: "image", source: { type: "base64", media_type: "image/png", data } }],
        isError: false,
        timestamp: 2,
      },
    };
    const file = join(dir, "2026-01-01T00-00-00-000Z_s1.jsonl");
    writeFileSync(file, toBuffer([header(dir), user("a", null, "hi"), entry]));

    const loaded = (await loadSlimSessionEntriesFromFile(file))[2];
    assert.deepEqual(loaded, entry);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the cooperative opener has no upper size bound (a >1 GB session must never fall back to a blocking parse)", async () => {
  // The synchronous loader keeps its ceiling — it materializes the whole file in
  // one Buffer. The streaming opener reads fixed chunks and yields, so the old
  // ceiling only sent >1 GB files to a full synchronous SessionManager.open().
  const src = await readFile(new URL("./session-slim-load.ts", import.meta.url), "utf8");
  const asyncOpener = src.slice(src.indexOf("export async function openSlimSessionManagerAsync"));
  assert.doesNotMatch(asyncOpener, /size > SLIM_LOAD_MAX_FILE_BYTES/);
  assert.match(asyncOpener, /loadSlimSessionEntriesFromFile\(/);
});

test("async slim reader matches the synchronous reader and yields cooperatively", async () => {
  const dir = mkdtempSync(join(tmpdir(), "slim-load-async-"));
  try {
    const entries = [
      header(dir),
      user("a", null, "hi"),
      toolResult("b", "a", { outline: BIG, url: "https://x" }),
      toolResult("c", "b", { diff: BIG }),
      { type: "session_info", id: "n1", parentId: "c", timestamp: "2026-01-01T00:00:03.000Z", name: "named" },
    ];
    const text = toBuffer(entries);
    const file = join(dir, "2026-01-01T00-00-00-000Z_s1.jsonl");
    writeFileSync(file, text);

    // yieldIntervalMs: 0 makes every line a yield point, so the count is
    // deterministic instead of depending on wall-clock timing.
    const originalSetImmediate = globalThis.setImmediate;
    let yields = 0;
    globalThis.setImmediate = ((fn, ...args) => {
      yields += 1;
      return originalSetImmediate(fn, ...args);
    });
    let asyncEntries;
    try {
      asyncEntries = await loadSlimSessionEntriesFromFile(file, { yieldIntervalMs: 0 });
    } finally {
      globalThis.setImmediate = originalSetImmediate;
    }
    assert.ok(yields > 0, "the async reader must yield to the event loop");
    assert.deepEqual(asyncEntries, loadSlimSessionEntries(text));

    const sm = await openSlimSessionManagerAsync(file, { minFileBytes: 0 });
    const reference = SessionManager.open(file, undefined);
    assert.ok(sm);
    assert.equal(sm.getSessionFile(), reference.getSessionFile());
    assert.equal(sm.getLeafId(), reference.getLeafId());
    assert.equal(sm.getSessionName(), reference.getSessionName());
    assert.deepEqual(sm.getEntries().map((e) => e.id), reference.getEntries().map((e) => e.id));

    // An unreadable file fails soft so callers can fall back to the SDK path.
    assert.equal(await openSlimSessionManagerAsync(join(dir, "missing.jsonl"), { minFileBytes: 0 }), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
