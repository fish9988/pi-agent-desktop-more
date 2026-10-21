import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  jumpToMarkdownFragment,
  markdownPreviewRehypePlugins,
  markdownPreviewRemarkPlugins,
  markdownRehypePlugins,
  markdownRemarkPlugins,
} = await jiti.import("./markdown.ts");
const { MarkdownBody } = await jiti.import("../components/MarkdownBody.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

// Both pipelines that render Markdown in the app: the chat one and the file
// preview one. The sanitizer that prefixes `id`s sits in both, so the matching
// fragment-link rule must hold in both.
const pipelines = [
  ["chat", markdownRemarkPlugins, markdownRehypePlugins],
  ["file preview", markdownPreviewRemarkPlugins, markdownPreviewRehypePlugins],
];

function render(markdown, remarkPlugins, rehypePlugins) {
  return renderToStaticMarkup(React.createElement(ReactMarkdown, {
    remarkPlugins,
    rehypePlugins,
  }, markdown));
}

/** The chat bubble's own renderer, where the link's onClick is added. */
function renderChatBody(markdown) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MarkdownBody, { cwd: "/home/me/project", onOpenFile() {} }, markdown),
    ),
  );
}

describe("fragment links follow the sanitizer's id prefix", () => {
  it("keeps a hand-written anchor pair consistent in chat and file previews", () => {
    for (const [name, remarkPlugins, rehypePlugins] of pipelines) {
      const html = render('<a id="s2"></a>\n\n[S2](#s2)', remarkPlugins, rehypePlugins);
      assert.ok(html.includes('id="user-content-s2"'), `${name}: ${html}`);
      assert.ok(html.includes('href="#user-content-s2"'), `${name}: ${html}`);
    }
  });

  it("rewrites the fragment of a raw-HTML anchor as well", () => {
    for (const [name, remarkPlugins, rehypePlugins] of pipelines) {
      const html = render('<a href="#s2">raw</a>', remarkPlugins, rehypePlugins);
      assert.ok(html.includes('href="#user-content-s2"'), `${name}: ${html}`);
    }
  });

  it("keeps footnote links reaching their elements", () => {
    // mdast-util-to-hast generates footnote ids and hrefs already carrying the
    // prefix, and sanitizing prefixes the id once more — an href left as
    // generated would strand every footnote link behind the doubled prefix.
    for (const [name, remarkPlugins, rehypePlugins] of pipelines) {
      const html = render("text[^1]\n\n[^1]: the note", remarkPlugins, rehypePlugins);
      const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
      const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
      assert.ok(hrefs.length >= 2, `${name}: expected footnote links, got ${html}`);
      for (const href of hrefs) {
        assert.ok(ids.has(href), `${name}: #${href} has no element in ${html}`);
      }
    }
  });

  it("does not touch external fragments or a bare hash", () => {
    for (const [name, remarkPlugins, rehypePlugins] of pipelines) {
      const html = render("[ext](https://example.com/docs#section) and [top](#)", remarkPlugins, rehypePlugins);
      assert.ok(html.includes('href="https://example.com/docs#section"'), `${name}: ${html}`);
      assert.ok(html.includes('href="#"'), `${name}: ${html}`);
    }
  });
});

describe("heading anchors", () => {
  // Plus: ported pi-web 2cefb72f. Upstream writes `data-heading-anchor` (its
  // document reader owns the scroll); Plus has no such reader, so the slug goes
  // out as a prefixed `id` and `[go](#heading-two)` lands on it like any other
  // in-page pair.
  const markdown = "# Setup **guide**!\n\n## Configuration\n\n## Configuration\n\n## Configuration-1\n\n## Configuration\n\n## 中文 标题\n\n## `code` & punctuation.\n\n## Compute $x$";

  it("gives every heading a GitHub slug that its own links reach", () => {
    for (const [name, remarkPlugins, rehypePlugins] of pipelines) {
      const html = render(markdown, remarkPlugins, rehypePlugins);
      const ids = [...html.matchAll(/<h[1-6] id="user-content-([^"]*)"/g)].map((match) => match[1]);
      assert.deepEqual(ids, [
        "setup-guide",
        "configuration",
        "configuration-1",
        "configuration-1-1",
        "configuration-2",
        "中文-标题",
        "code--punctuation",
        "compute-x",
      ], name);
    }
  });

  it("lands a [go](#heading) link, in chat and in file previews", () => {
    for (const [name, remarkPlugins, rehypePlugins] of pipelines) {
      const html = render("## Heading two\n\n[go](#heading-two)", remarkPlugins, rehypePlugins);
      assert.ok(html.includes('id="user-content-heading-two"'), `${name}: ${html}`);
      assert.ok(html.includes('href="#user-content-heading-two"'), `${name}: ${html}`);
    }
  });

  it("keeps a raw-HTML heading's own id and still lands on it", () => {
    for (const [name, remarkPlugins, rehypePlugins] of pipelines) {
      const html = render('<h2 id="x">Hi</h2>\n\n[go](#x)', remarkPlugins, rehypePlugins);
      assert.ok(html.includes('id="user-content-x"'), `${name}: ${html}`);
      assert.equal([...html.matchAll(/\sid="/g)].length, 1, `${name}: ${html}`);
      assert.ok(html.includes('href="#user-content-x"'), `${name}: ${html}`);
    }
  });

  it("reads each heading's text before KaTeX writes a formula twice", () => {
    const html = render("## Compute $x$", markdownRemarkPlugins, markdownRehypePlugins);
    assert.ok(html.includes('id="user-content-compute-x"'), html);
    assert.ok(html.includes('class="katex"'), html);
  });
});

describe("chat fragment links", () => {
  it("renders an in-page link without target=_blank and keeps external links external", () => {
    const html = renderChatBody("[jump](#heading-two)\n\n## Heading two\n\n[web](https://example.com/docs)");
    // No target on the fragment link, so a click cannot open a second window.
    assert.match(html, /<h2 id="user-content-heading-two">Heading two<\/h2>/);
    assert.match(html, /<a href="#user-content-heading-two">jump<\/a>/);
    assert.doesNotMatch(html, /<a href="#[^"]*"[^>]*target=/);
    assert.match(
      html,
      /<a (?=[^>]*href="https:\/\/example\.com\/docs")(?=[^>]*target="_blank")(?=[^>]*rel="noopener noreferrer")[^>]*>web<\/a>/,
    );
  });

  it("treats a bare hash as in-page too", () => {
    const html = renderChatBody("[top](#)");
    assert.match(html, /<a href="#">top<\/a>/);
    assert.doesNotMatch(html, /<a href="#"[^>]*target=/);
  });
});

describe("jumpToMarkdownFragment", () => {
  function click(href, overrides = {}) {
    const calls = { prevented: false, selector: null, scrolled: null, root: null };
    const target = { scrollIntoView: (options) => { calls.scrolled = options; } };
    const event = {
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      currentTarget: {
        getAttribute: (name) => (name === "href" ? href : null),
        closest: (selector) => {
          calls.root = selector;
          return { querySelector: (query) => { calls.selector = query; return target; } };
        },
      },
      preventDefault: () => { calls.prevented = true; },
      ...overrides,
    };
    jumpToMarkdownFragment(event);
    return calls;
  }

  globalThis.CSS ??= { escape: (value) => value.replace(/["\\]/g, "\\$&") };

  it("scrolls to the element within the link's own rendered document", () => {
    const calls = click("#user-content-caf%C3%A9");
    assert.equal(calls.prevented, true);
    assert.equal(calls.root, ".markdown-body");
    assert.equal(calls.selector, '[id="user-content-café"], a[name="user-content-café"]');
    assert.deepEqual(calls.scrolled, { block: "start" });
  });

  it("keeps a bare hash off the URL and leaves other links and modified clicks alone", () => {
    assert.deepEqual(click("#"), { prevented: true, selector: null, scrolled: null, root: null });
    assert.equal(click("other.md").prevented, false);
    assert.equal(click("#x", { metaKey: true }).prevented, false);
    assert.equal(click("#x", { button: 1 }).prevented, false);
  });
});
