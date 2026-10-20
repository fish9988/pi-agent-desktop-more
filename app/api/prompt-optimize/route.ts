import { NextResponse } from "next/server";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { getRpcSession } from "@/lib/rpc-manager";
import { MAX_DRAFT_CHARS, optimizePrompt } from "@/lib/prompt-optimizer";
import { readOptimizerSettings } from "@/lib/prompt-optimizer-settings";

export const dynamic = "force-dynamic";

/** Plus: rewrite the composer draft into a clearer prompt. */
export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(req)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  try {
    const body = await req.json() as { text?: unknown; provider?: unknown; modelId?: unknown; sessionId?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return NextResponse.json({ error: "Nothing to optimise" }, { status: 400 });
    if (text.length > MAX_DRAFT_CHARS) return NextResponse.json({ error: "Draft too long" }, { status: 413 });
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    // Only a session that is already running lends its context; viewing an
    // old conversation must not start one just for this.
    const live = sessionId ? getRpcSession(sessionId) : undefined;
    const agent = live?.isAlive() ? (live.inner as unknown as AgentSession).agent : undefined;
    const result = await optimizePrompt({
      text,
      provider: typeof body.provider === "string" ? body.provider : undefined,
      modelId: typeof body.modelId === "string" ? body.modelId : undefined,
      agent,
      settings: await readOptimizerSettings(),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
