import { NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Plus: a cheap fingerprint of custom.css (mtime + size). The page polls it
 * and re-fetches the stylesheet when it changes, so edits made in any editor
 * apply without reloading the window.
 */
export async function GET() {
  const filePath = join(getAgentDir(), "desktop", "custom.css");
  try {
    const info = await stat(filePath);
    return NextResponse.json(
      { version: `${Math.round(info.mtimeMs)}-${info.size}`, exists: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ version: "none", exists: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
