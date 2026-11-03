import { NextRequest, NextResponse } from "next/server";
import {
  isDshPluginEnabled,
  listDshPlugins,
  reloadDshHostPlugins,
  setDshPluginConfig,
  setDshPluginEnabled,
} from "@/lib/dsh-plugin-host";
import { isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const plugins = await listDshPlugins();
  return NextResponse.json(
    { plugins },
    { headers: { "Cache-Control": "no-store" } },
  );
}

interface DshPluginMutationBody {
  action?: "toggle" | "setConfig" | "reload";
  id?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  if (request.headers.has("host") && !isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: DshPluginMutationBody;
  try {
    body = (await request.json()) as DshPluginMutationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body?.action;
  if (action !== "toggle" && action !== "setConfig" && action !== "reload") {
    return NextResponse.json(
      { error: `Unsupported action: ${String(action)}` },
      { status: 400 },
    );
  }

  if (action === "toggle") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "Plugin id is required" }, { status: 400 });
    }
    const nextEnabled =
      typeof body.enabled === "boolean" ? body.enabled : !isDshPluginEnabled(id);
    setDshPluginEnabled(id, nextEnabled);
    await reloadDshHostPlugins();
  } else if (action === "setConfig") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "Plugin id is required" }, { status: 400 });
    }
    const patch =
      body.config && typeof body.config === "object" && !Array.isArray(body.config)
        ? body.config
        : {};
    setDshPluginConfig(id, patch);
    await reloadDshHostPlugins();
  } else if (action === "reload") {
    await reloadDshHostPlugins();
  }

  const plugins = await listDshPlugins();
  return NextResponse.json(
    { plugins },
    { headers: { "Cache-Control": "no-store" } },
  );
}
