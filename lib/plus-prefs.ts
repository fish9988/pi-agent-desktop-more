import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Plus: preferences mirrored to `<agentDir>/desktop/plus-prefs.json`.
 *
 * The desktop WebView keeps localStorage per origin, and the origin includes
 * the local server's port: when the app starts on another port, every
 * preference (theme, fonts, widths, sidebar state…) looked reset. The keys
 * below are copied to a file on every change and written back into
 * localStorage before anything else runs (PLUS_PREFS_SEED_SCRIPT), so they
 * survive port changes and reinstalls.
 */

/** Preference keys worth keeping; drafts, caches of server data and per-tab state are left out. */
export const PLUS_PREF_KEY_PATTERN = "^(?:pi-(?:theme|locale|sound-enabled|quote-selection-enabled|sidebar-width|right-panel-width|file-tree-width|desktop-close-quits|desktop-notify-on-complete|diff-view-mode|chat-content-[a-z-]+|enter-send-mode|thinking-expanded|tool-preset|chat-find-highlight-style|workspace-v1|plus-[a-z-]+)|pi-web:(?:archived-projects|project-view-mode|collapsed-projects|expanded-projects|collapsed-chats|chat-session-pages|pinned-chats|archived-chats))$";

const KEY = new RegExp(PLUS_PREF_KEY_PATTERN);
const MAX_VALUE_CHARS = 512 * 1024;
const MAX_TOTAL_CHARS = 4 * 1024 * 1024;

export type PlusPrefs = Record<string, string>;

/**
 * pi's agent dir without importing the SDK: this route runs during the
 * first paint, and loading the SDK cold takes seconds.
 */
export function plusAgentDir(): string {
  const env = process.env.PI_CODING_AGENT_DIR;
  if (env) return env.startsWith("~") ? path.join(homedir(), env.slice(1)) : env;
  return path.join(homedir(), ".pi", "agent");
}

export function prefsFile(agentDir: string = plusAgentDir()): string {
  return path.join(agentDir, "desktop", "plus-prefs.json");
}

export function isSyncedPrefKey(key: string): boolean {
  return KEY.test(key);
}

export async function readPlusPrefs(file: string): Promise<{ prefs: PlusPrefs; initialized: boolean }> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
    const prefs: PlusPrefs = {};
    if (parsed && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (isSyncedPrefKey(key) && typeof value === "string") prefs[key] = value;
      }
    }
    return { prefs, initialized: true };
  } catch {
    return { prefs: {}, initialized: false };
  }
}

/** Apply a patch (`null` removes a key); unknown keys and oversized values are ignored. */
export function mergePlusPrefs(current: PlusPrefs, patch: Record<string, unknown>): PlusPrefs {
  const next: PlusPrefs = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!isSyncedPrefKey(key)) continue;
    if (value === null) delete next[key];
    else if (typeof value === "string" && value.length <= MAX_VALUE_CHARS) next[key] = value;
  }
  let total = 0;
  for (const [key, value] of Object.entries(next)) {
    total += key.length + value.length;
    if (total > MAX_TOTAL_CHARS) delete next[key];
  }
  return next;
}

let writeChain: Promise<unknown> = Promise.resolve();

/** Serialised read-merge-write so concurrent PUTs cannot drop each other's keys. */
export function updatePlusPrefs(file: string, patch: Record<string, unknown>): Promise<PlusPrefs> {
  const run = writeChain.then(async () => {
    const { prefs } = await readPlusPrefs(file);
    const next = mergePlusPrefs(prefs, patch);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(next, null, 1), "utf8");
    await fs.rename(temp, file);
    return next;
  });
  writeChain = run.catch(() => undefined);
  return run;
}

/**
 * Inline <head> script, first thing on the page: loads the mirrored prefs
 * synchronously (one localhost request) into localStorage, then forwards
 * every later change of a mirrored key to the server. On the first run
 * (no file yet) it uploads the current values.
 */
export const PLUS_PREFS_SEED_SCRIPT = `(function(){try{var ls=window.localStorage;var x=new XMLHttpRequest();x.open("GET","/api/plus-prefs",false);x.send();if(x.status!==200)return;var d=JSON.parse(x.responseText);var P=new RegExp(d.pattern);var S=d.prefs||{};for(var k in S){if(P.test(k)&&ls.getItem(k)!==S[k])ls.setItem(k,S[k])}var pend=null,t=0;function flush(){if(t){clearTimeout(t);t=0}if(!pend)return;var b=JSON.stringify({prefs:pend});pend=null;try{fetch("/api/plus-prefs",{method:"PUT",headers:{"Content-Type":"application/json"},body:b,keepalive:b.length<60000}).catch(function(){})}catch(e){}}function q(k,v){(pend||(pend={}))[k]=v;if(!t)t=setTimeout(flush,400)}var pr=Storage.prototype,set=pr.setItem,rem=pr.removeItem;pr.setItem=function(k,v){set.call(this,k,v);if(this===ls&&P.test(k))q(String(k),String(v))};pr.removeItem=function(k){rem.call(this,k);if(this===ls&&P.test(k))q(String(k),null)};addEventListener("pagehide",flush);if(!d.initialized){for(var i=0;i<ls.length;i++){var key=ls.key(i);if(key&&P.test(key))q(key,ls.getItem(key))}}}catch(e){}})();`;
