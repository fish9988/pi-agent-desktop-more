import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import ts from "typescript";

const source = await readFile(new URL("./ModelSelector.tsx", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, { tsconfigPaths: true, jsx: { runtime: "automatic" } });
const { ModelSelector, filterModelOptions } = await jiti.import("./ModelSelector.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function render(props) {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      null,
      createElement(ModelSelector, {
        onChange() {},
        ...props,
      }),
    ),
  );
}

test("does not autofocus the model filter on mobile", () => {
  // Autofocus would open the on-screen keyboard as soon as the picker opens.
  assert.match(source, /aria-label=\{t\("chat\.filterModels"\)\}[\s\S]*?autoFocus=\{!isMobile\}/);
  assert.doesNotMatch(source, /^\s*autoFocus\s*$/m);
});

// Plus: ported pi-web 0347c5d4 (#1287). The live composer's selector sends `set_model`
// again for its already-selected row, so an open session can reapply a saved models.json
// edit; draft selectors (no `onReselect`) keep that click a no-op.
test("choosing the already-selected model calls onReselect, and a draft selector stays a no-op", () => {
  const file = ts.createSourceFile("ModelSelector.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function findChoose(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === "choose") return node.initializer;
    return ts.forEachChild(node, findChoose);
  }
  const script = new Script(ts.transpileModule(findChoose(file).getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText);
  const option = { provider: "fixture", modelId: "same-id", name: "Fixture" };

  for (const [active, automatic, live, expected] of [
    [true, false, true, "reselect"],
    [true, false, false, null],
    [true, true, true, "change"],
    [false, false, true, "change"],
    [false, false, false, "change"],
  ]) {
    const calls = [];
    const choose = script.runInNewContext({
      value: active ? option : null,
      isAutoSelection: automatic,
      setOpen: (value) => calls.push(["open", value]),
      setFilter: (value) => calls.push(["filter", value]),
      onChange: (provider, id) => calls.push(["change", provider, id]),
      onReselect: live ? (provider, id) => calls.push(["reselect", provider, id]) : undefined,
    });
    choose(option);
    assert.deepEqual(
      calls,
      [["open", false], ["filter", ""], ...(expected ? [[expected, option.provider, option.modelId]] : [])],
      `active=${active} automatic=${automatic} live=${live}`,
    );
  }
});

test("the composer passes its reselect handler to the model selector", () => {
  const chatInput = readFileSync(new URL("./ChatInput.tsx", import.meta.url), "utf8");
  assert.match(chatInput, /onReselect=\{onModelReselect\}/);
});

// Plus: ported pi-web 0347c5d4 (#1287). The hook's reselect path must not run the
// `loadSession` a real model switch needs (that is what dropped the thinking level and
// raced the model-switch lock); it only reapplies and refreshes quietly.
test("the reselect handler reapplies without a session reload", () => {
  const hook = readFileSync(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const handler = hook.slice(
    hook.indexOf("const handleModelReselect = useCallback"),
    hook.indexOf("const handleSetDefaultModel = useCallback"),
  );
  assert.match(handler, /type: "set_model", provider, modelId/);
  assert.match(handler, /modelSwitchPendingRef\.current/);
  assert.doesNotMatch(handler, /loadSession\(/);
  assert.match(handler, /reloadModelsQuietly\(\)/);
});

test("filters model options by model name, id, provider, and provider/id", () => {
  const options = [
    { provider: "anthropic", modelId: "claude-opus-5", name: "Claude Opus 5" },
    { provider: "openai", modelId: "gpt-6-luna", name: "GPT-6 Luna" },
    { provider: "acme", modelId: "custom-one", name: "Custom One" },
  ];

  assert.deepEqual(filterModelOptions(options, "opus"), [options[0]]);
  assert.deepEqual(filterModelOptions(options, "gpt-6"), [options[1]]);
  assert.deepEqual(filterModelOptions(options, "acme/custom"), [options[2]]);
  assert.deepEqual(filterModelOptions(options, "   "), options);
  assert.deepEqual(filterModelOptions(options, "nonexistent"), []);
});

test("names a current model outside the scope from the loaded full list and supports scoped/all toggle", () => {
  const html = render({
    options: [{ provider: "anthropic", modelId: "claude-opus-5", name: "Claude Opus 5" }],
    allOptions: [{ provider: "openai", modelId: "gpt-6-luna", name: "GPT-6 Luna" }],
    value: { provider: "openai", modelId: "gpt-6-luna" },
    onShowAll() {},
  });

  assert.match(html, /GPT-6 Luna/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /switchScope\(\)/);
});
