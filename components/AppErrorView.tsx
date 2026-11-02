"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { isDarkTheme, isThemePreference, type ResolvedTheme } from "@/lib/theme";

/**
 * Same resolution as THEME_INIT_SCRIPT. Needed because an error during
 * hydration makes React re-render from the root, which drops the attributes
 * that script set, and global-error replaces the document entirely.
 */
function applyStoredTheme() {
  let preference: string | null = null;
  try {
    preference = localStorage.getItem("pi-theme");
  } catch {}
  const resolved: ResolvedTheme = isThemePreference(preference) && preference !== "auto"
    ? preference
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle("dark", isDarkTheme(resolved));
}

function detectChineseLocale(): boolean {
  try {
    const stored = localStorage.getItem("pi-locale");
    if (stored) return stored.toLowerCase().startsWith("zh");
  } catch {}
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh");
}

function describeError(error: Error & { digest?: string }): string {
  const lines = [`${error.name || "Error"}: ${error.message || String(error)}`];
  if (error.digest) lines.push(`Digest: ${error.digest}`);
  lines.push(`URL: ${window.location.href}`, `User agent: ${navigator.userAgent}`);
  if (error.stack) lines.push("", error.stack);
  return lines.join("\n");
}

/**
 * Replaces Next's generic "This page couldn't load" screen. The packaged app
 * has no DevTools, so the error and its stack are shown on the page for the
 * user to screenshot or copy into a bug report.
 */
export function AppErrorView({
  error,
  onRetry,
}: {
  error: Error & { digest?: string };
  onRetry?: () => void;
}) {
  const [details, setDetails] = useState("");
  const [copied, setCopied] = useState(false);
  const [isZh, setIsZh] = useState(true);

  useEffect(() => {
    applyStoredTheme();
    setIsZh(detectChineseLocale());
    setDetails(describeError(error));
    console.error(error);
  }, [error]);

  const copyDetails = () => {
    void copyText(details).then(() => setCopied(true), () => {});
  };

  return (
    <main
      className="app-error"
      role="alert"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "var(--font-ui)",
        fontSize: "var(--fs-body)",
      }}
    >
      <div
        className="app-error-card"
        style={{
          width: "min(720px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "20px",
          border: "var(--hairline, 1px) solid var(--border)",
          borderRadius: "var(--radius-lg, 12px)",
          background: "var(--surface)",
        }}
      >
        <h1
          className="app-error-title"
          style={{
            margin: 0,
            fontSize: "var(--fs-title, 16px)",
            fontWeight: "var(--fw-semibold, 600)",
          }}
        >
          {isZh ? "页面加载时遇到错误" : "This page hit an error while loading"}
        </h1>
        <p
          className="app-error-hint"
          style={{
            margin: 0,
            color: "var(--text-muted)",
          }}
        >
          {error.digest
            ? isZh
              ? "本地服务渲染页面时出错，完整堆栈已记录在 server.log 中。"
              : "The local server failed while rendering. Its log (server.log) has the full stack."
            : isZh
              ? "请复制下方错误详情或截图，以便排查问题。"
              : "Please copy the details below, or take a screenshot, and include them in your bug report."}
        </p>
        <pre
          className="app-error-details"
          style={{
            margin: 0,
            maxHeight: "50dvh",
            overflow: "auto",
            padding: "10px",
            borderRadius: "var(--radius-sm, 6px)",
            background: "var(--tool-bg)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-caption, 12px)",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            userSelect: "text",
          }}
        >
          {details}
        </pre>
        <div
          className="app-error-actions"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <button type="button" className="native-button" onClick={copyDetails} disabled={!details}>
            {copied ? (isZh ? "已复制" : "Copied") : (isZh ? "复制详情" : "Copy details")}
          </button>
          {onRetry && (
            <button type="button" className="native-button" onClick={onRetry}>
              {isZh ? "重试" : "Try again"}
            </button>
          )}
          <button
            type="button"
            className="native-button native-button-primary"
            onClick={() => window.location.reload()}
          >
            {isZh ? "重新加载" : "Reload"}
          </button>
        </div>
      </div>
    </main>
  );
}
