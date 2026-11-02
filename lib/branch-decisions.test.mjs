import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  BRANCH_LABEL_MAX,
  findBranchDecision,
  firstLineLabel,
  getBranchDecisions,
  resolveBranchDecisionAnchors,
} = await jiti.import("./branch-decisions.ts");

const msg = (id, role, text, timestamp = "2026-01-01T00:00:00.000Z") => ({
  type: "message",
  id,
  parentId: null,
  timestamp,
  message: { role, content: text },
});
const toolResult = (id) => ({
  type: "message",
  id,
  parentId: null,
  timestamp: "2026-01-01T00:00:00.000Z",
  message: { role: "toolResult", content: "x" },
});
const node = (entry, children = []) => ({ entry, children });
const byParent = (decisions, parentEntryId) => decisions.find((d) => d.parentEntryId === parentEntryId);

test("a linear session has no decision points", () => {
  const tree = [node(msg("u1", "user", "q"), [node(msg("a1", "assistant", "a"))])];
  assert.deepEqual(getBranchDecisions(tree, "a1"), []);
  assert.equal(findBranchDecision([], "a1"), undefined);
});

test("two answers to one question are one decision with two ordered options", () => {
  const tree = [node(msg("u1", "user", "Which one?"), [
    node(msg("a1", "assistant", "First answer")),
    node(msg("a2", "assistant", "Second answer")),
  ])];

  const first = getBranchDecisions(tree, "a1");
  assert.equal(first.length, 1);
  assert.equal(first[0].parentEntryId, "u1");
  assert.equal(first[0].total, 2);
  assert.equal(first[0].activeIndex, 0);
  assert.deepEqual(first[0].options.map((o) => o.tipId), ["a1", "a2"]);
  assert.deepEqual(first[0].options.map((o) => o.entryId), ["a1", "a2"]);
  assert.deepEqual(first[0].options.map((o) => o.label), ["First answer", "Second answer"]);
  assert.deepEqual(first[0].options.map((o) => o.role), ["assistant", "assistant"]);
  assert.equal(first[0].options[0].timestamp, "2026-01-01T00:00:00.000Z");
  // The pager sits on the answer the reader is looking at.
  assert.equal(first[0].anchorEntryId, "a1");

  const second = getBranchDecisions(tree, "a2");
  assert.equal(second[0].activeIndex, 1);
  assert.equal(second[0].anchorEntryId, "a2");
});

test("tool-call fan-out and internal records are not decision points", () => {
  const fanOut = [node(msg("u1", "user", "q"), [
    node(msg("a1", "assistant", "answer"), [node(toolResult("t1")), node(toolResult("t2"))]),
  ])];
  assert.deepEqual(getBranchDecisions(fanOut, "t1"), []);

  const records = [node({ type: "session_info", id: "s1", parentId: null, timestamp: "t" }, [
    node({ type: "model_change", id: "m1", parentId: null, timestamp: "t" }),
    node({ type: "model_change", id: "m2", parentId: null, timestamp: "t" }),
  ])];
  assert.deepEqual(getBranchDecisions(records, "m1"), []);
});

test("a deeper split keeps its own parent and anchor", () => {
  const tree = [node(msg("u1", "user", "q1"), [
    node(msg("a1", "assistant", "a1"), [
      node(msg("u2", "user", "q2"), [
        node(msg("a2", "assistant", "deep one")),
        node(msg("a3", "assistant", "deep two")),
      ]),
    ]),
  ])];

  const decisions = getBranchDecisions(tree, "a3");
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].parentEntryId, "u2");
  assert.equal(decisions[0].activeIndex, 1);
  assert.equal(decisions[0].anchorEntryId, "a3");
  assert.deepEqual(decisions[0].options.map((o) => o.label), ["deep one", "deep two"]);
});

test("nested decisions stop the outer pager before the inner split", () => {
  // u1 has two versions; the first version itself splits again at u2.
  const tree = [node(msg("u1", "user", "q1"), [
    node(msg("a1", "assistant", "outer one"), [
      node(msg("u2", "user", "q2"), [
        node(msg("a3", "assistant", "inner one")),
        node(msg("a4", "assistant", "inner two")),
      ]),
    ]),
    node(msg("a2", "assistant", "outer two")),
  ])];

  const decisions = getBranchDecisions(tree, "a3");
  const outer = byParent(decisions, "u1");
  const inner = byParent(decisions, "u2");
  assert.ok(outer && inner);
  assert.equal(outer.total, 2);
  assert.equal(outer.activeIndex, 0);
  // The outer control must not share a footer with the inner one.
  assert.equal(outer.anchorEntryId, "a1");
  assert.equal(inner.anchorEntryId, "a3");
  assert.notEqual(outer.anchorEntryId, inner.anchorEntryId);
});

test("an edited-and-resent message anchors at the end of its active branch", () => {
  const tree = [node(msg("u1", "user", "q1"), [
    node(msg("a1", "assistant", "a1"), [
      node(msg("u2", "user", "original"), [node(msg("a2", "assistant", "answer two"), [
        node(msg("u3", "user", "follow up"), [node(msg("a3", "assistant", "answer three"))]),
      ])]),
      node(msg("u2b", "user", "edited"), [node(msg("a2b", "assistant", "answer two b"))]),
    ]),
  ])];

  const decisions = getBranchDecisions(tree, "a3");
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].parentEntryId, "a1");
  assert.equal(decisions[0].activeIndex, 0);
  assert.equal(decisions[0].anchorEntryId, "a3");
  assert.deepEqual(decisions[0].options.map((o) => o.label), ["original", "edited"]);
  // Switching to the other version targets that version's tip.
  assert.deepEqual(decisions[0].options.map((o) => o.tipId), ["a3", "a2b"]);
});

test("a branch option points at its deepest leaf, not the split point", () => {
  const tree = [node(msg("u1", "user", "q"), [
    node(msg("a1", "assistant", "first"), [node(msg("u2", "user", "next"), [node(msg("a3", "assistant", "tip"))])]),
    node(msg("a2", "assistant", "second")),
  ])];
  const decisions = getBranchDecisions(tree, "a2");
  assert.deepEqual(decisions[0].options.map((o) => o.tipId), ["a3", "a2"]);
  assert.equal(decisions[0].activeIndex, 1);
});

test("a split off the first message is a root decision", () => {
  const tree = [
    node(msg("u1", "user", "first version")),
    node(msg("u2", "user", "second version")),
  ];
  const decisions = getBranchDecisions(tree, "u2");
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].parentEntryId, null);
  assert.equal(decisions[0].total, 2);
  assert.equal(decisions[0].activeIndex, 1);
  assert.equal(decisions[0].anchorEntryId, "u2");
  assert.deepEqual(decisions[0].options.map((o) => o.label), ["first version", "second version"]);
});

test("one root with a message and one metadata-only root is not a branch", () => {
  const tree = [
    node(msg("u1", "user", "only conversation")),
    node({ type: "session_info", id: "s1", parentId: null, timestamp: "t" }),
  ];
  assert.deepEqual(getBranchDecisions(tree, "u1"), []);
});

test("labels take the first non-empty line and truncate at the limit", () => {
  assert.equal(firstLineLabel("  first line  \n\nsecond line"), "first line");
  assert.equal(firstLineLabel("one\r\ntwo"), "one");
  assert.equal(firstLineLabel("\n\n"), "");

  const long = "word ".repeat(40);
  assert.equal(firstLineLabel(long), `${long.slice(0, BRANCH_LABEL_MAX)}…`);
  assert.equal(firstLineLabel(long).length, BRANCH_LABEL_MAX + 1);
  // Truncation counts characters, so an emoji pair is never split.
  assert.equal(firstLineLabel("😀".repeat(60)), `${"😀".repeat(BRANCH_LABEL_MAX)}…`);

  const tree = [node(msg("u1", "user", "question"), [
    node(msg("a1", "assistant", "short")),
    node(msg("a2", "assistant", long)),
  ])];
  assert.equal(getBranchDecisions(tree, "a1")[0].options[1].label, `${long.slice(0, BRANCH_LABEL_MAX)}…`);
});

test("compressed chain ids resolve to the branch holding the leaf", () => {
  // Server projection: the user message lives in compressedEntryIds and only
  // the branch preview carries its text.
  const armOne = {
    entry: msg("a2", "assistant", "answer one"),
    children: [],
    compressedEntryIds: ["u2"],
    branchPreview: { role: "user", text: "branch one" },
  };
  const armTwo = {
    entry: msg("a2b", "assistant", "answer two"),
    children: [],
    compressedEntryIds: ["u2b"],
    branchPreview: { role: "user", text: "branch two" },
  };
  const tree = [node(msg("u1", "user", "q"), [node(msg("a1", "assistant", "a1"), [armOne, armTwo])])];

  const decisions = getBranchDecisions(tree, "u2");
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].parentEntryId, "a1");
  assert.equal(decisions[0].activeIndex, 0);
  assert.equal(decisions[0].options[0].tipId, "u2");
  assert.deepEqual(decisions[0].options.map((o) => o.label), ["branch one", "branch two"]);
  assert.deepEqual(decisions[0].options.map((o) => o.role), ["user", "user"]);
});

test("a leaf that is the decision parent itself has no active branch or anchor", () => {
  const tree = [node(msg("u1", "user", "q"), [
    node(msg("a1", "assistant", "one")),
    node(msg("a2", "assistant", "two")),
  ])];
  const decisions = getBranchDecisions(tree, "u1");
  assert.equal(decisions[0].activeIndex, -1);
  assert.equal(decisions[0].anchorEntryId, null);
});

test("the anchor stops at the viewed tip, not at entries below it", () => {
  // a2 is the checked-out tip although the file keeps a3 under it.
  const tree = [node(msg("u1", "user", "q"), [
    node(msg("a1", "assistant", "one"), [
      node(msg("a2", "assistant", "tip two"), [node(msg("a3", "assistant", "later"))]),
    ]),
    node(msg("a1b", "assistant", "other")),
  ])];
  const decisions = getBranchDecisions(tree, "a2");
  assert.equal(decisions[0].activeIndex, 0);
  assert.equal(decisions[0].anchorEntryId, "a2");
  assert.equal(decisions[0].options[0].tipId, "a2");
});

// Server projections keep the first message of a chain in compressedEntryIds;
// switching there must anchor on the assistant entry that is on screen.
test("a leaf inside a compressed chain anchors on its representative entry", () => {
  const branch = {
    entry: msg("a2", "assistant", "answer two"),
    children: [node(msg("a3", "assistant", "later"))],
    compressedEntryIds: ["u2"],
    branchPreview: { role: "user", text: "branch two" },
  };
  const tree = [node(msg("u1", "user", "q"), [branch, node(msg("a2b", "assistant", "other"))])];
  const decisions = getBranchDecisions(tree, "u2");
  assert.equal(decisions[0].activeIndex, 0);
  assert.equal(decisions[0].anchorEntryId, "a2");
});

test("findBranchDecision maps a message entry to its pager decision", () => {
  const tree = [node(msg("u1", "user", "q"), [
    node(msg("a1", "assistant", "one")),
    node(msg("a2", "assistant", "two")),
  ])];
  const decisions = getBranchDecisions(tree, "a2");
  assert.equal(findBranchDecision(decisions, "a2")?.parentEntryId, "u1");
  assert.equal(findBranchDecision(decisions, "u1"), undefined);
  assert.equal(findBranchDecision(undefined, "a2"), undefined);
});

test("deep linear chains are walked without a stack overflow", () => {
  let current = node(msg("e0", "user", "m0"));
  const root = current;
  for (let index = 1; index < 6000; index += 1) {
    const child = node(msg(`e${index}`, index % 2 === 0 ? "user" : "assistant", `m${index}`));
    current.children = [child];
    current = child;
  }
  assert.deepEqual(getBranchDecisions([root], "e5999"), []);
});

test("compressed branches ending at a custom leaf still count as conversation branches and resolve their assistant anchor", () => {
  const customLeaf = {
    entry: { type: "custom", id: "c1", parentId: "a2", timestamp: "t", customType: "plan-mode-state" },
    children: [],
    compressedEntryIds: ["u2", "a2"],
    branchPreview: { role: "user", text: "branch one" },
  };
  const armTwo = {
    entry: msg("a2b", "assistant", "answer two"),
    children: [],
    compressedEntryIds: ["u2b"],
    branchPreview: { role: "user", text: "branch two" },
  };
  const tree = [node(msg("u1", "user", "q"), [node(msg("a1", "assistant", "a1"), [customLeaf, armTwo])])];

  const raw = getBranchDecisions(tree, "c1");
  assert.equal(raw.length, 1);
  assert.equal(raw[0].activeIndex, 0);

  const resolved = resolveBranchDecisionAnchors(
    raw,
    tree,
    "c1",
    ["u1", "a1", "u2", "a2"],
    [{ role: "user" }, { role: "assistant" }, { role: "user" }, { role: "assistant" }],
  );
  assert.equal(resolved[0].anchorEntryId, "a2");
});
