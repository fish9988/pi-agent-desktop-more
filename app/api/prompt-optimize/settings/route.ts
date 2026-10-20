import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { OPTIMIZER_INSTRUCTIONS_MAX, readOptimizerSettings, updateOptimizerSettings } from "@/lib/prompt-optimizer-settings";

export const dynamic = "force-dynamic";

/** Plus: settings of the composer's "improve prompt" button. */
export async function GET() {
  return NextResponse.json({ ...(await readOptimizerSettings()), instructionsMax: OPTIMIZER_INSTRUCTIONS_MAX }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(req)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  try {
    const next = await updateOptimizerSettings(await req.json());
    return NextResponse.json({ ...next, instructionsMax: OPTIMIZER_INSTRUCTIONS_MAX });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
