import { NextRequest, NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { isApiRequestAllowed } from "@/lib/request-security";
import { createUserTheme, listUserThemes, MAX_THEME_BYTES, ThemeError, themesDir } from "@/lib/plus-user-themes";

/** Plus: list and import custom themes. */
export async function GET() {
  const themes = await listUserThemes(themesDir(getAgentDir()));
  return NextResponse.json({ themes }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_THEME_BYTES * 2) {
    return NextResponse.json({ error: "A theme is limited to 1 MB" }, { status: 413 });
  }
  try {
    const body = (await request.json()) as { name?: unknown; base?: unknown; css?: unknown };
    const theme = await createUserTheme(themesDir(getAgentDir()), body);
    return NextResponse.json({ theme });
  } catch (error) {
    const status = error instanceof ThemeError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
