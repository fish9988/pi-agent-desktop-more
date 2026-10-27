import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { isApiRequestAllowed } from "@/lib/request-security";

/**
 * Serve an optional user-provided stylesheet so the UI (fonts, colors,
 * sizes) can be customized without rebuilding the app.
 *
 * Path: `<agentDir>/desktop/custom.css` (normally ~/.pi/agent/desktop/custom.css).
 * Returns an empty 200 when the file does not exist, so the <link> in the
 * layout never logs a missing-stylesheet error. Served with no-store so
 * edits show up on the next reload without restarting the app.
 */
export async function GET() {
  const filePath = join(getAgentDir(), "desktop", "custom.css");
  let css = "";
  try {
    css = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.error(`custom-css: failed to read ${filePath}:`, error);
    }
  }
  return new NextResponse(css, {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** Starter content written when custom.css is first created. */
const STARTER_CSS = `/* Pi Atelier · 纸枢 (Pi Agent Plus) 自定义样式表
 * 保存文件后应用将自动热重载，无需重启或按 Ctrl+R。
 * 完整变量表与选择器指南请参见项目内的 docs/CUSTOM-CSS.md。
 *
 * 常用变量示例（取消注释即可生效）：
 * html[data-plus-theme]:root {
 *   --accent: #c44d36;
 *   --plus-inline-code: #7a2716;
 *   --plus-inline-code-bg: color-mix(in srgb, #c44d36 13%, var(--surface));
 *   --plus-marker: #c44d36;
 *   --plus-heading-color: var(--accent);
 *   --plus-glass-blur: 18px;
 *   --plus-surface-alpha: 24%;
 * }
 */
`;

/**
 * Ensure the user stylesheet exists (creating a commented starter file on
 * first use) and return its absolute path so the client can open it in the
 * user's editor. Only loopback/allowed-origin requests may create files.
 */
export async function POST(request: NextRequest) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const filePath = join(getAgentDir(), "desktop", "custom.css");
  let created = false;
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.error(`custom-css: failed to read ${filePath}:`, error);
      return NextResponse.json({ error: "Failed to read custom.css" }, { status: 500 });
    }
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, STARTER_CSS, "utf8");
      created = true;
    } catch (writeError) {
      console.error(`custom-css: failed to create ${filePath}:`, writeError);
      return NextResponse.json({ error: "Failed to create custom.css" }, { status: 500 });
    }
  }

  return NextResponse.json({ path: filePath, created });
}

/** Largest stylesheet the in-app editor may save (Plus). */
const MAX_CUSTOM_CSS_BYTES = 1024 * 1024;

/**
 * Plus: save the stylesheet from the in-app editor. Written to a temp file
 * and renamed so a half-written file is never served; the page picks the
 * change up through /api/custom-css/version without a reload.
 */
export async function PUT(request: NextRequest) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  let css: unknown;
  try {
    css = ((await request.json()) as { css?: unknown }).css;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof css !== "string") {
    return NextResponse.json({ error: "css must be a string" }, { status: 400 });
  }
  if (Buffer.byteLength(css, "utf8") > MAX_CUSTOM_CSS_BYTES) {
    return NextResponse.json({ error: "custom.css is limited to 1 MB" }, { status: 413 });
  }
  const filePath = join(getAgentDir(), "desktop", "custom.css");
  try {
    await mkdir(dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, css, "utf8");
    await rename(temp, filePath);
  } catch (error) {
    console.error(`custom-css: failed to save ${filePath}:`, error);
    return NextResponse.json({ error: "Failed to save custom.css" }, { status: 500 });
  }
  return NextResponse.json({ path: filePath, saved: true });
}
