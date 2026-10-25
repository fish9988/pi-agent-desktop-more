import { NextResponse } from "next/server";
import { CATALOG_MAX_QUERY, catalogSearchUrl, parseNpmSearch } from "@/lib/plugin-catalog";

export const dynamic = "force-dynamic";

/** Plus 1.8: GET ?q= — pi packages from npm's search API, for Settings › Plugins › Discover. */
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, CATALOG_MAX_QUERY);
  try {
    const response = await fetch(catalogSearchUrl(query), {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`npm search: HTTP ${response.status}`);
    const json = await response.json() as { total?: unknown };
    return NextResponse.json({
      packages: parseNpmSearch(json, !query.trim()),
      total: typeof json.total === "number" ? json.total : 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
