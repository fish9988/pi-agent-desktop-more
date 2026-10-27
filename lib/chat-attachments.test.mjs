import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  CHAT_ATTACHMENT_MAX_FILES,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  attachmentAwareTitle,
  composeMessageWithAttachedFiles,
  isChatTextAttachment,
  readChatTextAttachments,
  splitAttachedFiles,
} = await jiti.import("./chat-attachments.ts");

test("text, code and data files are attachable; images, PDFs and archives are not", () => {
  for (const name of ["notes.md", "main.rs", "data.csv", "config.yaml", "Dockerfile", "a.TS"]) {
    assert.equal(isChatTextAttachment({ name, type: "" }), true, name);
  }
  assert.equal(isChatTextAttachment({ name: "x.bin", type: "text/plain" }), true);
  assert.equal(isChatTextAttachment({ name: "photo.png", type: "image/png" }), false);
  assert.equal(isChatTextAttachment({ name: "paper.pdf", type: "application/pdf" }), false);
  assert.equal(isChatTextAttachment({ name: "a.zip", type: "application/zip" }), false);
});

test("attached files round-trip through the message text", () => {
  const files = [
    { name: "a.md", text: "# Title\n\nbody" },
    { name: 'we"ird & name.txt', text: "line\n</attached_file>\nafter" },
  ];
  const content = composeMessageWithAttachedFiles("Summarize these", files);
  assert.ok(content.startsWith("Summarize these\n\n<attached_file name=\"a.md\">"));
  const split = splitAttachedFiles(content);
  assert.equal(split.text, "Summarize these");
  assert.deepEqual(split.files, files);
});

test("a message with only files has no typed text, and the title falls back to the names", () => {
  const content = composeMessageWithAttachedFiles("", [{ name: "a.md", text: "x" }, { name: "b.md", text: "y" }]);
  assert.equal(splitAttachedFiles(content).text, "");
  assert.equal(attachmentAwareTitle(content), "a.md, b.md");
  assert.equal(attachmentAwareTitle("plain message"), "plain message");
  assert.equal(attachmentAwareTitle(composeMessageWithAttachedFiles("hello", [{ name: "a", text: "b" }])), "hello");
});

test("an unterminated or ordinary message is left alone", () => {
  assert.deepEqual(splitAttachedFiles("hello"), { text: "hello", files: [] });
  const broken = '<attached_file name="a.md">\nno closing tag';
  assert.deepEqual(splitAttachedFiles(broken), { text: broken, files: [] });
});

test("readChatTextAttachments enforces type, size, binary and count limits", async () => {
  const text = (name, body) => new File([body], name, { type: "text/plain" });
  const ok = await readChatTextAttachments([text("a.txt", "hello"), text("b.md", "﻿bom")]);
  assert.deepEqual(ok.accepted.map((file) => [file.name, file.text]), [["a.txt", "hello"], ["b.md", "bom"]]);

  const bad = await readChatTextAttachments([
    new File(["%PDF"], "p.pdf", { type: "application/pdf" }),
    new File([new Uint8Array(CHAT_ATTACHMENT_MAX_FILE_BYTES + 1)], "big.txt", { type: "text/plain" }),
    new File([new Uint8Array([0x68, 0x00, 0x69])], "nul.txt", { type: "text/plain" }),
    new File([new Uint8Array([0xff, 0xfe, 0xfd])], "latin.txt", { type: "text/plain" }),
  ]);
  assert.deepEqual(bad.accepted, []);
  assert.deepEqual(bad.rejected.map((item) => item.reason), ["unsupported", "too-large", "not-text", "not-text"]);

  const existing = Array.from({ length: CHAT_ATTACHMENT_MAX_FILES }, (_, i) => ({ id: String(i), name: `f${i}`, size: 1, text: "x" }));
  const full = await readChatTextAttachments([text("one-more.txt", "x")], existing);
  assert.deepEqual(full.rejected.map((item) => item.reason), ["too-many"]);
});

test("a Word document is read through the injected extractor, and only when there is one", async () => {
  const { isChatDocxAttachment, readChatTextAttachments: read } = await jiti.import("./chat-attachments.ts");
  const docx = () => new File(["PK"], "plan.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  assert.equal(isChatDocxAttachment({ name: "x.DOCX" }), true);
  assert.equal(isChatDocxAttachment({ name: "x.doc" }), false);

  // Without an extractor a .docx is unsupported, as before.
  assert.deepEqual((await read([docx()])).rejected.map((item) => item.reason), ["unsupported"]);

  const ok = await read([docx()], [], async () => "Title\n\nBody");
  assert.deepEqual(ok.accepted.map((file) => [file.name, file.text, file.size]), [["plan.docx", "Title\n\nBody", 11]]);

  const tooLarge = await read([docx()], [], async () => { throw new Error("too-large"); });
  assert.deepEqual(tooLarge.rejected.map((item) => item.reason), ["too-large"]);
  const broken = await read([docx()], [], async () => { throw new Error("boom"); });
  assert.deepEqual(broken.rejected.map((item) => item.reason), ["not-text"]);

  // The extracted text counts against the message's total.
  const big = "x".repeat(300 * 1024);
  const full = await read([docx(), docx()], [], async () => big);
  assert.equal(full.accepted.length, 1);
  assert.deepEqual(full.rejected.map((item) => item.reason), ["total-too-large"]);
});

test("a submitted message returns to the composer as text plus attachments", async () => {
  const { composeMessageWithAttachedFiles, splitMessageForComposer } = await jiti.import("./chat-attachments.ts");
  const message = composeMessageWithAttachedFiles("hello", [
    { name: "a.txt", text: "AAA" },
    { name: "b.md", text: "# B" },
  ]);
  const { text, files } = splitMessageForComposer(message);
  assert.equal(text, "hello");
  assert.deepEqual(files.map((f) => [f.name, f.text, f.size]), [["a.txt", "AAA", 3], ["b.md", "# B", 3]]);
  assert.equal(new Set(files.map((f) => f.id)).size, 2);
  assert.deepEqual(splitMessageForComposer("plain"), { text: "plain", files: [] });
});

test("long pasted prompts convert to .md or .txt attachments based on line threshold and content", async () => {
  const {
    createPastedTextAttachment,
    detectPastedFileExtension,
    shouldConvertPasteToAttachment,
    splitAttachedFiles,
    composeMessageWithAttachedFiles,
  } = await jiti.import("./chat-attachments.ts");

  const shortText = "line 1\nline 2\nline 3";
  const thirtyLines = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 行内容`).join("\n");
  const singleLineHuge = "x".repeat(3600);

  assert.equal(shouldConvertPasteToAttachment(shortText, 30), false);
  assert.equal(shouldConvertPasteToAttachment(thirtyLines, 30), true);
  assert.equal(shouldConvertPasteToAttachment(thirtyLines, 0), false, "threshold 0 disables conversion");
  assert.equal(shouldConvertPasteToAttachment(singleLineHuge, 30), true, "single-line giant paste triggers char fallback");

  assert.equal(detectPastedFileExtension("# 标题\n\n正文内容"), "md");
  assert.equal(detectPastedFileExtension("```ts\nconst x = 1;\n```"), "md");
  assert.equal(detectPastedFileExtension("plain log line 1\nplain log line 2"), "txt");

  const mdPaste = `# 系统架构设计方案\n${thirtyLines}`;
  const first = createPastedTextAttachment(mdPaste, []);
  assert.ok(first);
  assert.match(first.name, /^pasted-1-系统架构设计方案\.md$/);
  assert.equal(first.text, mdPaste);

  const second = createPastedTextAttachment(thirtyLines, [first]);
  assert.ok(second);
  assert.match(second.name, /^pasted-2-.*\.txt$/);

  const composed = composeMessageWithAttachedFiles("请审阅这份方案：", [first]);
  const parsed = splitAttachedFiles(composed);
  assert.equal(parsed.text, "请审阅这份方案：");
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].name, first.name);
  assert.equal(parsed.files[0].text, mdPaste);
});

