import { NextRequest, NextResponse } from "next/server";
import { listSystemFonts } from "@/lib/system-fonts";

/** Plus: installed font families for the font pickers. */
export async function GET(request: NextRequest) {
  try {
    const fonts = await listSystemFonts(request.nextUrl.searchParams.get("refresh") === "1");
    return NextResponse.json({ fonts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { fonts: [], error: error instanceof Error ? error.message : String(error) },
      { status: 200 },
    );
  }
}
