import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Plus: file operations behind the project file tree (rename, delete, new
 * file / folder, duplicate). Every path is authorised by the caller; this
 * module only validates names and performs the operation.
 */

export type FileOp =
  | { op: "rename"; path: string; name: string }
  | { op: "delete"; path: string }
  | { op: "newFile"; dir: string; name: string }
  | { op: "newFolder"; dir: string; name: string }
  | { op: "duplicate"; path: string };

export class FileOpError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/** A single path segment the user typed. Rejects separators, `..` and names Windows cannot hold. */
export function validateEntryName(raw: unknown): string {
  if (typeof raw !== "string") throw new FileOpError("Name must be a string");
  const name = raw.trim();
  if (!name) throw new FileOpError("Name cannot be empty");
  if (name === "." || name === "..") throw new FileOpError("Invalid name");
  if (/[\\/]/.test(name)) throw new FileOpError("Name cannot contain / or \\");
  if (/[\0-\x1f<>:"|?*]/.test(name)) throw new FileOpError("Name contains characters Windows does not allow: < > : \" | ? *");
  if (/[. ]$/.test(name)) throw new FileOpError("Name cannot end with a dot or a space");
  if (WINDOWS_RESERVED.test(name)) throw new FileOpError("That name is reserved by Windows");
  if (Buffer.byteLength(name, "utf8") > 255) throw new FileOpError("Name is too long");
  return name;
}

function exists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

/** Case-insensitive file systems treat "a.txt" -> "A.txt" as the same entry. */
function isSameEntry(a: string, b: string): boolean {
  return process.platform === "win32" || process.platform === "darwin"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Move a path to the Recycle Bin / Trash. Windows uses the VisualBasic
 * FileSystem API through PowerShell; macOS asks Finder; Linux uses gio.
 * Throws when the platform has no trash, so the caller can surface it
 * instead of deleting permanently by surprise.
 */
export async function moveToTrash(target: string): Promise<void> {
  const isDir = fs.lstatSync(target).isDirectory();
  if (process.platform === "win32") {
    const method = isDir ? "DeleteDirectory" : "DeleteFile";
    const script = [
      "$ErrorActionPreference='Stop'",
      "Add-Type -AssemblyName Microsoft.VisualBasic",
      `[Microsoft.VisualBasic.FileIO.FileSystem]::${method}(${psQuote(target)}, 'OnlyErrorDialogs', 'SendToRecycleBin')`,
    ].join("; ");
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      windowsHide: true,
      timeout: 60_000,
    });
  } else if (process.platform === "darwin") {
    await execFileAsync("osascript", ["-e", `tell application "Finder" to delete POSIX file ${JSON.stringify(target)}`], { timeout: 60_000 });
  } else {
    await execFileAsync("gio", ["trash", target], { timeout: 60_000 });
  }
  if (exists(target)) throw new FileOpError("The item could not be moved to the trash", 500);
}

function duplicateName(target: string): string {
  const dir = path.dirname(target);
  const base = path.basename(target);
  const isDir = fs.statSync(target).isDirectory();
  const dot = isDir ? -1 : base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    const candidate = path.join(dir, `${stem} copy${i === 1 ? "" : ` ${i}`}${ext}`);
    if (!exists(candidate)) return candidate;
  }
  throw new FileOpError("Could not find a free name for the copy", 409);
}

export interface FileOpResult {
  /** Path of the created / renamed entry, when there is one. */
  path?: string;
}

export async function performFileOp(op: FileOp, deps: { trash?: (target: string) => Promise<void> } = {}): Promise<FileOpResult> {
  switch (op.op) {
    case "rename": {
      const name = validateEntryName(op.name);
      const destination = path.join(path.dirname(op.path), name);
      if (destination === op.path) return { path: destination };
      if (exists(destination) && !isSameEntry(destination, op.path)) {
        throw new FileOpError(`"${name}" already exists`, 409);
      }
      fs.renameSync(op.path, destination);
      return { path: destination };
    }
    case "delete": {
      await (deps.trash ?? moveToTrash)(op.path);
      return {};
    }
    case "newFile":
    case "newFolder": {
      const name = validateEntryName(op.name);
      const destination = path.join(op.dir, name);
      if (exists(destination)) throw new FileOpError(`"${name}" already exists`, 409);
      if (op.op === "newFolder") fs.mkdirSync(destination);
      else fs.writeFileSync(destination, "", { flag: "wx" });
      return { path: destination };
    }
    case "duplicate": {
      const destination = duplicateName(op.path);
      fs.cpSync(op.path, destination, { recursive: true, errorOnExist: true, force: false });
      return { path: destination };
    }
    default:
      throw new FileOpError("Unknown operation");
  }
}

/** Parse and shape-check a request body; paths are still unauthorised. */
export function parseFileOp(body: unknown): FileOp {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (key: string) => {
    const value = input[key];
    if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new FileOpError(`${key} is required`);
    return value;
  };
  switch (input.op) {
    case "rename": return { op: "rename", path: str("path"), name: str("name") };
    case "delete": return { op: "delete", path: str("path") };
    case "newFile": return { op: "newFile", dir: str("dir"), name: str("name") };
    case "newFolder": return { op: "newFolder", dir: str("dir"), name: str("name") };
    case "duplicate": return { op: "duplicate", path: str("path") };
    default: throw new FileOpError("Unknown operation");
  }
}
