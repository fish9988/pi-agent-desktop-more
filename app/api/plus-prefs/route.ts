import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { PLUS_PREF_KEY_PATTERN, prefsFile, readPlusPrefs, updatePlusPrefs } from "@/lib/plus-prefs";

export const dynamic = "force-dynamic";

/** Plus: preferences mirrored outside localStorage (see lib/plus-prefs.ts). */
export async function GET() {
  const { prefs, initialized } = await readPlusPrefs(prefsFile());
  return NextResponse.json({ prefs, initialized, pattern: PLUS_PREF_KEY_PATTERN }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(req)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  try {
    const body = await req.json() as { prefs?: unknown };
    if (!body.prefs || typeof body.prefs !== "object") return NextResponse.json({ error: "prefs is required" }, { status: 400 });
    await updatePlusPrefs(prefsFile(), body.prefs as Record<string, unknown>);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
