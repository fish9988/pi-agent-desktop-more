import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { MessageView, ToolCallBlock, getToolArgumentRows } = await jiti.import("./MessageView.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { clearExpandedToolCalls, setToolCallExpanded } = await jiti.import("@/lib/tool-call-expansion");

function renderTool(block, props = {}) {
  return renderToStaticMarkup(React.createElement(
    I18nProvider,
    null,
    React.createElement(ToolCallBlock, { block, ...props }),
  ));
}

function textOf(html) {
  return html.replace(/<[^>]+>/g, "");
}

const keys = (rows) => rows.map((row) => row.key);

test("high-frequency tools list parameters in a stable order", () => {
  assert.deepEqual(keys(getToolArgumentRows("ls", { hidden: true, path: "src", limit: 20 })), ["path", "limit", "hidden"]);
  assert.deepEqual(keys(getToolArgumentRows("read", { limit: 40, path: "src/a.ts", offset: 10 })), ["path", "offset", "limit"]);
  assert.deepEqual(keys(getToolArgumentRows("grep", { context: 2, path: "src", pattern: "branch", glob: "*.ts" })), ["pattern", "path", "glob", "context"]);
  // Decorated names read the same table.
  assert.deepEqual(keys(getToolArgumentRows("files.read", { limit: 5, path: "a" })), ["path", "limit"]);
  // Unknown tools sort alphabetically so a repeat call looks the same.
  assert.deepEqual(keys(getToolArgumentRows("custom_tool", { zebra: 1, alpha: 2 })), ["alpha", "zebra"]);
});

test("parameter values are single-line with the full text kept in title", () => {
  const longPath = `/very/long/${"nested/".repeat(30)}file.ts`;
  const rows = getToolArgumentRows("read", {
    path: longPath,
    limit: 20,
    nested: { a: 1, b: [2, 3] },
    flag: false,
    missing: null,
  });
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

  assert.equal(byKey.path.truncated, true);
  assert.ok(byKey.path.value.endsWith("…"));
  assert.equal(byKey.path.value.length, 121);
  assert.equal(byKey.path.title, longPath);
  assert.equal(byKey.limit.value, "20");
  assert.equal(byKey.limit.truncated, false);
  assert.equal(byKey.nested.value, '{"a":1,"b":[2,3]}');
  assert.equal(byKey.flag.value, "false");
  assert.equal(byKey.missing.value, "null");

  const multiLine = getToolArgumentRows("bash", { command: "echo one\necho two", description: "two lines" });
  const command = multiLine.find((row) => row.key === "command");
  assert.equal(command.value, "echo one …");
  assert.equal(command.truncated, true);
  assert.equal(command.title, "echo one\necho two");
});

test("non-object inputs have no parameter rows", () => {
  assert.deepEqual(getToolArgumentRows("bash", "ls"), []);
  assert.deepEqual(getToolArgumentRows("bash", null), []);
  assert.deepEqual(getToolArgumentRows("bash", {}), []);
});

test("an expanded tool call renders one row per parameter instead of a JSON blob", (t) => {
  const block = {
    type: "toolCall",
    toolCallId: "call-read-args",
    toolName: "read",
    input: { limit: 40, path: "lib/branch-decisions.ts" },
  };
  setToolCallExpanded(block.toolCallId, true);
  t.after(() => clearExpandedToolCalls());
  const html = renderTool(block);

  assert.match(html, /class="plus-tool-args"/);
  const keyCells = [...html.matchAll(/class="plus-tool-arg-key" title="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keyCells, ["path", "limit"]);
  assert.match(html, /class="plus-tool-arg-value" title="lib\/branch-decisions\.ts">lib\/branch-decisions\.ts</);
  const text = textOf(html);
  assert.doesNotMatch(text, /"path":/);
  assert.doesNotMatch(text, /plus-tool-io/);
  // The result side is untouched: no result was passed, so none renders.
  assert.doesNotMatch(html, /class="plus-tool-result/);
});

test("a result still renders below the parameter rows, unchanged", (t) => {
  const block = {
    type: "toolCall",
    toolCallId: "call-read-result",
    toolName: "read",
    input: { path: "a.ts" },
  };
  const result = {
    role: "toolResult",
    toolCallId: block.toolCallId,
    content: [{ type: "text", text: "file body" }],
  };
  setToolCallExpanded(block.toolCallId, true);
  t.after(() => clearExpandedToolCalls());
  const html = renderTool(block, { result });

  assert.match(html, /class="plus-tool-args"/);
  assert.match(textOf(html), /file body/);
});

test("edit and apply_patch keep their diff views without argument rows", (t) => {
  const edit = {
    type: "toolCall",
    toolCallId: "call-edit-args",
    toolName: "edit",
    input: { path: "a.ts", oldText: "one", newText: "two" },
  };
  setToolCallExpanded(edit.toolCallId, true);
  t.after(() => clearExpandedToolCalls());
  const editHtml = renderTool(edit, {
    result: {
      role: "toolResult",
      toolCallId: edit.toolCallId,
      content: [{ type: "text", text: "Edited a.ts" }],
      details: { patch: "--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-one\n+two" },
    },
  });
  assert.doesNotMatch(editHtml, /class="plus-tool-args"/);
  // The split diff still owns the expanded body.
  assert.match(editHtml, /background:rgba\(248,113,113,0\.13\)/);
  assert.match(textOf(editHtml), /one/);
});

test("a write call that still shows its file text does not duplicate it as rows", (t) => {
  const block = {
    type: "toolCall",
    toolCallId: "call-write-text",
    toolName: "write",
    input: { path: "notes.md", content: "line one\nline two\n" },
  };
  setToolCallExpanded(block.toolCallId, true);
  t.after(() => clearExpandedToolCalls());
  const html = renderTool(block);
  assert.doesNotMatch(html, /class="plus-tool-args"/);
  assert.match(textOf(html), /line one\nline two/);
});

test("an assistant message renders the arguments of its tool call", (t) => {
  const block = { type: "toolCall", toolCallId: "call-ls-in-message", toolName: "ls", input: { path: "src", limit: 5 } };
  setToolCallExpanded(block.toolCallId, true);
  t.after(() => clearExpandedToolCalls());
  const html = renderToStaticMarkup(React.createElement(
    I18nProvider,
    null,
    React.createElement(MessageView, {
      message: { role: "assistant", provider: "anthropic", model: "claude-test", content: [block] },
    }),
  ));
  assert.match(html, /class="plus-tool-args"/);
  assert.deepEqual([...html.matchAll(/class="plus-tool-arg-key" title="([^"]+)"/g)].map((match) => match[1]), ["path", "limit"]);
});
