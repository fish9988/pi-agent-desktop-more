import { NextRequest, NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { themesDir, userThemeVersion } from "@/lib/plus-user-themes";

/**
 * Plus: cheap fingerprints (mtime + size) of custom.css and, with `?theme=`,
 * of the active imported theme. The page polls this and re-applies whichever
 * changed, so edits made in any editor apply without reloading the window.
 */
export async function GET(request: NextRequest) {
  const agentDir = getAgentDir();
  let version = "none";
  let exists = false;
  try {
    const info = await stat(join(agentDir, "desktop", "custom.css"));
    version = `${Math.round(info.mtimeMs)}-${info.size}`;
    exists = true;
  } catch {
    // no custom.css
  }
  const theme = request.nextUrl.searchParams.get("theme");
  const themeVersion = theme ? await userThemeVersion(themesDir(agentDir), theme) : undefined;
  return NextResponse.json({ version, exists, themeVersion }, { headers: { "Cache-Control": "no-store" } });
}
