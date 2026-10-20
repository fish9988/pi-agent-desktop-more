"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { NativeMenuEntry } from "@/lib/desktop-menu-model";
import { openDomMenu } from "@/lib/dom-menu-store";
import { isTauriDesktop } from "@/lib/desktop-updater";
import { revealItemInDirNative } from "@/lib/desktop-native";
import { getRelativeFilePath } from "@/lib/file-paths";
import { appNotify } from "@/lib/notification-store";
import { isImeComposing } from "@/lib/ime";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Plus: file operations for the project tree (rename, delete to the Recycle
 * Bin, new file / folder, duplicate, copy path, reveal). The explorer provides
 * the context; rows without it (none today) simply have no menu.
 */
export interface FileTreeOpsValue {
  cwd: string;
  /** Re-list the tree after a change. */
  onChanged: () => void;
  /** Open a file after it was created. */
  onOpenFile: (filePath: string, fileName: string) => void;
  /** Ask the root list to show a "new entry" input. */
  startRootCreate: (kind: "file" | "folder") => void;
}

export const FileTreeOpsContext = createContext<FileTreeOpsValue | null>(null);

export function useFileTreeOps(): FileTreeOpsValue | null {
  return useContext(FileTreeOpsContext);
}

export async function runFileOp(body: Record<string, string>): Promise<{ path?: string }> {
  const response = await fetch("/api/file-ops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string; path?: string };
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

function baseName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

export interface FileRowActions {
  open?: () => void;
  rename: () => void;
  remove: () => void;
  newFile?: () => void;
  newFolder?: () => void;
}

/** Context menu entries for one tree row. */
export function fileRowMenuEntries(
  t: Translate,
  ops: FileTreeOpsValue,
  entry: { fullPath: string; isDir: boolean },
  actions: FileRowActions,
): NativeMenuEntry[] {
  const entries: NativeMenuEntry[] = [];
  if (entry.isDir) {
    if (actions.newFile) entries.push({ label: t("fileOps.newFile"), onSelect: actions.newFile });
    if (actions.newFolder) entries.push({ label: t("fileOps.newFolder"), onSelect: actions.newFolder });
    entries.push({ kind: "separator" });
  } else if (actions.open) {
    entries.push({ label: t("fileOps.open"), onSelect: actions.open }, { kind: "separator" });
  }
  entries.push(
    { label: t("fileOps.rename"), onSelect: actions.rename },
    {
      label: t("fileOps.duplicate"),
      onSelect: () => {
        void runFileOp({ op: "duplicate", path: entry.fullPath })
          .then(() => ops.onChanged())
          .catch((error: unknown) => appNotify.error({ message: t("fileOps.failed", { reason: error instanceof Error ? error.message : String(error) }) }));
      },
    },
    { kind: "separator" },
    { label: t("fileOps.copyPath"), onSelect: () => void copyText(entry.fullPath) },
    { label: t("fileOps.copyRelativePath"), onSelect: () => void copyText(getRelativeFilePath(entry.fullPath, ops.cwd)) },
  );
  if (isTauriDesktop()) {
    entries.push({
      label: t("fileOps.reveal"),
      onSelect: () => {
        void revealItemInDirNative(entry.fullPath).catch((error: unknown) => appNotify.error({ message: String(error) }));
      },
    });
  }
  entries.push({ kind: "separator" }, { label: t("fileOps.delete"), onSelect: actions.remove });
  return entries;
}

/** Menu for the empty area below the tree: create at the project root. */
export function openRootMenu(event: React.MouseEvent, t: Translate, ops: FileTreeOpsValue): void {
  event.preventDefault();
  openDomMenu([
    { label: t("fileOps.newFile"), onSelect: () => ops.startRootCreate("file") },
    { label: t("fileOps.newFolder"), onSelect: () => ops.startRootCreate("folder") },
    { kind: "separator" },
    { label: t("fileOps.refresh"), onSelect: ops.onChanged },
  ], { x: event.clientX, y: event.clientY });
}

/** Inline name editor shared by rename and "new entry" rows. */
export function InlineNameInput({
  initial,
  selectStem,
  onSubmit,
  onCancel,
  placeholder,
}: {
  initial: string;
  /** Select the name without its extension (rename of a file). */
  selectStem?: boolean;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = selectStem ? initial.lastIndexOf(".") : -1;
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial, selectStem]);

  const submit = async () => {
    if (doneRef.current || busy) return;
    const name = value.trim();
    if (!name || name === initial) {
      doneRef.current = true;
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name);
      doneRef.current = true;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <span className="file-ops-input-wrap" onClick={(event) => event.stopPropagation()}>
      <input
        ref={inputRef}
        className={`file-ops-input${error ? " has-error" : ""}`}
        value={value}
        placeholder={placeholder}
        disabled={busy}
        spellCheck={false}
        onChange={(event) => { setValue(event.target.value); setError(null); }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (isImeComposing(event)) return;
          if (event.key === "Enter") { event.preventDefault(); void submit(); }
          if (event.key === "Escape") { event.preventDefault(); doneRef.current = true; onCancel(); }
        }}
        onBlur={() => { if (!error) void submit(); }}
      />
      {error && <span className="file-ops-input-error" role="alert">{error}</span>}
    </span>
  );
}

/** Inline "move to Recycle Bin?" confirmation under a row. */
export function DeleteConfirm({
  t,
  path,
  isDir,
  depth,
  onDone,
  onCancel,
}: {
  t: Translate;
  path: string;
  isDir: boolean;
  depth: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { confirmRef.current?.focus(); }, []);
  return (
    <div
      className="file-ops-confirm"
      role="alertdialog"
      style={{ paddingLeft: 8 + (depth + 1) * 14 }}
      onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
    >
      <span>{t(isDir ? "fileOps.confirmDeleteFolder" : "fileOps.confirmDelete", { name: baseName(path) })}</span>
      <span className="file-ops-confirm-actions">
        <button
          ref={confirmRef}
          type="button"
          className="is-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await runFileOp({ op: "delete", path });
              onDone();
            } catch (deleteError) {
              setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
              setBusy(false);
            }
          }}
        >
          {busy ? t("fileOps.deleting") : t("fileOps.moveToTrash")}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>{t("files.cancel")}</button>
      </span>
      {error && <span className="file-ops-input-error" role="alert">{error}</span>}
    </div>
  );
}

/** "New file / folder" input row inside a directory (or at the root). */
export function NewEntryRow({
  t,
  dir,
  kind,
  depth,
  onClose,
}: {
  t: Translate;
  dir: string;
  kind: "file" | "folder";
  depth: number;
  onClose: () => void;
}) {
  const ops = useFileTreeOps();
  if (!ops) return null;
  return (
    <div className="file-ops-new-row" style={{ paddingLeft: 8 + depth * 14 + 14 }}>
      <InlineNameInput
        initial=""
        placeholder={t(kind === "file" ? "fileOps.newFilePlaceholder" : "fileOps.newFolderPlaceholder")}
        onCancel={onClose}
        onSubmit={async (name) => {
          const result = await runFileOp({ op: kind === "file" ? "newFile" : "newFolder", dir, name });
          onClose();
          ops.onChanged();
          if (kind === "file" && result.path) ops.onOpenFile(result.path, name);
        }}
      />
    </div>
  );
}
