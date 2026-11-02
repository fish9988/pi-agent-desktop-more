import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

// External links in the desktop WebView used to navigate the app itself: an
// `<a href="https://…">` nobody intercepted replaced the whole UI with that
// page and the window has no way back. Two layers now prevent it:
//
// 1. every external anchor calls handleExternalLinkClick (source assertions
//    below), and
// 2. AppShell installs a document-level capture guard so a future `<a>` that
//    forgets the handler still cannot take the app down (behaviour tests).
const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { externalLinkHref, installExternalLinkGuard, handleExternalLinkClick } =
  await jiti.import("../lib/desktop-native.ts");

// --- a fake Tauri window so openExternal goes through a recording invoke ----

function fakeDesktopWindow() {
  const invocations = [];
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args) => {
        invocations.push({ cmd, args });
        return null;
      },
    },
  };
  return invocations;
}

class FakeAnchor {
  constructor(attributes) {
    this.attributes = attributes;
  }
  closest(selector) {
    return selector === "a[href]" && "href" in this.attributes ? this : null;
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }
}

function fakeDocument() {
  const listeners = [];
  return {
    listeners,
    addEventListener(type, handler, capture) {
      listeners.push({ type, handler, capture });
    },
    removeEventListener(type, handler, capture) {
      const index = listeners.findIndex(
        (entry) => entry.type === type && entry.handler === handler && entry.capture === capture,
      );
      if (index !== -1) listeners.splice(index, 1);
    },
    click(event) {
      for (const entry of listeners) if (entry.type === "click") entry.handler(event);
    },
  };
}

function fakeClickEvent(anchor, overrides = {}) {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    target: anchor,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...overrides,
  };
}

/** Let the guard's open microtask (and openExternal's promise) run. */
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

globalThis.Element = FakeAnchor;

function withGuard(run) {
  const invocations = fakeDesktopWindow();
  const doc = fakeDocument();
  const uninstall = installExternalLinkGuard(doc);
  return run({ doc, invocations, uninstall });
}

// --- the guard itself -------------------------------------------------------

test("an external http(s) anchor is cancelled and opened in the system browser", async () => {
  await withGuard(async ({ doc, invocations, uninstall }) => {
    const event = fakeClickEvent(new FakeAnchor({ href: "https://example.com/docs" }));
    doc.click(event);
    // Navigation is cancelled synchronously, before the deferred open.
    assert.equal(event.defaultPrevented, true);
    assert.equal(invocations.length, 0);
    await flush();
    assert.deepEqual(invocations, [
      { cmd: "open_external_url", args: { url: "https://example.com/docs" } },
    ]);
    uninstall();
  });
});

test("a mailto: anchor also goes through openExternal", async () => {
  await withGuard(async ({ doc, invocations }) => {
    const event = fakeClickEvent(new FakeAnchor({ href: "mailto:someone@example.com" }));
    doc.click(event);
    assert.equal(event.defaultPrevented, true);
    await flush();
    assert.deepEqual(invocations, [
      { cmd: "open_external_url", args: { url: "mailto:someone@example.com" } },
    ]);
  });
});

test("in-app routes, fragments and relative paths are left alone", async () => {
  await withGuard(async ({ doc, invocations }) => {
    for (const href of [
      "#section",
      "/api/sessions/abc/export",
      "?session=abc&cwd=C%3A%5Cwork",
      "components/SettingsPanel.tsx",
      "file:///C:/work/report.html",
      "",
    ]) {
      const event = fakeClickEvent(new FakeAnchor({ href }));
      doc.click(event);
      assert.equal(event.defaultPrevented, false, `${href} must not be intercepted`);
    }
    await flush();
    assert.deepEqual(invocations, []);
  });
});

test("data-allow-navigation opts an anchor out of the guard", async () => {
  await withGuard(async ({ doc, invocations }) => {
    const event = fakeClickEvent(
      new FakeAnchor({ href: "https://example.com/", "data-allow-navigation": "" }),
    );
    doc.click(event);
    assert.equal(event.defaultPrevented, false);
    await flush();
    assert.deepEqual(invocations, []);
  });
});

test("a click another handler already cancelled is not opened again", async () => {
  await withGuard(async ({ doc, invocations }) => {
    // Already defaultPrevented before the guard sees it (an earlier capture
    // listener, or a native handler).
    const preHandled = fakeClickEvent(new FakeAnchor({ href: "https://example.com/a" }), {
      defaultPrevented: true,
    });
    doc.click(preHandled);
    await flush();
    assert.deepEqual(invocations, []);

    // React's onClick runs after the capture guard: by then the navigation is
    // cancelled, so handleExternalLinkClick stays out and the link opens once.
    const event = fakeClickEvent(new FakeAnchor({ href: "https://example.com/b" }));
    doc.click(event);
    handleExternalLinkClick(event, "https://example.com/b");
    await flush();
    assert.deepEqual(invocations, [
      { cmd: "open_external_url", args: { url: "https://example.com/b" } },
    ]);
  });
});

test("modified and non-primary clicks keep the browser's own behaviour", async () => {
  await withGuard(async ({ doc, invocations }) => {
    for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      const event = fakeClickEvent(new FakeAnchor({ href: "https://example.com/" }), overrides);
      doc.click(event);
      assert.equal(event.defaultPrevented, false);
    }
    await flush();
    assert.deepEqual(invocations, []);
  });
});

test("nothing is intercepted outside the desktop shell", async () => {
  const invocations = [];
  globalThis.window = { open: (...args) => invocations.push(args) };
  const doc = fakeDocument();
  installExternalLinkGuard(doc);
  const event = fakeClickEvent(new FakeAnchor({ href: "https://example.com/" }));
  doc.click(event);
  assert.equal(event.defaultPrevented, false);
  await flush();
  assert.deepEqual(invocations, []);
});

test("externalLinkHref only accepts the schemes the shell can open", () => {
  assert.equal(externalLinkHref("https://example.com/a"), "https://example.com/a");
  assert.equal(externalLinkHref("  http://localhost:4321  "), "http://localhost:4321");
  assert.equal(externalLinkHref("mailto:a@b.c"), "mailto:a@b.c");
  assert.equal(externalLinkHref("https://example.com/a", true), null);
  for (const href of [null, undefined, "", "#x", "/api/files/a", "?session=1", "javascript:alert(1)", "C:\\work\\a.txt"]) {
    assert.equal(externalLinkHref(href), null, `${String(href)} must stay in the app`);
  }
});

test("the capture listener is installed on the document and can be removed", () => {
  const doc = fakeDocument();
  fakeDesktopWindow();
  const uninstall = installExternalLinkGuard(doc);
  assert.deepEqual(doc.listeners.map((entry) => [entry.type, entry.capture]), [["click", true]]);
  uninstall();
  assert.equal(doc.listeners.length, 0);
});

// --- wiring: AppShell installs it, anchors use it ---------------------------

const read = (url) => readFile(new URL(url, import.meta.url), "utf8");

test("AppShell installs the guard once, with no state and no render", async () => {
  const appShell = await read("./AppShell.tsx");
  assert.match(appShell, /import \{[^}]*installExternalLinkGuard[^}]*\} from "@\/lib\/desktop-native"/);
  assert.match(appShell, /useEffect\(\(\) => installExternalLinkGuard\(\), \[\]\)/);
});

test("the guard stays a lightweight capture listener with an opt-out", async () => {
  const source = await read("../lib/desktop-native.ts");
  assert.match(source, /doc\.addEventListener\("click", handleClick, true\)/);
  assert.match(source, /anchor\.hasAttribute\("data-allow-navigation"\)/);
  assert.match(source, /if \(!isTauriDesktop\(\)\) return;/);
  assert.match(source, /event\.button !== 0 \|\| event\.defaultPrevented/);
  // Only these reach the system browser; everything else stays in the app.
  assert.ok(
    source.includes(String.raw`const EXTERNAL_LINK_SCHEMES = /^(?:https?:\/\/|mailto:)/i;`),
    "the guard must only accept http(s) and mailto",
  );
});

/**
 * Every `<a>` that can leave the app must intercept the click. The tag window
 * is generous on purpose: props such as long inline styles or arrow handlers
 * still sit inside it.
 */
const EXTERNAL_ANCHOR_FILES = [
  "AppUpdatesSection.tsx",
  "FrontmatterCard.tsx",
  "MarkdownBody.tsx",
  "McpSignIn.tsx",
  "ModelsConfig.tsx",
  "PluginsConfig.tsx",
  "SettingsUi.tsx",
  "SkillsConfig.tsx",
  "UpdateReminder.tsx",
];

test("no component renders a bare target=_blank anchor", async () => {
  for (const file of EXTERNAL_ANCHOR_FILES) {
    const source = await read(`./${file}`);
    const anchors = source.split(/<a\b/).slice(1).map((chunk) => chunk.slice(0, 1200));
    assert.ok(anchors.length > 0, `${file}: expected at least one anchor`);
    for (const anchor of anchors) {
      if (!anchor.includes('target="_blank"')) continue;
      assert.match(
        anchor,
        /onClick=/,
        `${file}: a target="_blank" anchor has no onClick — it would navigate the desktop WebView`,
      );
    }
  }
});

test("the previously bare links call handleExternalLinkClick", async () => {
  const expected = [
    ["PluginsConfig.tsx", [
      'handleExternalLinkClick(event, "https://pi.dev/packages")',
      "handleExternalLinkClick(event, entry.repoUrl || entry.npmUrl)",
    ]],
    ["SkillsConfig.tsx", [
      "handleExternalLinkClick(event, skill.install?.skillsShUrl)",
      "handleExternalLinkClick(event, r.url)",
    ]],
    ["ModelsConfig.tsx", [
      'handleExternalLinkClick(event, "https://github.com/anomalyco/models.dev")',
      "handleExternalLinkClick(event, loginState.url)",
      "handleExternalLinkClick(event, loginState.verificationUri)",
    ]],
    ["SettingsUi.tsx", ["handleExternalLinkClick(event, catalog.href)"]],
    ["McpSignIn.tsx", ["handleExternalLinkClick(event, link)"]],
    ["FrontmatterCard.tsx", ["handleExternalLinkClick(event, value)"]],
    ["FileViewer.tsx", ["handleExternalLinkClick(event, href)"]],
  ];
  for (const [file, calls] of expected) {
    const source = await read(`./${file}`);
    for (const call of calls) {
      assert.ok(
        source.includes(`onClick={(event) => ${call}}`),
        `${file}: missing onClick that intercepts ${call}`,
      );
    }
  }
});

test("ModelsConfig opens OAuth URLs through openExternal, never window.open", async () => {
  const source = await read("./ModelsConfig.tsx");
  assert.doesNotMatch(source, /window\.open\(/);
  assert.match(source, /void openExternal\(data\.url!\);/);
  assert.match(source, /void openExternal\(data\.verificationUri!\);/);
});
