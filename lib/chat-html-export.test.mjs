import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { buildChatHtmlExport } = await createJiti(import.meta.url).import("./chat-html-export.ts");

test("buildChatHtmlExport embeds Plus theme CSS variables and interactive <details> tool blocks", () => {
  const html = buildChatHtmlExport({
    title: "Kami Theme Session",
    cwd: "/workspace/demo",
    locale: "zh-CN",
    isDark: false,
    themeVariables: {
      "--bg": "#efe7d2",
      "--accent": "#c44d36",
    },
    messages: [
      { role: "user", content: "Read package.json" },
      {
        role: "assistant",
        model: "claude-opus-4-6",
        content: [
          { type: "thinking", thinking: "Checking package.json first" },
          { type: "toolCall", toolCallId: "t1", toolName: "read", input: { path: "package.json" } },
          { type: "text", text: "Here is the package name." },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "t1",
        toolName: "read",
        content: [{ type: "text", text: "{\"name\": \"pi-web\"}" }],
        isError: false,
      },
    ],
  });

  assert.match(html, /--bg:#efe7d2/);
  assert.match(html, /--accent:#c44d36/);
  assert.match(html, /<details class="export-thinking">/);
  assert.match(html, /Checking package\.json first/);
  assert.match(html, /<details class="export-tool">/);
  assert.match(html, /<code class="export-tool-name">read<\/code>/);
  assert.match(html, /&quot;name&quot;: &quot;pi-web&quot;/);
  assert.match(html, /Here is the package name\./);
});
