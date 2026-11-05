import { NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Plus: a cheap fingerprint (mtime + size) of custom.css. Callers can poll this
 * to re-point their stylesheet link when the file changes without reloading the
 * window. The app itself has one fixed look and no longer polls; the route stays
 * with the shared custom.css endpoint.
 */
export async function GET() {
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
  return NextResponse.json({ version, exists }, { headers: { "Cache-Control": "no-store" } });
}
