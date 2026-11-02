// The Settings page search box: how SettingsPanel wires the item index, the
// keyboard, the reveal and the Ctrl/Cmd+F shortcut. The matching itself is
// covered by lib/settings-search.test.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const css = (await readFile(new URL("../app/plus.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("Settings search: the index comes from the settings page, not a second label list", () => {
  assert.match(source, /from "@\/lib\/settings-search"/);
  assert.match(source, /SETTINGS_ROW_SELECTORS/);
  assert.match(source, /collectSettingsItems\(root/);
  // Rows are read from each section host the page already renders, and a row
  // without an attribute gets one so the reveal can find it again.
  assert.match(source, /data-settings-section=\{id\}/);
  assert.match(source, /row\.dataset\.settingsItem = itemId;/);
  // A panel that finishes loading its rows after the first keystroke is rescanned.
  assert.match(source, /new MutationObserver\(/);
});

test("Settings search: every section the page can show is mounted while a query is active", () => {
  // Otherwise a row of a tab the user never opened could not be found.
  assert.match(source, /mountedSections\.has\(id\) \|\| searching/);
  assert.match(source, /className=\{`settings-section-host\$\{searching \? " is-search-hidden" : ""\}`\}/);
  assert.match(css, /\.settings-section-host\.is-search-hidden \{ display: none; \}/);
  // Clearing the query returns to the normal split view.
  assert.match(source, /const searching = pageLayout && query\.trim\(\)\.length > 0;/);
  assert.match(source, /\{pageLayout && !searching && \(\n\s*<header className="plus-settings-page-header">/);
});

test("Settings search: arrow keys move the result and Enter goes there", () => {
  assert.match(source, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(source, /setActiveResult\(\(current\) => \(current \+ step \+ results\.length\) % results\.length\)/);
  assert.match(source, /if \(searching && event\.key === "Enter"\)/);
  assert.match(source, /revealResult\(result\)/);
  assert.match(source, /aria-current=\{index === activeResultIndex \? "true" : undefined\}/);
});

test("Settings search: a hit scrolls to its row and is marked for two seconds", () => {
  assert.match(source, /const REVEAL_HIGHLIGHT_MS = 2000;/);
  assert.match(source, /target\.scrollIntoView\(\{ block: "center" \}\)/);
  assert.match(source, /target\.classList\.add\(REVEAL_CLASS\)/);
  assert.match(source, /target\.classList\.remove\(REVEAL_CLASS\)/);
  assert.match(css, /\.is-plus-settings-revealed \{/);
  // A collapsed block is opened before the row is measured.
  assert.match(source, /HTMLDetailsElement/);
  assert.match(source, /\[aria-controls~="\$\{safeId\}"\]\[aria-expanded="false"\]/);
  // A just-mounted section may still be loading its rows.
  assert.match(source, /const REVEAL_RETRIES = 12;/);
});

test("Settings search: Escape clears the query first, then closes Settings", () => {
  assert.match(source, /if \(event\.key === "Escape" && query\) \{\n\s*event\.preventDefault\(\);\n\s*clearReveal\(\);\n\s*setQuery\(""\);/);
  // The panel-level Escape still belongs to listenForPanelEscape, which skips a
  // handled key (lib/stacked-dialog.test.mjs).
  assert.match(source, /useEffect\(\(\) => listenForPanelEscape\(document, \(\) => \{ if \(!busy\) onClose\(\); \}\), \[onClose, busy\]\);/);
});

test("Settings search: Ctrl/Cmd+F focuses the box only while Settings is open", () => {
  // The dialog claims the shortcut ([data-own-find]) so the chat find bar keeps
  // its own Ctrl+F everywhere else; the handler lives on the dialog, so it is
  // gone with the dialog.
  assert.match(source, /data-own-find="settings"/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "f"/);
  assert.match(source, /searchInputRef\.current\?\.focus\(\);\n\s*searchInputRef\.current\?\.select\(\);/);
  assert.doesNotMatch(source, /addEventListener\("keydown"/);
});

test("Settings search: results are laid out with the settings page tokens", () => {
  for (const className of [
    "plus-settings-search-results",
    "plus-settings-search-summary",
    "plus-settings-search-list",
    "plus-settings-search-result",
    "plus-settings-search-result-label",
    "plus-settings-search-result-hint",
    "plus-settings-search-result-section",
  ]) {
    assert.match(source, new RegExp(`"${className}"`), className);
    assert.match(css, new RegExp(`\\.${className}[ ,{]`), className);
  }
  assert.match(source, /<mark key=\{segmentIndex\} className="plus-settings-search-result-mark">/);
  // Token sizes and colours only: no new card, radius or font step.
  assert.match(css, /\.plus-settings-search-result \{[^}]*font-size: var\(--plus-fs-2, 13px\);/);
  assert.match(css, /\.plus-settings-search-result-mark \{[^}]*background: color-mix\(in srgb, var\(--accent\) 22%, transparent\);/);
});
