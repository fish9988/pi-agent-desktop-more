import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { MessageView } = await jiti.import("./MessageView.tsx");
const { getBranchDecisions } = await jiti.import("@/lib/branch-decisions");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const msg = (id, role, text) => ({ type: "message", id, parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role, content: text } });
const node = (entry, children = []) => ({ entry, children });

function render(message, props = {}) {
  return renderToStaticMarkup(React.createElement(
    I18nProvider,
    null,
    React.createElement(MessageView, { message, ...props }),
  ));
}

function decision(overrides = {}) {
  return {
    parentEntryId: "u1",
    activeIndex: 1,
    total: 2,
    options: [
      { tipId: "a1", entryId: "a1", label: "First answer", role: "assistant", timestamp: null },
      { tipId: "a2", entryId: "a2", label: "Second answer", role: "assistant", timestamp: null },
    ],
    anchorEntryId: "a2",
    ...overrides,
  };
}

const assistant = { role: "assistant", content: [{ type: "text", text: "Answer text" }] };

test("the footer pager shows position and targets the neighbouring branch tips", () => {
  const html = render(assistant, {
    entryId: "a2",
    branchDecisions: [decision()],
    onBranchSwitch() {},
  });

  assert.match(html, /class="message-branch-pager"/);
  assert.match(html, /data-branch-parent="u1"/);
  assert.match(html, /data-branch-active="1"/);
  assert.match(html, /class="message-branch-count"[^>]*>2\/2</);
  // One answer is on each side: the previous arrow targets a1, the next is spent.
  assert.match(html, /class="message-branch-step"[^>]*data-branch-target="a1"/);
  assert.equal((html.match(/class="message-branch-step"/g) ?? []).length, 2);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
  // The footer keeps its existing actions.
  assert.match(html, /class="message-copy-action"/);
});

test("the first branch disables the previous arrow and targets the next tip", () => {
  const html = render(assistant, {
    entryId: "a2",
    branchDecisions: [decision({ activeIndex: 0, anchorEntryId: "a2" })],
    onBranchSwitch() {},
  });
  assert.match(html, /data-branch-active="0"/);
  assert.match(html, /class="message-branch-count"[^>]*>1\/2</);
  assert.match(html, /class="message-branch-step"[^>]*data-branch-target="a2"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 1);
});

test("a single branch, a missing decision, or another anchor renders no pager", () => {
  for (const props of [
    { entryId: "a2", branchDecisions: [], onBranchSwitch() {} },
    { entryId: "a2", onBranchSwitch() {} },
    { entryId: "a2", branchDecisions: [decision({ anchorEntryId: "a1" })], onBranchSwitch() {} },
    { entryId: "a2", branchDecisions: [decision({ total: 1, options: [decision().options[0]] })], onBranchSwitch() {} },
    { entryId: "a2", branchDecisions: [decision()] },
  ]) {
    const html = render(assistant, props);
    assert.doesNotMatch(html, /message-branch-pager/, JSON.stringify(props));
  }
});

test("a locked session keeps the pager visible but disables both arrows", () => {
  const html = render(assistant, {
    entryId: "a2",
    branchDecisions: [decision()],
    onBranchSwitch() {},
    branchSwitchLocked: true,
  });
  assert.match(html, /message-branch-pager is-locked/);
  assert.equal((html.match(/class="message-branch-step"/g) ?? []).length, 2);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
});

test("the process half of a split entry suppresses the pager", () => {
  const html = render(assistant, {
    entryId: "a2",
    branchDecisions: [decision()],
    onBranchSwitch() {},
    branchPager: false,
  });
  assert.doesNotMatch(html, /message-branch-pager/);

  // The answer bubble of the same entry still shows it.
  const answer = render(assistant, {
    entryId: "a2",
    branchDecisions: [decision()],
    onBranchSwitch() {},
    branchPager: true,
  });
  assert.match(answer, /message-branch-pager/);
});

test("the pager lands only on the active answer of a real session tree", () => {
  const tree = [node(msg("u1", "user", "Which one?"), [
    node(msg("a1", "assistant", "First answer")),
    node(msg("a2", "assistant", "Second answer")),
  ])];
  const decisions = getBranchDecisions(tree, "a2");

  const first = render({ role: "assistant", content: [{ type: "text", text: "First answer" }] }, {
    entryId: "a1",
    branchDecisions: decisions,
    onBranchSwitch() {},
  });
  assert.doesNotMatch(first, /message-branch-pager/);

  const second = render({ role: "assistant", content: [{ type: "text", text: "Second answer" }] }, {
    entryId: "a2",
    branchDecisions: decisions,
    onBranchSwitch() {},
  });
  assert.match(second, /message-branch-pager/);
  assert.match(second, /class="message-branch-count"[^>]*>2\/2</);
});
