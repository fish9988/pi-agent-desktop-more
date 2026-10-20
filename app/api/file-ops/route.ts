import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isFilePathAllowed } from "@/lib/file-access";
import { FileOpError, parseFileOp, performFileOp } from "@/lib/file-ops";
import { isApiRequestAllowed } from "@/lib/request-security";
import { samePath } from "@/lib/paths";
import { hasParentDirectorySegment } from "@/lib/path-security";

/**
 * Plus: rename / delete (to the Recycle Bin) / new file / new folder /
 * duplicate for the project file tree.
 *
 * The same gate as uploads: the target must sit inside an allowed root both
 * lexically and after resolving links, and an allowed root itself can never
 * be renamed or deleted.
 */

async function realRoots(): Promise<{ lexical: Set<string>; real: Set<string> }> {
  const lexical = await getAllowedFileRoots();
  const real = new Set<string>();
  for (const root of lexical) {
    try {
      real.add(fs.realpathSync(root));
    } catch {
      // stale root
    }
  }
  return { lexical, real };
}

function authorise(target: string, roots: { lexical: Set<string>; real: Set<string> }, { mustExist, allowRoot }: { mustExist: boolean; allowRoot: boolean }): string {
  if (!path.isAbsolute(target) || hasParentDirectorySegment(target)) throw new FileOpError("Path must be absolute");
  const resolved = path.resolve(target);
  if (!isFilePathAllowed(resolved, roots.lexical)) throw new FileOpError("Access denied", 403);
  if (!mustExist) return resolved;
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(resolved);
  } catch {
    throw new FileOpError("File not found", 404);
  }
  // Operate on the entry itself (a symlink is renamed/removed, not its target),
  // but its parent directory must resolve inside an allowed root.
  const parentReal = fs.realpathSync(path.dirname(resolved));
  const entryReal = stat.isSymbolicLink() ? path.join(parentReal, path.basename(resolved)) : fs.realpathSync(resolved);
  if (!isFilePathAllowed(entryReal, roots.real) && !isFilePathAllowed(parentReal, roots.real)) {
    throw new FileOpError("Access denied", 403);
  }
  if (!allowRoot) {
    for (const root of [...roots.lexical, ...roots.real]) {
      if (samePath(root, resolved) || samePath(root, entryReal)) {
        throw new FileOpError("A project root cannot be renamed or deleted here", 403);
      }
    }
  }
  return resolved;
}

export async function POST(request: NextRequest) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  try {
    const op = parseFileOp(await request.json().catch(() => null));
    const roots = await realRoots();
    let result;
    if (op.op === "newFile" || op.op === "newFolder") {
      const dir = authorise(op.dir, roots, { mustExist: true, allowRoot: true });
      if (!fs.statSync(dir).isDirectory()) throw new FileOpError("Target is not a directory");
      result = await performFileOp({ ...op, dir });
    } else {
      const target = authorise(op.path, roots, { mustExist: true, allowRoot: false });
      result = await performFileOp({ ...op, path: target });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof FileOpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as NodeJS.ErrnoException)?.code;
    const status = code === "EBUSY" || code === "EPERM" || code === "EACCES" ? 409 : 500;
    return NextResponse.json({ error: code === "EBUSY" ? "The file is in use by another program" : message }, { status });
  }
}
