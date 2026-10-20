#!/usr/bin/env node
/**
 * Plus: mark upstream commits as reviewed after handling an Upstream watch
 * report. Moves each source's "reviewed" pointer in
 * .github/upstream-reviewed.json to the given commit (default: the source's
 * current tip).
 *
 *   node scripts/upstream-reviewed.mjs                 # everything up to the current tips
 *   node scripts/upstream-reviewed.mjs pi-web=<sha>    # one source, up to a commit
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const file = new URL("../.github/upstream-reviewed.json", import.meta.url);
const config = JSON.parse(fs.readFileSync(file, "utf8"));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const explicit = Object.fromEntries(process.argv.slice(2).map((arg) => arg.split("=")));

for (const [name, source] of Object.entries(config.sources)) {
  if (Object.keys(explicit).length && !(name in explicit)) continue;
  let target = explicit[name];
  if (!target) {
    const remote = `watch-${name}`;
    try { execFileSync("git", ["remote", "remove", remote], { stdio: "ignore" }); } catch { /* not present */ }
    git("remote", "add", remote, `https://github.com/${source.repository}.git`);
    git("fetch", "--quiet", "--no-tags", remote, source.branch);
    target = git("rev-parse", `${remote}/${source.branch}`);
    execFileSync("git", ["remote", "remove", remote], { stdio: "ignore" });
  }
  console.log(`${name}: ${source.reviewed.slice(0, 8)} -> ${target.slice(0, 8)}`);
  source.reviewed = target;
}
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
