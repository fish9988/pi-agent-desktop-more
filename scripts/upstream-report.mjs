#!/usr/bin/env node
/**
 * Plus: list upstream commits not reviewed yet (see .github/upstream-reviewed.json)
 * as a Markdown report. Read-only: fetches the upstream repositories into
 * remote-tracking refs and never merges anything.
 *
 *   node scripts/upstream-report.mjs [--out report.md]
 *
 * Used by .github/workflows/upstream-watch.yml and runnable locally.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
const config = JSON.parse(fs.readFileSync(new URL("../.github/upstream-reviewed.json", import.meta.url), "utf8"));
const outIndex = process.argv.indexOf("--out");
const out = outIndex > 0 ? process.argv[outIndex + 1] : null;

const sections = [];
let total = 0;
for (const [name, source] of Object.entries(config.sources)) {
  const remote = `watch-${name}`;
  try {
    execFileSync("git", ["remote", "remove", remote], { stdio: "ignore" });
  } catch {
    // not added yet
  }
  git("remote", "add", remote, `https://github.com/${source.repository}.git`);
  git("fetch", "--quiet", "--no-tags", remote, source.branch);
  const tip = git("rev-parse", `${remote}/${source.branch}`);
  const range = `${source.reviewed}..${tip}`;
  const log = git("log", "--no-merges", "--reverse", "--date=short", "--format=%H%x1f%ad%x1f%an%x1f%s", range);
  const commits = log ? log.split("\n").map((line) => {
    const [sha, date, author, subject] = line.split("\x1f");
    let files = 0;
    try {
      files = git("diff-tree", "--no-commit-id", "--name-only", "-r", sha).split("\n").filter(Boolean).length;
    } catch {
      // ignore
    }
    return { sha, date, author, subject, files };
  }) : [];
  total += commits.length;
  const lines = [`## ${name} (${source.repository})`, ""];
  if (commits.length === 0) {
    lines.push("No new commits.");
  } else {
    lines.push(`${commits.length} new commit(s) since \`${source.reviewed.slice(0, 8)}\` (tip \`${tip.slice(0, 8)}\`).`, "");
    const kinds = [
      ["Security / fixes", /^(fix|security|revert)|\bsecurity\b|\bfix\b/i],
      ["Features", /^feat/i],
      ["Other", /./],
    ];
    const used = new Set();
    for (const [title, pattern] of kinds) {
      const group = commits.filter((c) => !used.has(c.sha) && pattern.test(c.subject));
      if (group.length === 0) continue;
      lines.push(`### ${title}`, "");
      for (const c of group) {
        used.add(c.sha);
        lines.push(`- [ ] [\`${c.sha.slice(0, 8)}\`](https://github.com/${source.repository}/commit/${c.sha}) ${c.subject.replace(/\|/g, "\\|")} — ${c.author}, ${c.date}, ${c.files} file(s)`);
      }
      lines.push("");
    }
  }
  sections.push({ name, tip, text: lines.join("\n") });
  try {
    execFileSync("git", ["remote", "remove", remote], { stdio: "ignore" });
  } catch {
    // ignore
  }
}

const report = [
  `# Upstream watch — ${new Date().toISOString().slice(0, 10)}`,
  "",
  total === 0
    ? "Nothing new upstream since the last review."
    : `${total} upstream commit(s) to review. Nothing has been merged: tick the ones worth taking and ask for them to be cherry-picked onto \`plus\`, then mark this report reviewed.`,
  "",
  ...sections.map((section) => section.text),
  "",
  "<!-- tips: " + JSON.stringify(Object.fromEntries(sections.map((s) => [s.name, s.tip]))) + " -->",
].join("\n");

if (out) fs.writeFileSync(out, report);
else process.stdout.write(`${report}\n`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `total=${total}\n`);
