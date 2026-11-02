"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  CodeBlock,
  DiagramZoomDialog,
  PreviewFrame,
  PreviewToggleButton,
  SvgDownloadButton,
  downloadSvgFile,
} from "./MermaidBlock";

const SVG_NS = "http://www.w3.org/2000/svg";

function parsedRoot(source: string, parser: DOMParser): Element | null {
  const doc = parser.parseFromString(source, "image/svg+xml");
  // A syntax error comes back as a <parsererror> element: the root in Firefox,
  // inside the partial document in Chrome and Safari.
  if (doc.getElementsByTagName("parsererror").length > 0) return null;
  return doc.documentElement;
}

/**
 * The fence's text as an SVG file, or null when it is not one: well-formed XML
 * with an <svg> root in the SVG namespace. An <svg> written into HTML needs no
 * xmlns, an SVG image does, so a root without one gets it.
 */
export function svgImageSource(code: string, parser: DOMParser): string | null {
  let source = code;
  let root = parsedRoot(source, parser);
  if (root?.localName === "svg" && root.namespaceURI === null && !root.hasAttribute("xmlns")) {
    source = code.replace(/<svg(?=[\s/>])/, `<svg xmlns="${SVG_NS}"`);
    root = parsedRoot(source, parser);
  }
  return root?.localName === "svg" && root.namespaceURI === SVG_NS ? source : null;
}

export function svgDataUrl(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

/**
 * A ```svg fence, shown like a mermaid one. The picture is only ever an <img>:
 * the browser runs no script or event handler of an SVG image and loads
 * nothing it links to, so the fence's text never enters the page's DOM.
 */
export function SvgBlock({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const { locale } = useI18n();
  const isZh = locale.startsWith("zh");
  const [showPreview, setShowPreview] = useState(true);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [unsizedUrl, setUnsizedUrl] = useState<string | null>(null);
  const previewVisible = showPreview && !isStreaming;
  // undefined: not parsed (a server render has no DOMParser).
  const source = useMemo(
    () => (previewVisible && typeof DOMParser !== "undefined" ? svgImageSource(code, new DOMParser()) : undefined),
    [code, previewVisible],
  );
  const url = useMemo(() => (source ? svgDataUrl(source) : null), [source]);

  const previewButton = useMemo(() => (
    <PreviewToggleButton
      isStreaming={isStreaming}
      previewVisible={previewVisible}
      onToggle={() => setShowPreview((v) => !v)}
      title={previewVisible
        ? (isZh ? "查看 SVG 源码" : "Show SVG source")
        : (isZh ? "预览 SVG" : "Preview SVG")}
    />
  ), [isStreaming, isZh, previewVisible]);

  if (!previewVisible) {
    return <CodeBlock code={code} lang="svg" headerAction={previewButton} isStreaming={isStreaming} />;
  }

  const ready = url !== null && failedUrl !== url;
  const svgImageLabel = isZh ? "SVG 图像" : "SVG image";
  const svgViewerLabel = isZh ? "SVG 查看器" : "SVG viewer";
  const openSvgViewerLabel = isZh ? "打开 SVG 查看器" : "Open SVG viewer";
  const invalidSvgLabel = isZh ? "无效的 SVG 图像" : "Invalid SVG image";
  const image = (className: string) => {
    const isUnsized = unsizedUrl === url;
    const isPreview = className === "svg-block-image";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url ?? undefined}
        alt={svgImageLabel}
        // Neither a viewBox nor a width and height: the image has no size of its own.
        className={[className, isUnsized ? "is-unsized" : ""].filter(Boolean).join(" ")}
        style={isPreview
          ? (isUnsized
            ? { display: "block", width: "100%", height: 240 }
            : { display: "block", width: "auto", maxWidth: "100%", height: "auto", maxHeight: "min(360px, 50dvh)" })
          : { display: "block", width: "100%", height: "auto", ...(isUnsized ? { aspectRatio: "2 / 1" } : {}) }}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (!naturalWidth || !naturalHeight) setUnsizedUrl(url);
        }}
        onError={() => setFailedUrl(url)}
      />
    );
  };

  return (
    <PreviewFrame
      lang="svg"
      actions={
        <>
          {ready && source && <SvgDownloadButton onClick={() => downloadSvgFile(source, "image.svg")} />}
          {previewButton}
        </>
      }
    >
      {source === undefined ? (
        <div className="mermaid-block mermaid-block-loading" />
      ) : !ready ? (
        <div className="mermaid-block mermaid-block-error">{invalidSvgLabel}</div>
      ) : (
        <>
          {!zoomOpen && (
            <button
              type="button"
              className="mermaid-block mermaid-preview-button"
              title={openSvgViewerLabel}
              aria-label={openSvgViewerLabel}
              onClick={() => setZoomOpen(true)}
            >
              {image("svg-block-image")}
            </button>
          )}
          {zoomOpen && (
            <DiagramZoomDialog title={svgImageLabel} label={svgViewerLabel} onClose={() => setZoomOpen(false)}>
              {image("svg-zoom-image")}
            </DiagramZoomDialog>
          )}
        </>
      )}
    </PreviewFrame>
  );
}
