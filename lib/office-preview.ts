import fs from "node:fs";
import path from "node:path";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wrapDocumentHtml(bodyHtml: string, fileName: string, subtitle?: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; min-height: 100%; background: #eef1f5; color: #171717; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; padding: 24px; }
  main {
    box-sizing: border-box;
    max-width: 880px;
    min-height: calc(100vh - 48px);
    margin: 0 auto;
    padding: 44px 52px;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.12);
  }
  .file-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e5e7eb;
  }
  .file-title {
    color: #374151;
    font: 600 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    word-break: break-word;
  }
  .file-subtitle {
    color: #6b7280;
    font-size: 12px;
    white-space: nowrap;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.35; margin: 1.1em 0 0.45em; color: #111827; }
  p { margin: 0.6em 0; line-height: 1.75; font-size: 14.5px; white-space: pre-wrap; word-break: break-word; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 13px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; vertical-align: top; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  a { color: #2563eb; }
  @media (max-width: 720px) {
    body { padding: 0; background: #fff; }
    main { min-height: 100vh; padding: 24px 18px; box-shadow: none; border-radius: 0; }
  }
</style>
</head>
<body>
<main>
<div class="file-header">
  <div class="file-title">${escapeHtml(fileName)}</div>
  ${subtitle ? `<div class="file-subtitle">${escapeHtml(subtitle)}</div>` : ""}
</div>
${bodyHtml}
</main>
</body>
</html>`;
}

export async function renderLegacyDocPreviewHtml(filePath: string, fileName: string): Promise<string> {
  const WordExtractorModule = await import("word-extractor");
  const WordExtractor = WordExtractorModule.default ?? WordExtractorModule;
  const extractor = new WordExtractor();
  const doc = await extractor.extract(filePath);
  const sections: string[] = [];

  const headerText = typeof doc.getHeaders === "function" ? String(doc.getHeaders({ includeFooters: false }) ?? "").trim() : "";
  if (headerText) {
    sections.push(`<div style="color:#6b7280;font-size:12.5px;margin-bottom:16px;padding-bottom:8px;border-bottom:1px dashed #e5e7eb">${escapeHtml(headerText)}</div>`);
  }

  const body = String(doc.getBody() ?? "");
  const paragraphs = body.split(/\r?\n/);
  const tableRowsBuffer: string[][] = [];

  const flushTable = () => {
    if (tableRowsBuffer.length === 0) return;
    const maxCols = Math.max(...tableRowsBuffer.map((r) => r.length));
    const rowsHtml = tableRowsBuffer.map((cols, idx) => {
      const tag = idx === 0 && tableRowsBuffer.length > 1 ? "th" : "td";
      const padded = Array.from({ length: maxCols }, (_, i) => cols[i] ?? "");
      return `<tr>${padded.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join("")}</tr>`;
    }).join("");
    sections.push(`<table><tbody>${rowsHtml}</tbody></table>`);
    tableRowsBuffer.length = 0;
  };

  for (const rawLine of paragraphs) {
    const line = rawLine.replace(/\x07/g, "\t").trimEnd();
    if (!line.trim()) {
      flushTable();
      continue;
    }
    if (line.includes("\t")) {
      const cells = line.split("\t").map((c) => c.trim());
      if (cells.some(Boolean)) {
        tableRowsBuffer.push(cells);
        continue;
      }
    }
    flushTable();
    const trimmed = line.trim();
    if (/^(?:[一二三四五六七八九十]+、|第[一二三四五六七八九十百]+[章节条]|附件\d+)/.test(trimmed) && trimmed.length <= 60) {
      sections.push(`<h3>${escapeHtml(trimmed)}</h3>`);
    } else {
      sections.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flushTable();

  const footnotes = typeof doc.getFootnotes === "function" ? String(doc.getFootnotes() ?? "").trim() : "";
  if (footnotes) {
    sections.push(`<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"><div style="color:#6b7280;font-size:12.5px">${escapeHtml(footnotes)}</div>`);
  }

  return wrapDocumentHtml(
    sections.length > 0 ? sections.join("\n") : `<p style="color:#6b7280">（文档中未提取到可显示的文本内容）</p>`,
    fileName,
    "Word 文档预览 (.doc)",
  );
}

function colLetter(index: number): string {
  let n = index;
  let out = "";
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

export async function renderSpreadsheetPreviewHtml(filePath: string, fileName: string): Promise<string> {
  const XLSXModule = await import("xlsx");
  const XLSX = XLSXModule.default ?? XLSXModule;
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const workbook = ext === ".csv" || ext === ".tsv"
    ? XLSX.read(buf.toString("utf8"), { type: "string", FS: ext === ".tsv" ? "\t" : ",", sheetRows: 1201 })
    : XLSX.read(buf, { type: "buffer", cellDates: true, sheetRows: 1201 });

  const sheetNames = workbook.SheetNames.slice(0, 24);
  const MAX_ROWS_PER_SHEET = 1200;
  const MAX_COLS_PER_SHEET = 64;

  const radioInputs: string[] = [];
  const tabLabels: string[] = [];
  const sheetPanels: string[] = [];
  const tabCssRules: string[] = [];

  sheetNames.forEach((sheetName, idx) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = (XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][]) ?? [];
    const totalRows = rows.length;
    const slicedRows = rows.slice(0, MAX_ROWS_PER_SHEET);
    const maxCols = Math.min(
      MAX_COLS_PER_SHEET,
      slicedRows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0),
    );

    const inputId = `sheet-radio-${idx}`;
    radioInputs.push(`<input type="radio" name="active-sheet" id="${inputId}" class="sheet-radio"${idx === 0 ? " checked" : ""}>`);
    tabLabels.push(`<label for="${inputId}" class="sheet-tab">${escapeHtml(sheetName)} <span class="sheet-count">${totalRows}</span></label>`);
    tabCssRules.push(
      `#${inputId}:checked ~ .sheet-bar label[for="${inputId}"] { background: #fff; color: #0f172a; font-weight: 600; border-color: #cbd5e1; border-bottom-color: #fff; box-shadow: 0 -2px 0 #2563eb inset; }`,
      `#${inputId}:checked ~ .sheet-stage #sheet-panel-${idx} { display: block; }`,
    );

    if (totalRows === 0 || maxCols === 0) {
      sheetPanels.push(`<section id="sheet-panel-${idx}" class="sheet-panel"><div class="empty-note">此工作表为空</div></section>`);
      return;
    }

    const colHeaders = Array.from({ length: maxCols }, (_, c) => `<th class="col-letter">${colLetter(c)}</th>`).join("");
    const bodyRows = slicedRows.map((row, rIdx) => {
      const arr = Array.isArray(row) ? row : [];
      const isHeaderRow = rIdx === 0;
      const cells = Array.from({ length: maxCols }, (_, c) => {
        const val = arr[c] == null ? "" : String(arr[c]);
        return `<td class="${isHeaderRow ? "row-zero" : ""}">${escapeHtml(val)}</td>`;
      }).join("");
      return `<tr><th class="row-num">${rIdx + 1}</th>${cells}</tr>`;
    }).join("");

    const truncatedBanner = totalRows > MAX_ROWS_PER_SHEET
      ? `<div class="trunc-banner">共 ${totalRows.toLocaleString()} 行，当前预览前 ${MAX_ROWS_PER_SHEET.toLocaleString()} 行（完整数据请点击右上角在系统 Excel/WPS 中打开或下载）</div>`
      : "";

    sheetPanels.push(
      `<section id="sheet-panel-${idx}" class="sheet-panel">${truncatedBanner}<div class="table-scroll"><table><thead><tr><th class="corner">#</th>${colHeaders}</tr></thead><tbody>${bodyRows}</tbody></table></div></section>`,
    );
  });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #f8fafc; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 12.5px; }
  .workbook { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .sheet-radio { position: absolute; opacity: 0; pointer-events: none; }
  .sheet-bar {
    display: flex; align-items: center; gap: 4px; padding: 8px 12px 0;
    background: #eef2f6; border-bottom: 1px solid #cbd5e1; overflow-x: auto; flex-shrink: 0;
  }
  .file-badge {
    margin-left: auto; padding: 0 8px 6px; color: #64748b; font-size: 11.5px; white-space: nowrap;
  }
  .sheet-tab {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
    border: 1px solid transparent; border-bottom: 0; border-radius: 6px 6px 0 0;
    background: rgba(255,255,255,0.45); color: #475569; cursor: pointer; white-space: nowrap; user-select: none;
  }
  .sheet-tab:hover { background: rgba(255,255,255,0.8); color: #0f172a; }
  .sheet-count { padding: 1px 5px; border-radius: 999px; background: #e2e8f0; color: #475569; font-size: 10.5px; }
  .sheet-stage { flex: 1; min-height: 0; overflow: hidden; background: #fff; }
  .sheet-panel { display: none; height: 100%; overflow: hidden; }
  .table-scroll { height: 100%; overflow: auto; }
  .trunc-banner { padding: 6px 12px; background: #eff6ff; border-bottom: 1px solid #bfdbfe; color: #1d4ed8; font-size: 12px; }
  table { border-collapse: separate; border-spacing: 0; min-width: 100%; width: max-content; }
  th, td { border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 5px 10px; max-width: 340px; vertical-align: top; word-break: break-word; }
  thead th { position: sticky; top: 0; z-index: 2; background: #f1f5f9; color: #475569; font-weight: 600; text-align: center; }
  .corner { position: sticky; left: 0; z-index: 3; width: 42px; background: #e2e8f0; }
  .row-num { position: sticky; left: 0; z-index: 1; background: #f8fafc; color: #64748b; font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; width: 42px; }
  .row-zero { background: #f8fafc; font-weight: 600; color: #0f172a; }
  tbody tr:nth-child(even) td:not(.row-zero) { background: #fcfdff; }
  tbody tr:hover td { background: #f0f7ff !important; }
  .empty-note { padding: 40px; text-align: center; color: #94a3b8; }
  ${tabCssRules.join("\n  ")}
</style>
</head>
<body>
<div class="workbook">
  ${radioInputs.join("\n  ")}
  <div class="sheet-bar">
    ${tabLabels.join("\n    ")}
    <span class="file-badge">${escapeHtml(fileName)} · ${sheetNames.length} 个工作表</span>
  </div>
  <div class="sheet-stage">
    ${sheetPanels.join("\n    ")}
  </div>
</div>
</body>
</html>`;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractXmlParagraphs(xml: string): string[] {
  const paragraphs: string[] = [];
  const pMatches = xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) ?? [];
  for (const p of pMatches) {
    const runs = [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    const text = runs.join("").trim();
    if (text) paragraphs.push(text);
  }
  return paragraphs;
}

export async function renderPptxPreviewHtml(filePath: string, fileName: string): Promise<string> {
  const JSZipModule = await import("jszip");
  const JSZip = JSZipModule.default ?? JSZipModule;
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(/slide(\d+)\.xml/i.exec(a)?.[1] ?? 0);
      const nb = Number(/slide(\d+)\.xml/i.exec(b)?.[1] ?? 0);
      return na - nb;
    });

  const mediaMime: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };

  const slidesHtml: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideNum = Number(/slide(\d+)\.xml/i.exec(slidePath)?.[1] ?? i + 1);
    const xml = await zip.files[slidePath].async("string");
    const paragraphs = extractXmlParagraphs(xml);

    // Embedded images via _rels
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const imagesHtml: string[] = [];
    if (zip.files[relsPath]) {
      const relsXml = await zip.files[relsPath].async("string");
      const targets = [...relsXml.matchAll(/Target="\.\.\/media\/([^"]+)"/gi)].map((m) => m[1]);
      for (const mediaName of [...new Set(targets)].slice(0, 6)) {
        const mediaEntry = zip.files[`ppt/media/${mediaName}`];
        if (!mediaEntry) continue;
        const ext = mediaName.split(".").pop()?.toLowerCase() ?? "";
        const mime = mediaMime[ext];
        if (!mime) continue;
        const b64 = await mediaEntry.async("base64");
        if (b64.length < 4 * 1024 * 1024) {
          imagesHtml.push(`<img src="data:${mime};base64,${b64}" alt="${escapeHtml(mediaName)}" style="max-height:220px;width:auto;object-fit:contain;border:1px solid #e2e8f0;border-radius:6px">`);
        }
      }
    }

    const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
    let notesText = "";
    if (zip.files[notesPath]) {
      const notesXml = await zip.files[notesPath].async("string");
      const noteParas = extractXmlParagraphs(notesXml).filter((p) => p !== String(slideNum));
      notesText = noteParas.join("\n").trim();
    }

    const title = paragraphs[0] ?? `幻灯片 ${slideNum}`;
    const bullets = paragraphs.slice(1);
    slidesHtml.push(`
      <article style="margin-bottom:24px;padding:28px 32px;border:1px solid #dbe2ea;border-radius:10px;background:#fafcff;box-shadow:0 2px 8px rgba(15,23,42,0.05)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="padding:2px 9px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:11.5px;font-weight:600">Slide ${i + 1} / ${slideFiles.length}</span>
        </div>
        <h2 style="margin:0 0 14px;font-size:19px;color:#0f172a">${escapeHtml(title)}</h2>
        ${bullets.length > 0 ? `<ul style="margin:0 0 12px;padding-left:20px;line-height:1.75;color:#334155">${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : ""}
        ${imagesHtml.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px">${imagesHtml.join("")}</div>` : ""}
        ${notesText ? `<div style="margin-top:14px;padding-top:10px;border-top:1px dashed #cbd5e1;color:#64748b;font-size:12.5px"><strong>备注：</strong>${escapeHtml(notesText)}</div>` : ""}
      </article>
    `);
  }

  return wrapDocumentHtml(
    slidesHtml.length > 0 ? slidesHtml.join("\n") : `<p style="color:#6b7280">（未在演示文稿中解析到幻灯片内容）</p>`,
    fileName,
    `PowerPoint 预览 · 共 ${slideFiles.length} 页`,
  );
}
