"use client";

import { useEffect, useState } from "react";
import { useFileContextMenu } from "@/hooks/useFileContextMenu";
import { useI18n } from "@/hooks/useI18n";
import { encodeFilePathForApi, getFileName } from "@/lib/file-paths";
import { scaleVar } from "@/lib/plus-design-scale";
import { writtenFileLocation, type WrittenFile } from "@/lib/turn-written-files";
import { fileTypeBadge } from "@/lib/file-type-badge";
import { getFileIcon } from "./FileIcons";

function requestFileDiffOpen(filePath: string): void {
  if (typeof window === "undefined") return;
  (window as Window & { __piPlusPendingDiffFile?: string }).__piPlusPendingDiffFile = filePath;
}

/**
 * Paths of `filePaths` the files API reports as gone. A turn's written files
 * are history: a later command (a skill's render step cleaning its draft, a
 * `git checkout`) can remove one, and the row should say so before it is
 * clicked. Only a 404 counts; any other answer leaves the row as it was.
 */
function useMissingFiles(filePaths: string[], sessionId?: string): Set<string> {
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const key = filePaths.join("\n");
  useEffect(() => {
    if (!key || typeof fetch !== "function") return;
    const controller = new AbortController();
    Promise.all(key.split("\n").map(async (filePath) => {
      const params = new URLSearchParams({ type: "meta" });
      if (sessionId) params.set("sessionId", sessionId);
      try {
        const response = await fetch(`/api/files/${encodeFilePathForApi(filePath)}?${params}`, { signal: controller.signal });
        return response.status === 404 ? filePath : null;
      } catch {
        return null;
      }
    })).then((results) => {
      if (controller.signal.aborted) return;
      setMissing(new Set(results.filter((filePath): filePath is string => filePath !== null)));
    });
    return () => controller.abort();
  }, [key, sessionId]);
  return missing;
}

function LineStats({ added, removed }: { added?: number; removed?: number }) {
  if (added === undefined && removed === undefined) return null;
  return (
    <span className="turn-files-stats">
      <span className="turn-files-added">+{added ?? 0}</span>
      <span className="turn-files-removed">−{removed ?? 0}</span>
    </span>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4.5 2.5 8 6 4.5 9.5" />
    </svg>
  );
}

/**
 * Card under a turn's reply listing the files it actually wrote, with the
 * lines each one gained and lost. A row opens the file in the preview pane;
 * right-click offers the native Open / Open With / Reveal menu. Entries come
 * from the turn's successful `write`/`edit`/`apply_patch` tool calls — the
 * reply text is never scanned for paths.
 */
export function TurnWrittenFiles({ files, onOpenFile, cwd, sessionId }: {
  files: WrittenFile[];
  onOpenFile?: (filePath: string) => void;
  /** Project folder: rows show their folder relative to it and flag files outside it. */
  cwd?: string;
  sessionId?: string;
}) {
  const { t, locale } = useI18n();
  const showFileMenu = useFileContextMenu(onOpenFile);
  const [expanded, setExpanded] = useState(true);
  const missing = useMissingFiles(files.map((file) => file.filePath), sessionId);
  if (files.length === 0) return null;

  const counted = files.filter((file) => file.added !== undefined || file.removed !== undefined);
  const totalAdded = counted.reduce((sum, file) => sum + (file.added ?? 0), 0);
  const totalRemoved = counted.reduce((sum, file) => sum + (file.removed ?? 0), 0);

  const rawMissingLabel = t("chat.writtenFileMissing");
  const missingLabel = rawMissingLabel !== "chat.writtenFileMissing"
    ? rawMissingLabel
    : locale === "zh-CN" || locale === "zh-TW" ? "已不存在" : "No longer exists";
  const rawNotFoundTitle = t("files.notFound");
  const notFoundTitle = rawNotFoundTitle !== "files.notFound"
    ? rawNotFoundTitle
    : locale === "zh-CN"
      ? "该文件已被后续操作删除或移动。"
      : locale === "zh-TW"
        ? "此檔案已被後續操作刪除或移動。"
        : "This file no longer exists. It may have been moved or deleted after it was written.";
  const viewAllChangesLabel = locale === "zh-CN" ? "查看全部改动" : locale === "zh-TW" ? "檢視全部變更" : "View all changes";
  const diffLabel = locale === "zh-CN" ? "对比" : locale === "zh-TW" ? "對比" : "Diff";
  const diffTitle = locale === "zh-CN" ? "直接查看该文件的改动对比 (Diff)" : locale === "zh-TW" ? "直接檢視此檔案的變更對比 (Diff)" : "Open file in Diff view";

  return (
    <div className="turn-files-card" aria-label={t("chat.filesWritten")}>
      <div
        role="button"
        tabIndex={0}
        className="turn-files-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((value) => !value);
          }
        }}
      >
        <svg className="turn-files-header-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
          <rect x="1.5" y="1.5" width="11" height="11" rx="2" />
          <path d="M7 3.8v4M5 5.8h4M5 10h4" />
        </svg>
        <span className="turn-files-title">
          {files.length === 1 ? t("chat.filesEditedOne") : t("chat.filesEditedMany", { count: files.length })}
        </span>
        {counted.length > 0 && <LineStats added={totalAdded} removed={totalRemoved} />}
        <button
          type="button"
          className="turn-files-view-all-btn"
          title={viewAllChangesLabel}
          onClick={(event) => {
            event.stopPropagation();
            if (onOpenFile && files.length > 0 && typeof document !== "undefined" && !document.getElementById("file-tree-panel")) {
              requestFileDiffOpen(files[0].filePath);
              onOpenFile(files[0].filePath);
            }
            window.dispatchEvent(new CustomEvent("pi-plus:open-changes-panel"));
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("pi-plus:open-changes-panel"));
            }, 60);
          }}
          style={{
            flexShrink: 0,
            height: 22,
            padding: "0 8px",
            border: "var(--hairline) solid var(--border)",
            borderRadius: scaleVar("r", "ctl"),
            background: "var(--surface)",
            color: "var(--text-muted)",
            fontSize: scaleVar("fs", 1),
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {viewAllChangesLabel}
        </button>
        <Chevron className="turn-files-chevron" />
      </div>
      {expanded && files.map(({ filePath, added, removed }) => {
        const name = getFileName(filePath);
        const where = writtenFileLocation(filePath, cwd);
        const badge = fileTypeBadge(name);
        const isMissing = missing.has(filePath);
        return (
          <div
            key={filePath}
            role="button"
            tabIndex={0}
            className={`turn-files-row${isMissing ? " is-missing" : ""}`}
            title={isMissing ? `${filePath}\n${notFoundTitle}` : filePath}
            aria-label={t("chat.openWrittenFile", { name })}
            onClick={() => onOpenFile?.(filePath)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenFile?.(filePath);
              }
            }}
            onContextMenu={(event) => showFileMenu(event, { filePath })}
          >
            <span className="turn-files-icon" style={isMissing ? { opacity: 0.55 } : undefined}>{getFileIcon(name, 14)}</span>
            {/* Plus 1.7: a coloured type tag; the clean engine shows it instead of the icon. */}
            <span className="turn-files-badge" data-tone={badge.tone} aria-hidden="true">{badge.label}</span>
            <span className="turn-files-name" style={isMissing ? { opacity: 0.55, textDecoration: "line-through" } : undefined}>{name}</span>
            {isMissing && (
              <span className="turn-files-missing" style={{ flexShrink: 0, color: "var(--text-dim)", fontSize: scaleVar("fs", 1) }}>
                {missingLabel}
              </span>
            )}
            {where.outside && <span className="turn-files-tag">{t("chat.fileOutsideProject")}</span>}
            <span className="turn-files-dir">{where.dir}</span>
            <LineStats added={added} removed={removed} />
            {!isMissing && (
              <button
                type="button"
                className="turn-files-diff-btn"
                title={diffTitle}
                aria-label={`${diffLabel} ${name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  requestFileDiffOpen(filePath);
                  onOpenFile?.(filePath);
                  window.dispatchEvent(new CustomEvent("pi-plus:open-file-diff", { detail: { filePath } }));
                }}
                style={{
                  flexShrink: 0,
                  height: 20,
                  padding: "0 6px",
                  border: "var(--hairline) solid var(--border)",
                  borderRadius: scaleVar("r", "ctl"),
                  background: "var(--surface)",
                  color: "var(--text-muted)",
                  fontSize: scaleVar("fs", 1),
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {diffLabel}
              </button>
            )}
            <Chevron className="turn-files-row-chevron" />
          </div>
        );
      })}
    </div>
  );
}
