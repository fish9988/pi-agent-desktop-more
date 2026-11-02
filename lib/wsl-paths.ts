// Windows ⇄ WSL path translation for the terminal backend and `!` commands.
//
// WSL reaches a Windows drive through the automount root (`C:\a b` is
// `/mnt/c/a b`) and its own filesystem through the `\\wsl.localhost\<distro>`
// UNC share (older builds also accept the `\\wsl$\` alias). Everything here is
// pure string work: whether the translated path exists is answered by the
// caller's `--cd` probe, never by touching the filesystem.

const WSL_UNC_RE = /^[\\/]{2}(wsl\.localhost|wsl\$)[\\/]([^\\/]+)(?:[\\/](.*))?$/i;
const DRIVE_PATH_RE = /^([a-zA-Z]):(?:([\\/])(.*))?$/;
const MNT_DRIVE_RE = /^\/mnt\/([a-zA-Z])(?:\/(.*))?$/;

export type WslPathResult =
  | { ok: true; path: string; /** Present when a UNC path already named a distro. */ distro?: string }
  | { ok: false; reason: string };

/** `\\wsl.localhost\Ubuntu\home\x` and `\\wsl$\Ubuntu\home\x`. */
export function isWslUncPath(value: string): boolean {
  return WSL_UNC_RE.test(value.trim());
}

/** The distro named by a `\\wsl.localhost\...` path, or null. */
export function wslUncDistro(value: string): string | null {
  return WSL_UNC_RE.exec(value.trim())?.[2] ?? null;
}

function trimTrailingSlashes(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed || "/";
}

function uncRestToPosix(rest: string | undefined): string {
  const normalized = (rest ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized ? `/${normalized}` : "/";
}

/**
 * Translate a Windows path into the form `wsl.exe --cd` expects.
 *
 * - `C:\a b\c` / `C:/a b/c` → `/mnt/c/a b/c`, `D:\` → `/mnt/d`
 * - `\\wsl.localhost\Ubuntu\home\x` and `\\wsl$\...` → `/home/x` (with `distro`)
 * - an already-POSIX path is returned unchanged, so callers can pass a stored
 *   WSL cwd through twice
 * - other UNC shares and relative paths cannot be reached from WSL and fail
 */
export function windowsToWslPath(input: string): WslPathResult {
  const value = input.trim();
  if (!value) return { ok: false, reason: "路径为空" };
  // A long-path prefix is a Windows spelling detail, not a different location.
  const withoutPrefix = value.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/, "");

  const unc = WSL_UNC_RE.exec(withoutPrefix);
  if (unc) {
    return { ok: true, path: uncRestToPosix(unc[3]), distro: unc[2] };
  }
  if (/^[\\/]{2}/.test(withoutPrefix)) {
    return { ok: false, reason: "网络共享路径（UNC）无法映射到 WSL 的 /mnt" };
  }
  if (withoutPrefix.startsWith("/")) {
    return { ok: true, path: trimTrailingSlashes(withoutPrefix.replace(/\\/g, "/")) };
  }

  const drive = DRIVE_PATH_RE.exec(withoutPrefix);
  if (!drive) return { ok: false, reason: "不是 Windows 绝对路径" };
  if (drive[2] === undefined) return { ok: false, reason: "盘符后缺少路径分隔符" };
  const letter = drive[1].toLowerCase();
  const rest = (drive[3] ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return { ok: true, path: rest ? `/mnt/${letter}/${rest}` : `/mnt/${letter}` };
}

/**
 * Translate back for display: `/mnt/c/a b/c` → `C:\a b\c`; a Linux-only path
 * needs a distro to become `\\wsl.localhost\<distro>\home\x`.
 */
export function wslToWindowsPath(input: string, distro?: string | null): WslPathResult {
  const value = input.trim();
  if (!value) return { ok: false, reason: "路径为空" };

  const unc = WSL_UNC_RE.exec(value);
  if (unc) {
    const rest = (unc[3] ?? "").replace(/[\\/]+/g, "\\").replace(/^\\+|\\+$/g, "");
    return { ok: true, path: `\\\\wsl.localhost\\${unc[2]}${rest ? `\\${rest}` : ""}` };
  }

  if (value.startsWith("/")) {
    const mount = MNT_DRIVE_RE.exec(value);
    if (mount) {
      const letter = mount[1].toUpperCase();
      const rest = (mount[2] ?? "").replace(/\/+$/, "").replace(/\//g, "\\");
      return { ok: true, path: rest ? `${letter}:\\${rest}` : `${letter}:\\` };
    }
    if (!distro) {
      return { ok: false, reason: "WSL 内部路径需要发行版名才能换算成 Windows 路径" };
    }
    const rest = value.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\//g, "\\");
    return { ok: true, path: `\\\\wsl.localhost\\${distro}${rest ? `\\${rest}` : ""}` };
  }

  if (DRIVE_PATH_RE.test(value)) return { ok: true, path: value };
  return { ok: false, reason: "既不是 Linux 也不是 Windows 绝对路径" };
}
