import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { resolveDshPluginClientEntry } from "@/lib/dsh-plugin-host";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ name: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { name } = await params;
  const pluginId = decodeURIComponent(name);
  const entryPath = resolveDshPluginClientEntry(pluginId);

  if (!entryPath) {
    return new NextResponse(`Client entry not found for DSH plugin: ${pluginId}`, {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  try {
    const jsContent = await fs.readFile(entryPath, "utf8");
    return new NextResponse(jsContent, {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return new NextResponse(
      `Failed to read client bundle for ${pluginId}: ${error instanceof Error ? error.message : String(error)}`,
      {
        status: 500,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }
}
