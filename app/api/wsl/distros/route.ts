import { NextResponse } from "next/server";
import { listWslDistros } from "@/lib/wsl-distros";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Installed WSL distributions for the terminal settings dropdown. Read-only and
 * cached in `lib/wsl-distros` for 30s, because every call starts wsl.exe.
 */
export async function GET() {
  try {
    return NextResponse.json(await listWslDistros());
  } catch (error) {
    return NextResponse.json(
      { available: false, distros: [], defaultDistro: null, error: error instanceof Error ? error.message : String(error) },
      { status: 200 },
    );
  }
}
