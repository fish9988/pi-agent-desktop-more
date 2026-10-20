import { NextRequest, NextResponse } from "next/server";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { isApiRequestAllowed } from "@/lib/request-security";
import { deleteUserTheme, getUserTheme, serializeThemeFile, ThemeError, themesDir, updateUserTheme, type ThemeInput } from "@/lib/plus-user-themes";

type Context = { params: Promise<{ id: string }> };

function failure(error: unknown) {
  const status = error instanceof ThemeError ? error.status : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}

/** Plus: one imported theme (CSS + metadata). `?download=1` returns the file. */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const theme = await getUserTheme(themesDir(getAgentDir()), id);
    if (request.nextUrl.searchParams.get("download") === "1") {
      const body = serializeThemeFile(theme.name, theme.base, theme.css, theme.definition);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Content-Disposition": `attachment; filename="${theme.id}.css"; filename*=UTF-8''${encodeURIComponent(theme.name)}.css`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ theme }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const { id } = await params;
    const body = (await request.json()) as ThemeInput;
    const theme = await updateUserTheme(themesDir(getAgentDir()), id, body);
    return NextResponse.json({ theme });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  try {
    const { id } = await params;
    await deleteUserTheme(themesDir(getAgentDir()), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
