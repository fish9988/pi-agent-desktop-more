// Shared, dependency-free types for the WSL terminal backend. Kept apart from
// the modules that spawn processes so client components and browser bundles can
// import the shapes without pulling `child_process` (or the pi SDK) in.

export type TerminalBackendKind = "native" | "wsl";

/** What the terminal panel shows about the shell it is attached to. */
export interface TerminalBackendInfo {
  kind: TerminalBackendKind;
  /** The WSL distribution the shell runs in (absent for the native backend). */
  distro?: string;
  /** The workspace cwd translated for Linux (`/mnt/c/...` or `/home/...`). */
  linuxCwd?: string;
  /**
   * Set when the requested backend could not start and the shell fell back to
   * the native one. Already user-readable; the terminal panel shows it.
   */
  warning?: string;
}

/** Stored preference: which shell a new workspace terminal starts. */
export interface WslPreferences {
  backend: TerminalBackendKind;
  /** "" means the WSL default distribution. */
  distro: string;
  /** Whether `!cmd` shell commands run through WSL too. */
  shellCommands: boolean;
}

export interface WslDistro {
  name: string;
  isDefault: boolean;
}

export interface WslDistroList {
  /** wsl.exe was found and listed at least one distribution. */
  available: boolean;
  distros: WslDistro[];
  defaultDistro: string | null;
  /** Why listing failed, already user-readable. */
  error: string | null;
}

/** Everything needed to start a PTY for one terminal tab. */
export interface TerminalLaunchPlan {
  file: string;
  args: string[];
  cwd: string;
  backend: TerminalBackendInfo;
}

/** The WSL half of `GET /api/terminal/settings`. */
export interface WslSettingsFields {
  backend: TerminalBackendKind;
  /** "" means the WSL default distribution. */
  wslDistro: string;
  wslShellCommands: boolean;
}
