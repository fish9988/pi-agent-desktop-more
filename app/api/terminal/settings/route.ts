import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { getTerminalSettings, writeTerminalShellPreference, writeTerminalWslPreferences } from "@/lib/terminal-settings";

export const dynamic = "force-dynamic";

// One PUT, one change: the native shell dropdown and the WSL backend switch
// share this route so the panel reloads a single settings object.

const WSL_DISTRO_NAME_RE = /^[\w.-]{1,64}$/;

export async function GET() {
  try {
    return NextResponse.json(getTerminalSettings());
  } catch {
    return NextResponse.json({ error: "Could not read terminal settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(req)) return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }
  const changes = body as { shell?: unknown; backend?: unknown; wslDistro?: unknown; wslShellCommands?: unknown };
  const keys = ["shell", "backend", "wslDistro", "wslShellCommands"].filter((key) => key in changes);
  if (keys.length !== 1) {
    return NextResponse.json({ error: "Send one of shell, backend, wslDistro or wslShellCommands" }, { status: 400 });
  }

  try {
    if (keys[0] === "shell") {
      const shell = changes.shell;
      if (typeof shell !== "string" || !shell) return NextResponse.json({ error: "Invalid terminal" }, { status: 400 });
      const settings = getTerminalSettings();
      if (shell !== "auto" && !settings.options.some(option => option.value === shell)) {
        return NextResponse.json({ error: "Terminal is unavailable" }, { status: 400 });
      }
      writeTerminalShellPreference(shell);
      return NextResponse.json(getTerminalSettings());
    }

    if (keys[0] === "backend") {
      if (changes.backend !== "native" && changes.backend !== "wsl") {
        return NextResponse.json({ error: "backend must be native or wsl" }, { status: 400 });
      }
      writeTerminalWslPreferences({ backend: changes.backend });
      return NextResponse.json(getTerminalSettings());
    }

    if (keys[0] === "wslDistro") {
      const distro = changes.wslDistro;
      // "" means the WSL default distribution; the list is not authoritative
      // here because it may be temporarily unreadable while WSL is stopped.
      if (typeof distro !== "string" || (distro !== "" && !WSL_DISTRO_NAME_RE.test(distro.trim()))) {
        return NextResponse.json({ error: "Invalid WSL distribution" }, { status: 400 });
      }
      writeTerminalWslPreferences({ distro });
      return NextResponse.json(getTerminalSettings());
    }

    if (typeof changes.wslShellCommands !== "boolean") {
      return NextResponse.json({ error: "wslShellCommands must be a boolean" }, { status: 400 });
    }
    writeTerminalWslPreferences({ shellCommands: changes.wslShellCommands });
    return NextResponse.json(getTerminalSettings());
  } catch {
    return NextResponse.json({ error: "Could not save terminal settings" }, { status: 500 });
  }
}
