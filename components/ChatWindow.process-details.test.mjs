import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("groups the leading segment when the history page starts mid-turn", () => {
  // A turn longer than the initial page loses its anchor, and the old loop
  // flattened every message before the first anchor instead of grouping them.
  assert.match(source, /const hasAnchor = isMessageGroupAnchor\(msg\)/);
  assert.match(source, /if \(!hasAnchor && idx !== 0\)/);
  assert.match(source, /const userIdx = hasAnchor \? idx : -1/);
  assert.match(source, /const groupStartIdx = hasAnchor \? idx : 0/);
  assert.match(source, /if \(hasAnchor\) rendered\.push\(renderMessage\(userIdx\)\)/);
});

const workGroups = await readFile(new URL("./WorkGroups.tsx", import.meta.url), "utf8");

test("expands process details when a completed turn has no final answer", () => {
  assert.match(workGroups, /const \[expanded, setExpanded\] = useState\(defaultExpanded\)/);
  assert.match(
    source,
    /<FinishedWorkGroup[\s\S]*?defaultExpanded=\{!finalAnswerMessage \|\|/,
  );
});

test("resets process details when the turn gains or loses its final answer", () => {
  // useState only reads defaultExpanded on mount; keying on answer availability
  // makes an answered turn start collapsed even if it first rendered unanswered.
  assert.match(
    source,
    /<FinishedWorkGroup\s+key=\{finalAnswerMessage \? "answered" : "unanswered"\}/,
  );
});

test("Plus: the running turn's work is grouped behind a live row when the level asks for it", () => {
  assert.match(source, /workPolicy\.groupLiveWork/);
  assert.match(source, /<LiveWorkGroup/);
  assert.match(source, /liveStreamAnswer/);
});

test("Plus: verbose shows finished work without a fold", () => {
  assert.match(source, /workPolicy\.foldCompletedTurns \? \(/);
});
