/**
 * The project identity the sidebar shows for its cwd.
 *
 * Plus resolves that identity from server-provided data only: the worktree
 * listing of the cwd, the session list, and the cwd itself. This module holds
 * the pure lookup so the rule can be unit-tested without mounting the sidebar.
 *
 * Ported from pi-web 5a2f991b (#1307): a listing's checkouts belong to its
 * project only at the top of a checkout (`isTopLevel`). A subdirectory's
 * listing names the repository's checkouts under the subdirectory's own
 * identity, so taking them would give a session of the repository root the
 * subdirectory's key, and AppShell would close it as a project switch.
 */

import type { SessionWorkspaceKind } from "./types";
import { workspaceKeyOf } from "./workspace-memory";

export interface SidebarProjectSelection {
  root: string;
  key: string;
  kind: SessionWorkspaceKind;
}

/** The sidebar's listing of its cwd (`GET /api/worktrees?cwd=`), as the lookup reads it. */
export interface SidebarWorktreeListing {
  forCwd: string;
  projectRoot: string;
  projectKey: string;
  /** False when `forCwd` is a repository subdirectory. */
  isTopLevel: boolean;
  worktrees: readonly { path: string }[];
}

export interface SidebarProjectKnown {
  listing: SidebarWorktreeListing | null;
  sessions: readonly {
    cwd: string;
    projectRoot?: string | null;
    projectKey?: string | null;
    workspaceKind?: SessionWorkspaceKind;
  }[];
  /** True when the cwd is a chat workspace (no project identity). */
  isChat: boolean;
}

function selection(root: string, key: string, kind: SessionWorkspaceKind = "project"): SidebarProjectSelection {
  return { root, key, kind };
}

/**
 * The project of a sidebar cwd, from the worktree listing the sidebar last
 * fetched and its session list. The listing can still be the previous cwd's
 * for the commit after a move.
 */
export function projectForCwd(
  cwd: string,
  known: SidebarProjectKnown,
): SidebarProjectSelection {
  const { listing, sessions } = known;
  if (known.isChat) return selection(cwd, cwd, "chat");
  if (listing && listing.forCwd === cwd) {
    return selection(listing.projectRoot, listing.projectKey);
  }
  // Any path in a checkout's worktree list belongs to that project — covers
  // worktrees without sessions, so switching to them keeps the row mounted.
  // Only a checkout's own listing may name them (#1307).
  if (listing?.isTopLevel && listing.worktrees.some((w) => w.path === cwd)) {
    return selection(listing.projectRoot, listing.projectKey);
  }
  const match = sessions.find((session) => (
    session.cwd === cwd || (session.projectRoot ?? session.cwd) === cwd
  ));
  if (match?.workspaceKind === "chat") {
    return selection(match.cwd, match.cwd, "chat");
  }
  return match
    ? selection(match.projectRoot ?? match.cwd, workspaceKeyOf(match))
    : selection(cwd, cwd);
}
