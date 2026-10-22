import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { fileTypeBadge } = await jiti.import("./file-type-badge.ts");

test("file type badge: extension label and language tone", () => {
  assert.deepEqual(fileTypeBadge("lib.rs"), { label: "RS", tone: "orange" });
  assert.deepEqual(fileTypeBadge("FileExplorer.tsx"), { label: "TSX", tone: "blue" });
  assert.deepEqual(fileTypeBadge("open-in-file-manager.test.mjs"), { label: "MJS", tone: "yellow" });
  assert.deepEqual(fileTypeBadge("C:\\x\\explorer-probe.PS1"), { label: "PS1", tone: "indigo" });
  assert.deepEqual(fileTypeBadge("notes.markdown"), { label: "MARK", tone: "grey" }, "long extensions are cut to four letters");
});

test("file type badge: dotfiles and extensionless files", () => {
  assert.deepEqual(fileTypeBadge("Makefile"), { label: "·", tone: "grey" });
  assert.deepEqual(fileTypeBadge(".gitignore"), { label: "·", tone: "grey" });
});
