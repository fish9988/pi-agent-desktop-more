import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { projectForCwd } = await jiti.import("./sidebar-project.ts");

// Plus: ported pi-web 5a2f991b (#1307) — a listing's checkouts count only when
// the listing is a checkout's own (isTopLevel).

const main = { path: "/work/app", branch: "main" };
const feature = { path: "/work/app-worktrees/feature", branch: "feature" };

test("a session click right after a subdirectory keeps the clicked session's project (#1307)", () => {
  // The sidebar's cwd moved from /work/app/web to the repository root; the
  // listing is still the subdirectory's, which names the root's checkouts.
  const listing = {
    forCwd: "/work/app/web",
    projectRoot: "/work/app/web",
    projectKey: "/work/app/web",
    isTopLevel: false,
    worktrees: [main, feature],
  };
  const sessions = [
    { cwd: "/work/app/web", projectRoot: "/work/app/web", projectKey: "/work/app/web" },
    { cwd: "/work/app", projectRoot: "/work/app", projectKey: "app-key" },
    { cwd: feature.path, projectRoot: "/work/app", projectKey: "app-key" },
  ];
  const known = { listing, sessions, isChat: false };
  assert.deepEqual(projectForCwd("/work/app", known), { root: "/work/app", key: "app-key", kind: "project" });
  assert.deepEqual(projectForCwd(feature.path, known), { root: "/work/app", key: "app-key", kind: "project" });
  assert.deepEqual(projectForCwd("/work/app/web", known), { root: "/work/app/web", key: "/work/app/web", kind: "project" });
});

test("a checkout's listing keeps its worktrees in its project before they have sessions", () => {
  const listing = {
    forCwd: main.path,
    projectRoot: "/work/app",
    projectKey: "app-key",
    isTopLevel: true,
    worktrees: [main, feature],
  };
  assert.deepEqual(
    projectForCwd(feature.path, { listing, sessions: [], isChat: false }),
    { root: "/work/app", key: "app-key", kind: "project" },
  );
  // The listing's own cwd resolves through its identity even when top-level.
  assert.deepEqual(
    projectForCwd(main.path, { listing, sessions: [], isChat: false }),
    { root: "/work/app", key: "app-key", kind: "project" },
  );
  // A folder nobody knows is a project of its own.
  assert.deepEqual(
    projectForCwd("/tmp/new", { listing, sessions: [], isChat: false }),
    { root: "/tmp/new", key: "/tmp/new", kind: "project" },
  );
});

test("a chat cwd keeps the chat workspace kind", () => {
  assert.deepEqual(
    projectForCwd("/tmp/chat", { listing: null, sessions: [], isChat: true }),
    { root: "/tmp/chat", key: "/tmp/chat", kind: "chat" },
  );
});
