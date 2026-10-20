"use client";

import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type MouseEvent } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import { useFileContextMenu } from "@/hooks/useFileContextMenu";
import { inlineCodeFilePath } from "@/lib/file-context-menu";
import { parsePdfPageFragment, resolveLocalFileHref, shouldOpenLocalFileInApp } from "@/lib/file-links";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { markdownRehypePlugins, markdownRemarkPlugins, markdownUrlTransform, markdownUserRemarkPlugins, normalizeDisplayMath } from "@/lib/markdown";
import { splitMarkdownBlocks } from "@/lib/markdown-blocks";
import { ImagePreview } from "./ImagePreview";
import { MermaidBlock, CodeBlock } from "./MermaidBlock";
import { HtmlPreviewBlock } from "./HtmlPreviewBlock";
import { htmlPreviewKind } from "@/lib/html-preview";
import { ArtifactCard } from "./ArtifactCard";
import { ARTIFACT_FENCE_LANG, decodeArtifactFence, encodeArtifactsForMarkdown } from "@/lib/artifacts";
import { handleExternalLinkClick } from "@/lib/desktop-native";

const MarkdownLinkContext = createContext(false);

interface MarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  onOpenFile?: (filePath: string, page?: number) => void;
  /** Render every line ending as a line break, for text the user typed. */
  keepLineBreaks?: boolean;
  /** Render `:::artifact{...}` blocks as artifact cards (assistant text only). */
  artifacts?: boolean;
}

function MarkdownImage({
  src,
  alt,
  cwd,
  ...props
}: ComponentProps<"img"> & ExtraProps & { cwd?: string }) {
  const insideLink = useContext(MarkdownLinkContext);
  delete props.node;
  const href = typeof src === "string" ? src : undefined;
  const filePath = href ? resolveLocalFileHref(href, cwd) : null;
  const imageSrc = filePath
    ? `/api/files/${encodeFilePathForApi(filePath)}?type=read`
    : href;
  // Dynamic local paths are served directly by the file API.
  // eslint-disable-next-line @next/next/no-img-element
  const image = <img src={imageSrc} alt={alt ?? ""} loading="lazy" {...props} />;
  if (!imageSrc || insideLink) return image;
  return (
    <ImagePreview src={imageSrc} alt={alt ?? ""} className="markdown-image">
      {image}
    </ImagePreview>
  );
}

/** Inline code that may name a file: right-click offers the file menu once the server confirms it exists. */
function MarkdownInlineCode({
  cwd,
  onOpenFile,
  children,
  ...props
}: ComponentProps<"code"> & ExtraProps & {
  cwd: string | undefined;
  onOpenFile: ((filePath: string, page?: number) => void) | undefined;
}) {
  delete props.node;
  const showFileMenu = useFileContextMenu(onOpenFile);
  return (
    <code
      className="markdown-inline-code"
      {...props}
      onContextMenu={onOpenFile ? (event) => {
        const filePath = inlineCodeFilePath(String(children), cwd);
        if (filePath) showFileMenu(event, { filePath, verify: true });
      } : undefined}
    >
      {children}
    </code>
  );
}

/** A markdown link to a local file; right-click offers the file menu. */
function MarkdownLocalFileLink({
  filePath,
  page,
  onOpenFile,
  children,
  ...props
}: ComponentProps<"a"> & ExtraProps & {
  filePath: string;
  page: number | undefined;
  onOpenFile: (filePath: string, page?: number) => void;
}) {
  delete props.node;
  const showFileMenu = useFileContextMenu(onOpenFile);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldOpenLocalFileInApp(event)) return;
    const target = event.currentTarget.getAttribute("target");
    if (target && target !== "_self") return;
    event.preventDefault();
    onOpenFile(filePath, page);
  };
  return (
    <MarkdownLinkContext.Provider value={true}>
      <a
        {...props}
        onClick={handleClick}
        onContextMenu={(event) => showFileMenu(event, { filePath, page })}
      >
        {children}
      </a>
    </MarkdownLinkContext.Provider>
  );
}

function buildComponents(
  isStreaming: boolean | undefined,
  cwd: string | undefined,
  onOpenFile: ((filePath: string, page?: number) => void) | undefined,
): Components {
  return {
    code({ className, children, ...props }) {
      const lang = className?.replace("language-", "").toLowerCase() ?? "";
      const raw = String(children);
      const isBlock = className?.includes("language-") || raw.includes("\n");
      if (isBlock) {
        if (lang === ARTIFACT_FENCE_LANG) {
          const artifact = decodeArtifactFence(raw);
          if (artifact) return <ArtifactCard block={artifact} isStreaming={isStreaming} />;
        }
        if (lang === "mermaid") {
          return (
            <MermaidBlock
              code={raw.replace(/\n$/, "")}
              isStreaming={isStreaming}
              defaultPreview
            />
          );
        }
        const previewKind = htmlPreviewKind(lang, raw);
        if (previewKind) {
          return (
            <HtmlPreviewBlock
              code={raw.replace(/\n$/, "")}
              lang={lang}
              kind={previewKind}
              isStreaming={isStreaming}
              defaultPreview={previewKind !== "react"}
            />
          );
        }
        return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} isStreaming={isStreaming} />;
      }
      return (
        <MarkdownInlineCode cwd={cwd} onOpenFile={onOpenFile} {...props}>
          {children}
        </MarkdownInlineCode>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },
    a({ href, children, ...props }) {
      // `node` is react-markdown metadata, not a DOM attribute.
      delete props.node;
      const filePath = onOpenFile ? resolveLocalFileHref(href, cwd) : null;
      const openFile = onOpenFile;
      if (!filePath || !openFile) {
        return (
          <MarkdownLinkContext.Provider value={true}>
            <a
              href={href}
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => handleExternalLinkClick(event, href)}
            >
              {children}
            </a>
          </MarkdownLinkContext.Provider>
        );
      }

      return (
        <MarkdownLocalFileLink
          href={href}
          {...props}
          filePath={filePath}
          page={parsePdfPageFragment(href) ?? undefined}
          onOpenFile={openFile}
        >
          {children}
        </MarkdownLocalFileLink>
      );
    },
    img(props) {
      return <MarkdownImage cwd={cwd} {...props} />;
    },
    table({ children }) {
      return (
        <div className="markdown-table-wrap">
          <table>{children}</table>
        </div>
      );
    },
  };
}

// A streaming bubble receives a new string on every text delta, and each one
// re-runs remark/rehype/KaTeX over the whole accumulated answer — quadratic in
// the answer's length. Parse at most once per interval while streaming; the
// final text renders as soon as streaming ends.
export const STREAMING_MARKDOWN_INTERVAL_MS = 120;

function useStreamingThrottle(value: string, active: boolean): string {
  const [shown, setShown] = useState(value);
  const lastShownAtRef = useRef(0);
  useEffect(() => {
    if (!active) return;
    const publish = () => {
      lastShownAtRef.current = Date.now();
      setShown(value);
    };
    const wait = lastShownAtRef.current + STREAMING_MARKDOWN_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      publish();
      return;
    }
    // Trailing edge: the latest text still lands once the interval elapses.
    const timer = setTimeout(publish, wait);
    return () => clearTimeout(timer);
  }, [value, active]);
  return active ? shown : value;
}

interface MarkdownBlockProps {
  markdown: string;
  remarkPlugins: typeof markdownRemarkPlugins;
  urlTransform: typeof markdownUrlTransform | undefined;
  components: Components;
}

/** One block's parse; skipped while its text and renderers stay the same (pi-web #1176). */
const MarkdownBlock = memo(function MarkdownBlock({ markdown, remarkPlugins, urlTransform, components }: MarkdownBlockProps) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={markdownRehypePlugins}
      urlTransform={urlTransform}
      components={components}
    >
      {markdown}
    </ReactMarkdown>
  );
});

// Memoized: markdown parsing + highlighting is the most expensive render work
// in the app, so parent re-renders with identical props must be free.
export const MarkdownBody = memo(function MarkdownBody({ children, className, isStreaming, cwd, onOpenFile, keepLineBreaks, artifacts }: MarkdownBodyProps) {
  const markdown = useStreamingThrottle(children, Boolean(isStreaming));
  const normalizedMarkdown = useMemo(
    () => normalizeDisplayMath(artifacts ? encodeArtifactsForMarkdown(markdown) : markdown),
    [markdown, artifacts],
  );
  const components = useMemo(
    () => buildComponents(isStreaming, cwd, onOpenFile),
    [isStreaming, cwd, onOpenFile],
  );
  // A streaming reply grows by a few characters per chunk; parsing all of it
  // each time made a long reply quadratic. Its finished blocks keep their
  // parse and only the last one is parsed again (pi-web #1176). A finished
  // message is one block.
  const blocks = useMemo(
    () => (isStreaming ? splitMarkdownBlocks(normalizedMarkdown) : [normalizedMarkdown]),
    [isStreaming, normalizedMarkdown],
  );
  const remarkPlugins = keepLineBreaks ? markdownUserRemarkPlugins : markdownRemarkPlugins;
  const urlTransform = onOpenFile ? markdownUrlTransform : undefined;
  const body = blocks.map((block, index) => (
    <MarkdownBlock key={index} markdown={block} remarkPlugins={remarkPlugins} urlTransform={urlTransform} components={components} />
  ));

  return (
    <div className={["markdown-body", className].filter(Boolean).join(" ")}>
      {body}
    </div>
  );
});
