import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TurnWrittenFiles } = await jiti.import("./TurnWrittenFiles.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(TurnWrittenFiles, props)),
  );
}

test("renders a button per file showing the basename and full path", () => {
  const html = render({
    files: [{ filePath: "/abs/out/report.html" }, { filePath: "/abs/out/data.json" }],
    onOpenFile() {},
  });
  assert.match(html, /<button/);
  assert.match(html, /report\.html/);
  assert.match(html, /data\.json/);
  assert.match(html, /title="\/abs\/out\/report\.html"/);
  assert.match(html, /title="\/abs\/out\/data\.json"/);
});

test("renders nothing when no files were written", () => {
  assert.equal(render({ files: [], onOpenFile() {} }), "");
});

test("shows a summary header with total and per-file line counts", () => {
  const html = render({
    files: [{ filePath: "/abs/a.ts", added: 17, removed: 2 }, { filePath: "/abs/b.css", added: 7, removed: 0 }],
    onOpenFile() {},
  });
  assert.match(html, /Edited 2 files/);
  assert.match(html, />\+24</);
  assert.match(html, />−2</);
  assert.match(html, />\+17</);
  assert.match(html, />\+7</);
});

// Plus 1.7: rows show the folder relative to the project and flag files outside it.
test("rows show the project-relative folder and an outside-project tag", () => {
  const html = render({
    cwd: "C:\\pi\\app",
    files: [{ filePath: "C:/pi/app/src-tauri/src/lib.rs" }, { filePath: "C:/pi/shots/probe.ps1" }, { filePath: "c:\\PI\\app\\README.md" }],
    onOpenFile() {},
  });
  assert.match(html, /class="turn-files-dir">src-tauri\/src</);
  assert.match(html, /class="turn-files-dir">\.\.\/shots</);
  assert.equal((html.match(/turn-files-tag/g) || []).length, 1, "only the file outside the project is tagged");
  assert.match(html, /class="turn-files-dir"><\/span>/, "a file at the project root has an empty folder");
});
