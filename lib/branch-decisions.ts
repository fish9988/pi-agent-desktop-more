/**
 * In-session branch decisions: the places where the conversation really splits.
 *
 * 1.19.0 stopped treating tool-call fan-out as a branch. This module keeps that
 * rule and turns the tree into *decision points* a reader can act on: a parent
 * whose children hold more than one conversation branch (a reply that was
 * answered again, a message that was edited and resent, or several roots from
 * a branch off the first message).
 *
 * The tree helpers (`buildActivePath`, `compressChain`, ...) used to live in
 * `components/BranchNavigator.tsx`; they were moved here so both the top-bar
 * map and the per-answer footer pager read the same tree shape. BranchNavigator
 * still re-exports them, and its tests keep importing them from there.
 *
 * Everything here is pure and iterative: a linear session can be 6000 entries
 * deep, so a recursive walk would overflow the stack.
 */

import type { BranchPreview, SessionEntry, SessionTreeNode } from "@/lib/types";

type Role = "user" | "assistant";

function messageOf(entry: SessionEntry): { role?: string; content?: unknown } | null {
  if (entry.type !== "message" || !("message" in entry)) return null;
  const message = (entry as { message?: { role?: string; content?: unknown } }).message;
  return message ?? null;
}

// Transcript system messages hold the prompt, not a turn, so they never label a branch.
export function isMessageEntry(entry: SessionEntry): boolean {
  const message = messageOf(entry);
  return message !== null && message.role !== "system";
}

// Only a user/assistant exchange is something a reader can tell apart. Tool
// results fan out too (one assistant message, several tool calls), and treating
// that as "branches" is what made the control show up in almost every session
// with rows like `custom`.
export function isConversationEntry(entry: SessionEntry): boolean {
  return roleOf(entry) !== null;
}

function roleOf(entry: SessionEntry): Role | null {
  const role = messageOf(entry)?.role;
  return role === "user" || role === "assistant" ? role : null;
}

/** The text a branch label is taken from (first text block, or the string body). */
function conversationText(entry: SessionEntry): string {
  const content = messageOf(entry)?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => (
      Boolean(block) && typeof block === "object" && (block as { type?: unknown }).type === "text"
      && typeof (block as { text?: unknown }).text === "string"
    ))
    .map((block) => block.text)
    .join("\n");
}

// Find the visible entry IDs on the path from root to activeLeafId.
// Iterative DFS: a linear session degrades into a chain whose depth equals the
// entry count, so a recursive search overflows the call stack. Walk with an
// explicit stack instead (paths accumulate depth, not the call stack).
export function buildActivePath(nodes: SessionTreeNode[], targetId: string | null): Set<string> {
  if (!targetId) return new Set();
  const target = targetId;
  const stack: { node: SessionTreeNode; path: string[] }[] = nodes.map((n) => ({ node: n, path: [n.entry.id] }));
  while (stack.length > 0) {
    const { node, path } = stack.pop()!;
    if (node.entry.id === target || node.compressedEntryIds?.includes(target)) {
      return new Set(path);
    }
    for (const child of node.children) {
      stack.push({ node: child, path: [...path, child.entry.id] });
    }
  }
  return new Set();
}

function nodeHasConversation(node: SessionTreeNode): boolean {
  if (isConversationEntry(node.entry)) return true;
  const previewRole = node.branchPreview?.role;
  return previewRole === "user" || previewRole === "assistant";
}

/** Does this branch (down its single-child chain) hold a real message? */
export function chainHasConversation(node: SessionTreeNode): boolean {
  const stack: SessionTreeNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (nodeHasConversation(current)) return true;
    if (current.children.length === 1) stack.push(current.children[0]);
  }
  return false;
}

// Compress a visible linear chain into the first branching/leaf node.
// Server-side compressed IDs also count as skipped nodes.
// branchPreview is the bounded preview of the first message on the source
// chain. labelEntry keeps unprojected/test shapes working as a fallback.
export function compressChain(node: SessionTreeNode): {
  node: SessionTreeNode;
  skipped: number;
  branchPreview?: BranchPreview;
  labelEntry: SessionEntry;
} {
  let current = node;
  let branchPreview = current.branchPreview;
  let labelEntry: SessionEntry | null = isMessageEntry(current.entry) ? current.entry : null;
  let skipped = current.compressedEntryIds?.length ?? 0;
  while (current.children.length === 1) {
    current = current.children[0];
    branchPreview ??= current.branchPreview;
    if (!labelEntry && isMessageEntry(current.entry)) labelEntry = current.entry;
    skipped += 1 + (current.compressedEntryIds?.length ?? 0);
  }
  return { node: current, skipped, branchPreview, labelEntry: labelEntry ?? current.entry };
}

// Top-level rows of the panel: with multiple roots (a branch was started from
// the very first message) the roots themselves are the branches; otherwise the
// children of the first branching node.
export function selectTopLevelBranches(tree: SessionTreeNode[]): SessionTreeNode[] {
  if (tree.length > 1) return tree;
  if (tree.length === 0) return [];
  const first = compressChain(tree[0]).node;
  return first.children.length > 1 ? first.children : [];
}

// Does the tree hold two branches a reader could tell apart? A split that only
// separates tool calls or internal records is not a branch the reader asked for.
export function hasSessionBranches(nodes: SessionTreeNode[]): boolean {
  // Sessions branched from the very first message have multiple root nodes.
  if (nodes.length > 1) return nodes.filter(chainHasConversation).length > 1;
  return collectDecisionParents(nodes).length > 0;
}

// Is there a branch the reader can actually switch to? `hasSessionBranches`
// answers "does the tree split"; this also requires the panel to have rows to
// show (a split the viewer cannot pick from is a dead control).
export function hasNavigableBranches(tree: SessionTreeNode[]): boolean {
  return hasSessionBranches(tree) && selectTopLevelBranches(tree).length > 0;
}

/** One branch a decision point offers. */
export interface BranchOption {
  /** Entry to navigate to: the tip of that branch (its deepest reachable leaf). */
  tipId: string;
  /** The branch's first user/assistant entry (or its representative when the body is compressed away). */
  entryId: string;
  /** First line of that branch's first user/assistant message, truncated. */
  label: string;
  role: Role | null;
  /** The source entry's ISO timestamp, when the branch has a real message entry. */
  timestamp: string | null;
}

/** A place where the conversation splits into readable versions. */
export interface BranchDecisionPoint {
  /** The entry whose children are the branches; `null` for a split off the first message (multiple roots). */
  parentEntryId: string | null;
  /** Index of the branch the current leaf lives on, or -1 when the leaf is the parent itself / unknown. */
  activeIndex: number;
  total: number;
  options: BranchOption[];
  /**
   * Conversation entry the footer pager renders under: the last answer of the
   * active branch segment (up to the next decision point). `null` when the
   * active branch cannot be resolved, so no control is shown.
   */
  anchorEntryId: string | null;
}

export const BRANCH_LABEL_MAX = 48;

/** First non-empty line, whitespace-collapsed and truncated for a tree row. */
export function firstLineLabel(text: string, max = BRANCH_LABEL_MAX): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const line = lines.find((candidate) => candidate.trim().length > 0) ?? "";
  const normalized = line.replace(/\s+/g, " ").trim();
  const characters = Array.from(normalized);
  if (characters.length <= max) return normalized;
  return `${characters.slice(0, max).join("")}…`;
}

function labelOf(entry: SessionEntry): string {
  return firstLineLabel(conversationText(entry));
}

/** Deepest leaf under this node (deterministic: first one wins on a tie). */
function deepestTip(node: SessionTreeNode): string {
  let best = node.entry.id;
  let bestDepth = 0;
  const stack: { node: SessionTreeNode; depth: number }[] = [{ node, depth: 0 }];
  while (stack.length > 0) {
    const { node: current, depth } = stack.pop()!;
    if (current.children.length === 0) {
      if (depth > bestDepth) {
        bestDepth = depth;
        best = current.entry.id;
      }
      continue;
    }
    for (let index = current.children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: current.children[index], depth: depth + 1 });
    }
  }
  return best;
}

/**
 * Label of a branch: its first real user/assistant message, or the server's
 * bounded preview when the body was compressed away.
 */
function branchLabel(branch: SessionTreeNode): { label: string; role: Role | null; entryId: string; timestamp: string | null } {
  let current = branch;
  let preview = current.branchPreview;
  let entry: SessionEntry | null = isConversationEntry(current.entry) ? current.entry : null;
  while (!entry && current.children.length === 1) {
    current = current.children[0];
    preview ??= current.branchPreview;
    if (isConversationEntry(current.entry)) entry = current.entry;
  }
  // A preview describes the first message of the chain, which wins over the
  // representative the panel selects (same rule as BranchNavigator's rows).
  const label = preview ? firstLineLabel(preview.text) : entry ? labelOf(entry) : "";
  return {
    label,
    role: preview?.role ?? (entry ? roleOf(entry) : null),
    entryId: entry?.id ?? branch.entry.id,
    timestamp: entry?.timestamp ?? null,
  };
}

/** Pre-order parents with more than one conversation branch. */
function collectDecisionParents(nodes: SessionTreeNode[]): SessionTreeNode[] {
  const parents: SessionTreeNode[] = [];
  const stack = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    let conversations = 0;
    for (const child of node.children) {
      if (chainHasConversation(child)) conversations += 1;
    }
    if (conversations > 1) parents.push(node);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      stack.push(node.children[index]);
    }
  }
  return parents;
}

/**
 * Last answer of the active branch segment: walk the active path from the
 * branch start and stop right before the next decision point, so a nested
 * split owns its own pager and the two never share a message.
 */
function activeSegmentAnchor(
  branch: SessionTreeNode,
  leafId: string,
  activePath: ReadonlySet<string>,
  decisionParents: ReadonlySet<string>,
): string | null {
  let lastConversation: string | null = null;
  let lastAssistant: string | null = null;
  let current: SessionTreeNode | undefined = branch;
  let isStart = true;
  while (current) {
    if (!isStart && decisionParents.has(current.entry.id)) break;
    if (isConversationEntry(current.entry)) {
      lastConversation = current.entry.id;
      if (roleOf(current.entry) === "assistant") lastAssistant = current.entry.id;
    } else if (nodeHasConversation(current)) {
      lastConversation = current.compressedEntryIds?.at(-1) ?? current.entry.id;
    }
    // The leaf is the tip of the viewed branch: a node that carries it as a
    // compressed id (or is the leaf itself) is where this segment ends, even
    // when the tree keeps later entries under it.
    if (current.entry.id === leafId || current.compressedEntryIds?.includes(leafId)) break;
    // buildActivePath already walked the tree once; membership here is O(1).
    const next: SessionTreeNode | undefined = current.children.find((child) => activePath.has(child.entry.id));
    if (next) {
      current = next;
    } else if (current.children.length === 1) {
      current = current.children[0];
    } else {
      current = undefined;
    }
    isStart = false;
  }
  return lastAssistant ?? lastConversation;
}

function buildDecision(
  parentEntryId: string | null,
  branches: SessionTreeNode[],
  leafId: string | null,
  activePath: ReadonlySet<string>,
  decisionParents: ReadonlySet<string>,
): BranchDecisionPoint {
  const activeBranchIndex = leafId
    ? branches.findIndex((branch) => activePath.has(branch.entry.id))
    : -1;
  const options: BranchOption[] = branches.map((branch) => {
    const { label, role, entryId, timestamp } = branchLabel(branch);
    const tipId = activeBranchIndex >= 0 && leafId && activePath.has(branch.entry.id)
      ? leafId
      : deepestTip(branch);
    return { tipId, entryId, label, role, timestamp };
  });
  const anchorEntryId = activeBranchIndex >= 0 && leafId
    ? activeSegmentAnchor(branches[activeBranchIndex], leafId, activePath, decisionParents)
    : null;
  return {
    parentEntryId,
    activeIndex: activeBranchIndex,
    total: options.length,
    options,
    anchorEntryId,
  };
}

const decisionCache = new WeakMap<SessionTreeNode[], Map<string, BranchDecisionPoint[]>>();

/**
 * Decision points of a session tree for the given leaf.
 *
 * Cached per tree array (a session load hands over a fresh array), so a chat
 * with hundreds of answers computes this once per render pass, not per message.
 */
export function getBranchDecisions(tree: SessionTreeNode[], activeLeafId: string | null): BranchDecisionPoint[] {
  if (!tree || tree.length === 0) return [];
  const key = activeLeafId ?? "";
  let byLeaf = decisionCache.get(tree);
  if (byLeaf) {
    const cached = byLeaf.get(key);
    if (cached) return cached;
  } else {
    byLeaf = new Map();
    decisionCache.set(tree, byLeaf);
  }

  const parents = collectDecisionParents(tree);
  const decisionParents = new Set(parents.map((node) => node.entry.id));
  const rootBranches = tree.length > 1 ? tree.filter(chainHasConversation) : [];

  // The common case is a linear session (or a tool-call fan-out): stop before
  // walking the path, which copies an array per level on long chains.
  if (parents.length === 0 && rootBranches.length < 2) {
    if (byLeaf.size > 4) byLeaf.clear();
    byLeaf.set(key, []);
    return [];
  }

  const activePath = activeLeafId ? buildActivePath(tree, activeLeafId) : new Set<string>();
  const decisions: BranchDecisionPoint[] = [];
  if (rootBranches.length > 1) {
    decisions.push(buildDecision(null, rootBranches, activeLeafId, activePath, decisionParents));
  }
  for (const parent of parents) {
    const branches = parent.children.filter(chainHasConversation);
    if (branches.length > 1) {
      decisions.push(buildDecision(parent.entry.id, branches, activeLeafId, activePath, decisionParents));
    }
  }
  // A page keeps at most a couple of leaves alive; a session switch swaps the
  // tree array itself (a new WeakMap entry), so this only bounds tree reuse.
  if (byLeaf.size > 4) byLeaf.clear();
  byLeaf.set(key, decisions);
  return decisions;
}

/** The decision whose footer pager belongs on this message entry, if any. */
export function findBranchDecision(
  decisions: BranchDecisionPoint[] | undefined,
  entryId: string | undefined,
): BranchDecisionPoint | undefined {
  if (!decisions || !entryId) return undefined;
  return decisions.find((decision) => decision.anchorEntryId === entryId);
}

/**
 * Resolve decision anchors against the rendered transcript's entryIds/messages
 * when a projected branch ends at a non-message leaf (e.g. `plan-mode-state`
 * custom entry) whose conversation entries live in `compressedEntryIds`, or
 * when `tree=summary` stripped `entry.message`.
 */
export function resolveBranchDecisionAnchors(
  decisions: BranchDecisionPoint[],
  tree: SessionTreeNode[] | undefined,
  activeLeafId: string | null,
  entryIds: readonly string[],
  messages: readonly { role?: string }[],
): BranchDecisionPoint[] {
  if (decisions.length === 0 || !tree || tree.length === 0 || !activeLeafId || entryIds.length === 0) {
    return decisions;
  }
  const roleByEntryId = new Map<string, string>();
  for (let i = 0; i < entryIds.length; i += 1) {
    const id = entryIds[i];
    const role = messages[i]?.role;
    if (id && role) roleByEntryId.set(id, role);
  }
  if (decisions.every((d) => d.anchorEntryId && roleByEntryId.get(d.anchorEntryId) === "assistant")) {
    return decisions;
  }

  const parents = collectDecisionParents(tree);
  const decisionParents = new Set(parents.map((node) => node.entry.id));
  const activePath = buildActivePath(tree, activeLeafId);
  const parentMap = new Map<string | null, SessionTreeNode[]>();
  const rootBranches = tree.length > 1 ? tree.filter(chainHasConversation) : [];
  if (rootBranches.length > 1) parentMap.set(null, rootBranches);
  for (const parent of parents) {
    const branches = parent.children.filter(chainHasConversation);
    if (branches.length > 1) parentMap.set(parent.entry.id, branches);
  }

  return decisions.map((decision) => {
    if (decision.anchorEntryId && roleByEntryId.get(decision.anchorEntryId) === "assistant") {
      return decision;
    }
    const branches = parentMap.get(decision.parentEntryId);
    const branch = branches?.[decision.activeIndex];
    if (!branch) return decision;

    let lastRendered: string | null = null;
    let lastAssistant: string | null = null;
    let current: SessionTreeNode | undefined = branch;
    let isStart = true;
    while (current) {
      if (!isStart && decisionParents.has(current.entry.id)) break;
      const candidateIds = current.compressedEntryIds?.length
        ? [...current.compressedEntryIds, current.entry.id]
        : [current.entry.id];
      for (const id of candidateIds) {
        const role = roleByEntryId.get(id);
        if (role) {
          lastRendered = id;
          if (role === "assistant") lastAssistant = id;
        }
        if (id === activeLeafId) break;
      }
      if (current.entry.id === activeLeafId || current.compressedEntryIds?.includes(activeLeafId)) break;
      const next: SessionTreeNode | undefined = current.children.find((child) => activePath.has(child.entry.id));
      if (next) {
        current = next;
      } else if (current.children.length === 1) {
        current = current.children[0];
      } else {
        current = undefined;
      }
      isStart = false;
    }
    const resolved = lastAssistant ?? lastRendered ?? decision.anchorEntryId;
    return resolved === decision.anchorEntryId ? decision : { ...decision, anchorEntryId: resolved };
  });
}
