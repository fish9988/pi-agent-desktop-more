// The folded Settings window used to keep its state inside the window bar, so
// every entry point that re-set the same open section looked broken: React
// bailed out and the 42px strip stayed folded. The store is what AppShell and
// the bar agree on, so these are the guarantees it has to keep.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  expandSettingsWindow,
  isSettingsWindowMinimized,
  resetSettingsWindowForTests,
  setSettingsWindowMinimized,
  settingsWindowMinimizedSnapshot,
  subscribeSettingsWindow,
} = await jiti.import("./plus-settings-window.ts");

test("folding and expanding notifies subscribers exactly once per change", () => {
  resetSettingsWindowForTests();
  let calls = 0;
  const unsubscribe = subscribeSettingsWindow(() => { calls += 1; });
  assert.equal(isSettingsWindowMinimized(), false);

  setSettingsWindowMinimized(true);
  assert.equal(isSettingsWindowMinimized(), true);
  assert.equal(calls, 1);

  // Setting the same value again must not re-render the app.
  setSettingsWindowMinimized(true);
  assert.equal(calls, 1);

  expandSettingsWindow();
  assert.equal(isSettingsWindowMinimized(), false);
  assert.equal(calls, 2);

  unsubscribe();
  setSettingsWindowMinimized(true);
  assert.equal(calls, 2);
});

test("the snapshot a fresh client gets is the unfolded window", () => {
  resetSettingsWindowForTests();
  assert.equal(settingsWindowMinimizedSnapshot(), false);
});

test("every way into Settings unfolds the window", () => {
  const shell = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const bar = readFileSync(new URL("../components/PlusSettingsWindowBar.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

  // The sidebar button / Ctrl+, / native menu path.
  const opener = shell.slice(shell.indexOf("const openSettingsAtLastSection"), shell.indexOf("const toggleShortcutHelp"));
  assert.match(opener, /expandSettingsWindow\(\);/);
  // The composer (/mcp) and the update reminder go through the same helper.
  assert.match(shell, /const openSettingsSection = useCallback\(\(section: SettingsSection\) => \{\n\s*expandSettingsWindow\(\);/);
  // Ctrl+, works while folded instead of being swallowed as "already open".
  assert.match(shell, /onOpenSettings: settingsSection && !settingsWindowMinimized \? undefined : openSettingsAtLastSection/);

  // The bar itself: single store value, click-to-restore, and the fold button
  // is where keyboard focus lands so it can be reversed without a mouse.
  assert.match(bar, /const minimized = useSyncExternalStore\(\s*subscribeSettingsWindow,/);
  assert.doesNotMatch(bar, /const \[minimized, setMinimized\] = useState/);
  assert.match(bar, /if \(minimized && !drag\.moved\) expandSettingsWindow\(\);/);
  assert.match(bar, /foldButtonRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  // Docking always unfolds: a folded window in the corner while "docked" would lie about the layout.
  assert.match(bar, /const toggleDockMode = useCallback\(\(\) => \{\n\s*expandSettingsWindow\(\);/);
});
