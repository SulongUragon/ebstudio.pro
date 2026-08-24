import type { ComicPanel, VisualBookPage, VisualBookProject } from "./visual-book-types";
import { visualProjectFilename } from "./visual-book-utils";

const W = 1200;
const H = 1800;

type EditorialLayout = VisualBookPage["layout"];

const EDITORIAL_LAYOUTS: EditorialLayout[] = [
  "full-bleed",
  "image-top",
  "image-left",
  "image-right",
  "quote",
];

const EDITORIAL_DEFAULTS: EditorialLayout[] = ["image-top", "image-left", "image-right"];

export const DEFAULT_VISUAL_PALETTE = {
  green: "#0f5d3b",
  navy: "#0a3a74",
  blue: "#0b4f8a",
  mint: "rgba(15,93,59,.045)",
  border: "rgba(10,58,116,.72)",
  ink: "#1d2730",
};

export const DEFAULT_VISUAL_ACCENT_COLORS = {
  divider: DEFAULT_VISUAL_PALETTE.green,
  quote: DEFAULT_VISUAL_PALETTE.green,
  takeawayLabel: DEFAULT_VISUAL_PALETTE.navy,
  takeawayBorder: DEFAULT_VISUAL_PALETTE.border,
  takeawayBullets: [DEFAULT_VISUAL_PALETTE.green, DEFAULT_VISUAL_PALETTE.navy],
  diamond: DEFAULT_VISUAL_PALETTE.green,
};

const THEME = {
  paper: "#f7f1e7",
  paperWarm: "#efe5d6",
  ink: DEFAULT_VISUAL_PALETTE.ink,
  muted: "#59636b",
  line: "rgba(10,58,116,.30)",
  charcoal: "#111111",
  ivory: "#fff8eb",
};

const NOTEBOOK = {
  cream: "#f7f1e7",
  paperEdge: "#ded3bf",
  line: "rgba(64,118,174,.24)",
  green: "#0f5d3b",
  navy: "#0a3a74",
  ink: "#1d2730",
  muted: "#59636b",
  tape: "rgba(223,211,174,.80)",
};

export async function exportVisualPdf(project: VisualBookProject) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [W, H] });

  for (let i = 0; i < project.pages.length; i++) {
    if (i) pdf.addPage([W, H], "portrait");
    pdf.addImage(await renderVisualPage(project, project.pages[i]), "JPEG", 0, 0, W, H, undefined, "FAST");
  }

  pdf.save(visualProjectFilename(project.title, "Visual-Edition.pdf"));
}

export async function exportVisualPagesZip(project: VisualBookProject) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const page of project.pages) {
    zip.file(
      `page-${String(page.pageNumber).padStart(2, "0")}.jpg`,
      (await renderVisualPage(project, page)).split(",")[1],
      { base64: true },
    );
  }

  zip.file("storyboard.json", JSON.stringify({ ...project, pages: project.pages.map(stripImages) }, null, 2));

  downloadBlob(
    await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 7 } }),
    visualProjectFilename(project.title, "Page-Images.zip"),
  );
}

export async function exportVisualPageJpeg(project: VisualBookProject, page: VisualBookPage) {
  const a = document.createElement("a");
  a.href = await renderVisualPage(project, page);
  a.download = visualProjectFilename(project.title, `Page-${String(page.pageNumber).padStart(2, "0")}.jpg`);
  a.click();
}

export async function renderVisualPage(project: VisualBookProject, page: VisualBookPage) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const c = canvas.getContext("2d");
  if (!c) throw new Error("This browser could not render the visual page.");

  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";

  drawPaper(c);

  if (isComicProject(project)) {
    await drawComic(c, project, page);
  } else if (isNotebookReflectionProject(project)) {
    await drawNotebookReflectionPage(c, project, page);
  } else {
    await drawEditorialVisual(c, project, page);
  }

  return canvas.toDataURL("image/jpeg", 0.94);
}

/**
 * The persisted project mode is the routing contract. Panel data is deliberately
 * ignored here because stale or partially rewritten panels must never turn a
 * Visual Mini eBook into a comic export.
 */
export function isComicProject(project: Pick<VisualBookProject, "mode">) {
  return project.mode === "comic";
}

export function isEditorialVisualProject(project: Pick<VisualBookProject, "mode">) {
  return !isComicProject(project);
}

export function getVisualTemplate(project: VisualBookProject): string {
  const source = project as VisualBookProject & Record<string, unknown>;
  const candidates = [source.template, source.style, source.theme, source.visualStyle];
  const templates = candidates
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim().toLowerCase());
  return templates.includes("notebook-reflection") ? "notebook-reflection" : templates[0] ?? "";
}

export function isNotebookReflectionProject(project: VisualBookProject) {
  return !isComicProject(project) && getVisualTemplate(project) === "notebook-reflection";
}

export function resolveEditorialLayout(
  page: Partial<Pick<VisualBookPage, "layout" | "pageNumber" | "role">>,
): EditorialLayout {
  if (page.role === "cover") return "full-bleed";
  if (page.layout && EDITORIAL_LAYOUTS.includes(page.layout)) return page.layout;
  if (page.role === "cta") return "quote";

  const pageNumber = Number.isFinite(page.pageNumber) ? Number(page.pageNumber) : 2;
  return EDITORIAL_DEFAULTS[Math.max(0, pageNumber - 2) % EDITORIAL_DEFAULTS.length];
}

async function drawEditorialVisual(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  const pageIndex = Math.max(0, page.pageNumber - 1);
  const layout = resolveEditorialLayout(page);
  const denseCopy = visualWordCount(page.body) > 115;

  if (page.role === "cover") {
    await drawCover(c, project, page);
    return;
  }

  drawRunningHeader(c, project, page);

  if (page.role === "cta") {
    await drawClosingEditorial(c, page);
    return;
  }

  if (page.pageNumber === 2) {
    await drawOpeningEditorial(c, page);
    return;
  }

  if (layout === "full-bleed" && !denseCopy) {
    await drawCinematicFullBleed(c, project, page);
    return;
  }

  if (layout === "image-left" && !denseCopy) {
    await drawSplitEditorial(c, page, "left");
    return;
  }

  if (layout === "image-right" && !denseCopy) {
    await drawSplitEditorial(c, page, "right");
    return;
  }

  if (layout === "quote") {
    await drawQuoteEditorial(c, page);
    return;
  }

  await drawImageTopEditorial(c, page, pageIndex);
}

async function drawNotebookReflectionPage(
  c: CanvasRenderingContext2D,
  project: VisualBookProject,
  page: VisualBookPage,
) {
  drawNotebookPaper(c);

  if (page.role === "cover") {
    await drawNotebookReflectionCover(c, project, page);
    return;
  }

  const layout = resolveEditorialLayout(page);
  const photoOnLeft = layout === "image-left" || (layout !== "image-right" && page.pageNumber % 2 === 0);
  const photoX = photoOnLeft ? 76 : 674;
  const titleX = photoOnLeft ? 604 : 76;
  const titleWidth = 520;
  const copy = buildVisualPageSections(page.body, page.title);
  const label = notebookReflectionLabel(page);

  drawHandwrittenNoteLabel(c, page.role === "cta" ? "CLOSING NOTE" : "FIELD NOTE", 76, 78, NOTEBOOK.green);

  c.fillStyle = NOTEBOOK.ink;
  const afterTitle = fitTextWithoutEllipsis(c, page.title, {
    x: titleX,
    y: 205,
    maxWidth: titleWidth,
    maxLines: 5,
    fontSize: 72,
    minFontSize: 44,
    lineHeight: 78,
    fontFamily: "Georgia",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  }).endY;
  drawScribbleUnderline(c, titleX, afterTitle + 20, Math.min(350, titleWidth - 30), page.pageNumber % 2 ? NOTEBOOK.green : NOTEBOOK.navy);

  c.fillStyle = NOTEBOOK.muted;
  fitTextWithoutEllipsis(c, copy.note, {
    x: titleX,
    y: afterTitle + 68,
    maxWidth: titleWidth - 12,
    maxLines: 3,
    fontSize: 25,
    minFontSize: 21,
    lineHeight: 36,
    fontFamily: "Georgia",
    fontStyle: "italic",
  });

  await drawPinnedPhoto(c, page.imageData, photoX, 172, 450, 570, page.pageNumber % 2 ? -0.025 : 0.022);

  c.fillStyle = NOTEBOOK.ink;
  const notebookType = visualBodyTypography(copy.body);
  const afterBody = fitTextWithoutEllipsis(c, copy.body, {
    x: 78,
    y: 850,
    maxWidth: 1042,
    maxLines: Math.max(10, notebookType.maxLines),
    fontSize: notebookType.fontSize,
    minFontSize: Math.max(22, notebookType.fontSize - 5),
    lineHeight: notebookType.lineHeight,
    fontFamily: "Georgia",
  }).endY;

  const boxY = Math.min(Math.max(afterBody + 50, 1335), 1440);
  drawPartialBorderBox(c, 78, boxY, 1044, 245, page.pageNumber % 2 ? NOTEBOOK.green : NOTEBOOK.navy);
  drawHandwrittenNoteLabel(c, label, 116, boxY + 50, page.pageNumber % 2 ? NOTEBOOK.green : NOTEBOOK.navy);
  drawNotebookHighlights(c, copy.body, 116, boxY + 101, 940);
  drawNotebookFooter(c, project, page);
}

async function drawNotebookReflectionCover(
  c: CanvasRenderingContext2D,
  project: VisualBookProject,
  page: VisualBookPage,
) {
  drawHandwrittenNoteLabel(c, "NOTEBOOK REFLECTION", 78, 86, NOTEBOOK.green);
  await drawPinnedPhoto(c, page.imageData, 126, 170, 948, 770, -0.014);

  c.fillStyle = NOTEBOOK.ink;
  const afterTitle = fitTextWithoutEllipsis(c, project.title || page.title, {
    x: 86,
    y: 1090,
    maxWidth: 1020,
    maxLines: 4,
    fontSize: 90,
    minFontSize: 54,
    lineHeight: 98,
    fontFamily: "Georgia",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  }).endY;
  drawScribbleUnderline(c, 88, afterTitle + 24, 390, NOTEBOOK.green);

  const subtitle = fitCompleteSentenceOnly(project.subtitle, page.body);
  if (subtitle) {
    c.fillStyle = NOTEBOOK.muted;
    fitTextWithoutEllipsis(c, subtitle, {
      x: 90,
      y: afterTitle + 78,
      maxWidth: 930,
      maxLines: 3,
      fontSize: 30,
      minFontSize: 23,
      lineHeight: 45,
      fontFamily: "Georgia",
      fontStyle: "italic",
      preserveAll: true,
    });
  }

  c.fillStyle = NOTEBOOK.navy;
  c.font = "700 22px Arial";
  c.fillText(safeVisualText(project.author.toUpperCase(), "headline"), 90, H - 92);
  drawTapeAccent(c, 970, H - 142, 120, 42, 0.07);
}

function drawNotebookPaper(c: CanvasRenderingContext2D) {
  c.fillStyle = NOTEBOOK.cream;
  c.fillRect(0, 0, W, H);

  const wash = c.createRadialGradient(W * 0.42, H * 0.2, 100, W * 0.5, H * 0.5, H);
  wash.addColorStop(0, "rgba(255,255,255,.38)");
  wash.addColorStop(1, "rgba(128,102,65,.08)");
  c.fillStyle = wash;
  c.fillRect(0, 0, W, H);

  c.strokeStyle = NOTEBOOK.line;
  c.lineWidth = 2;
  for (let y = 126; y < H - 80; y += 52) {
    c.beginPath();
    c.moveTo(58, y);
    c.lineTo(W - 58, y);
    c.stroke();
  }

  c.strokeStyle = "rgba(15,93,59,.18)";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(55, 0);
  c.lineTo(55, H);
  c.stroke();
}

async function drawPinnedPhoto(
  c: CanvasRenderingContext2D,
  data: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
) {
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.rotate(rotation);

  c.shadowColor = "rgba(29,39,48,.18)";
  c.shadowBlur = 26;
  c.shadowOffsetY = 16;
  c.fillStyle = "#fffdf8";
  c.fillRect(-w / 2, -h / 2, w, h);
  c.shadowColor = "transparent";

  await imageCover(c, data, -w / 2 + 24, -h / 2 + 24, w - 48, h - 104, "#dfe5df");
  c.strokeStyle = NOTEBOOK.paperEdge;
  c.lineWidth = 2;
  c.strokeRect(-w / 2, -h / 2, w, h);
  drawTapeAccent(c, -74, -h / 2 - 14, 148, 48, -0.025);
  c.restore();
}

function drawTapeAccent(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation = 0,
) {
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.rotate(rotation);
  c.fillStyle = NOTEBOOK.tape;
  c.beginPath();
  c.moveTo(-w / 2 + 8, -h / 2);
  c.lineTo(w / 2, -h / 2 + 5);
  c.lineTo(w / 2 - 7, h / 2);
  c.lineTo(-w / 2, h / 2 - 4);
  c.closePath();
  c.fill();
  c.restore();
}

export function drawPartialBorderBox(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  const corner = Math.min(82, w * 0.16, h * 0.32);
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x, y + corner);
  c.lineTo(x, y);
  c.lineTo(x + corner, y);
  c.moveTo(x + w - corner, y);
  c.lineTo(x + w, y);
  c.lineTo(x + w, y + corner);
  c.moveTo(x + w, y + h - corner);
  c.lineTo(x + w, y + h);
  c.lineTo(x + w - corner, y + h);
  c.moveTo(x + corner, y + h);
  c.lineTo(x, y + h);
  c.lineTo(x, y + h - corner);
  c.stroke();
}

function drawNotebookFooter(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  c.fillStyle = NOTEBOOK.muted;
  fitTextWithoutEllipsis(c, project.title, {
    x: 76,
    y: H - 60,
    maxWidth: 880,
    maxLines: 1,
    fontSize: 20,
    minFontSize: 13,
    lineHeight: 24,
    fontFamily: "Georgia",
    fontStyle: "italic",
    preserveAll: true,
    textRole: "headline",
  });

  c.fillStyle = NOTEBOOK.navy;
  c.font = "700 21px Arial";
  c.textAlign = "right";
  c.fillText(safeVisualText(String(page.pageNumber).padStart(2, "0"), "headline"), W - 76, H - 60);
  c.textAlign = "left";
}

function drawHandwrittenNoteLabel(
  c: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  color: string,
) {
  c.fillStyle = color;
  c.font = "italic 700 22px 'Segoe Print', 'Bradley Hand', cursive";
  c.fillText(safeVisualText(label, "headline"), x, y);
}

function drawScribbleUnderline(c: CanvasRenderingContext2D, x: number, y: number, w: number, color: string) {
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x, y);
  c.bezierCurveTo(x + w * 0.24, y - 5, x + w * 0.52, y + 5, x + w, y - 1);
  c.stroke();
  c.lineCap = "butt";
}

function drawNotebookHighlights(c: CanvasRenderingContext2D, source: string, x: number, y: number, w: number) {
  drawSafeBulletBlock(c, source, {
    x: x + 32,
    y,
    bulletX: x + 8,
    maxBullets: 2,
    maxWidth: w - 32,
    maxLinesPerBullet: 2,
    fontSize: 26,
    minFontSize: 15,
    lineHeight: 34,
    maxHeight: 130,
    fontFamily: "Georgia",
    bulletGap: 12,
    textColor: NOTEBOOK.ink,
    bulletColors: [NOTEBOOK.green, NOTEBOOK.navy],
  });
}

function notebookReflectionLabel(page: VisualBookPage) {
  if (page.role === "cta") return "TONIGHT’S TRUTHS";
  if (page.layout === "quote") return "REFLECTION";
  if (page.pageNumber === 2) return "WHAT MATTERS MOST";
  return "FIELD NOTE";
}

async function drawCover(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  await imageCover(c, page.imageData, 0, 0, W, H, THEME.charcoal);

  const shade = c.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,.18)");
  shade.addColorStop(0.45, "rgba(0,0,0,.08)");
  shade.addColorStop(1, "rgba(0,0,0,.86)");
  c.fillStyle = shade;
  c.fillRect(0, 0, W, H);

  c.fillStyle = "rgba(247,241,231,.84)";
  c.fillRect(74, H - 560, 6, 380);

  c.fillStyle = THEME.ivory;
  const titleY = H - (project.subtitle ? 440 : 350);
  const afterTitle = fitTextWithoutEllipsis(c, project.title, {
    x: 104,
    y: titleY,
    maxWidth: 980,
    maxLines: 4,
    fontSize: 96,
    minFontSize: 54,
    lineHeight: 104,
    fontFamily: "Georgia",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  }).endY;

  const subtitle = fitCompleteSentenceOnly(project.subtitle, page.body);
  if (subtitle) {
    c.fillStyle = "rgba(255,248,235,.90)";
    fitTextWithoutEllipsis(c, subtitle, {
      x: 108,
      y: Math.max(afterTitle + 26, titleY + 245),
      maxWidth: 900,
      maxLines: 3,
      fontSize: 30,
      minFontSize: 23,
      lineHeight: 44,
      fontFamily: "Arial",
      preserveAll: true,
    });
  }

  c.fillStyle = "rgba(255,248,235,.92)";
  c.font = "700 23px Arial";
  c.fillText(safeVisualText(project.author.toUpperCase(), "headline"), 108, H - 96);

  drawSmallMark(c, W - 150, 94, DEFAULT_VISUAL_PALETTE.green);
}

async function drawOpeningEditorial(c: CanvasRenderingContext2D, page: VisualBookPage) {
  const copy = buildVisualPageSections(page.body, page.title);

  c.fillStyle = THEME.ink;
  const afterTitle = fitTextWithoutEllipsis(c, page.title, {
    x: 76,
    y: 225,
    maxWidth: 1030,
    maxLines: 3,
    fontSize: 82,
    minFontSize: 50,
    lineHeight: 88,
    fontFamily: "Georgia",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  }).endY;
  drawAccentLine(c, 78, afterTitle + 22, 300);

  const imageY = afterTitle + 82;
  const requestedImageH = visualWordCount(copy.body) > 120 ? 500 : visualWordCount(copy.body) > 90 ? 570 : 650;
  const imageH = Math.min(requestedImageH, 1050 - imageY);
  await imageCover(c, page.imageData, 76, imageY, 1048, imageH, THEME.paperWarm);
  drawImageFrame(c, 76, imageY, 1048, imageH);

  c.fillStyle = "#312d2b";
  const bodyType = visualBodyTypography(copy.body);
  const bodyY = imageY + imageH + 82;
  const minimumBodySize = Math.max(21, bodyType.fontSize - 5);
  const afterBody = fitTextWithoutEllipsis(c, copy.body, {
    x: 78,
    y: bodyY,
    maxWidth: 1010,
    maxLines: lineBudgetBefore(bodyY, 1456, bodyType, minimumBodySize),
    fontSize: bodyType.fontSize,
    minFontSize: minimumBodySize,
    lineHeight: bodyType.lineHeight,
    fontFamily: "Arial",
  }).endY;

  drawTakeawayBox(c, 78, Math.min(Math.max(afterBody + 44, 1430), 1500), 1044, 210, copy.body);
  drawFooter(c, page);
}

async function drawImageTopEditorial(c: CanvasRenderingContext2D, page: VisualBookPage, pageIndex: number) {
  const copy = buildVisualPageSections(page.body, page.title);
  const words = visualWordCount(copy.body);
  const imageH = words > 130 ? 440 : words > 100 ? 520 : pageIndex % 3 === 0 ? 680 : 630;

  await imageCover(c, page.imageData, 76, 150, 1048, imageH, THEME.paperWarm);
  drawImageFrame(c, 76, 150, 1048, imageH);

  const titleY = imageH + 250;
  c.fillStyle = THEME.ink;
  const afterTitle = fitTextWithoutEllipsis(c, page.title, {
    x: 76,
    y: titleY,
    maxWidth: 1010,
    maxLines: 3,
    fontSize: 78,
    minFontSize: 48,
    lineHeight: 84,
    fontFamily: "Georgia",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  }).endY;

  drawAccentLine(c, 78, afterTitle + 28, 320);

  c.fillStyle = "#312d2b";
  const bodyType = visualBodyTypography(copy.body);
  const bodyY = afterTitle + 88;
  const minimumBodySize = Math.max(21, bodyType.fontSize - 5);
  const afterBody = fitTextWithoutEllipsis(c, copy.body, {
    x: 78,
    y: bodyY,
    maxWidth: 1010,
    maxLines: lineBudgetBefore(bodyY, 1436, bodyType, minimumBodySize),
    fontSize: bodyType.fontSize,
    minFontSize: minimumBodySize,
    lineHeight: bodyType.lineHeight,
    fontFamily: "Arial",
  }).endY;

  drawTakeawayBox(c, 78, Math.min(Math.max(afterBody + 54, 1400), 1490), 1044, 220, copy.body);
  drawFooter(c, page);
}

async function drawSplitEditorial(c: CanvasRenderingContext2D, page: VisualBookPage, imageSide: "left" | "right") {
  const imageX = imageSide === "left" ? 70 : 660;
  const textX = imageSide === "left" ? 650 : 78;
  const imageW = 470;
  const imageH = 1320;
  const copy = buildVisualPageSections(page.body, page.title);

  await imageCover(c, page.imageData, imageX, 178, imageW, imageH, THEME.paperWarm);
  drawImageFrame(c, imageX, 178, imageW, imageH);

  c.fillStyle = THEME.ink;
  const afterTitle = fitTextWithoutEllipsis(c, page.title, {
    x: textX,
    y: 235,
    maxWidth: 480,
    maxLines: 5,
    fontSize: 76,
    minFontSize: 42,
    lineHeight: 82,
    fontFamily: "Georgia",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  }).endY;

  drawAccentLine(c, textX, afterTitle + 28, 210);

  c.fillStyle = "#302d2a";
  const bodyType = visualBodyTypography(copy.body, true);
  const bodyY = afterTitle + 88;
  const minimumBodySize = Math.max(21, bodyType.fontSize - 5);
  const afterBody = fitTextWithoutEllipsis(c, copy.body, {
    x: textX,
    y: bodyY,
    maxWidth: 480,
    maxLines: lineBudgetBefore(bodyY, 1224, bodyType, minimumBodySize),
    fontSize: bodyType.fontSize,
    minFontSize: minimumBodySize,
    lineHeight: bodyType.lineHeight,
    fontFamily: "Arial",
  }).endY;

  const boxY = Math.min(Math.max(afterBody + 56, 1130), 1280);
  drawCompactBox(c, textX, boxY, 480, 260, copy.body);

  drawFooter(c, page);
}

async function drawClosingEditorial(c: CanvasRenderingContext2D, page: VisualBookPage) {
  const copy = buildVisualPageSections(page.body, page.title);
  const imageH = visualWordCount(copy.body) > 115 ? 470 : visualWordCount(copy.body) > 90 ? 540 : 610;

  await imageCover(c, page.imageData, 76, 150, 1048, imageH, THEME.paperWarm);
  drawImageFrame(c, 76, 150, 1048, imageH);

  c.fillStyle = THEME.ink;
  const afterTitle = fitTextWithoutEllipsis(c, page.title, {
    x: 84,
    y: imageH + 290,
    maxWidth: 1010,
    maxLines: 3,
    fontSize: 84,
    minFontSize: 50,
    lineHeight: 90,
    fontFamily: "Georgia",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  }).endY;
  drawAccentLine(c, 86, afterTitle + 24, 300);

  c.fillStyle = "#302d2a";
  const bodyType = visualBodyTypography(copy.body);
  const bodyY = afterTitle + 84;
  const minimumBodySize = Math.max(21, bodyType.fontSize - 5);
  const afterBody = fitTextWithoutEllipsis(c, copy.body, {
    x: 86,
    y: bodyY,
    maxWidth: 990,
    maxLines: lineBudgetBefore(bodyY, 1442, bodyType, minimumBodySize),
    fontSize: bodyType.fontSize,
    minFontSize: minimumBodySize,
    lineHeight: bodyType.lineHeight,
    fontFamily: "Arial",
  }).endY;

  drawTakeawayBox(c, 86, Math.min(Math.max(afterBody + 48, 1430), 1490), 1028, 220, copy.body);
  drawFooter(c, page);
}

async function drawCinematicFullBleed(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  await imageCover(c, page.imageData, 0, 0, W, H, THEME.charcoal);

  const g = c.createLinearGradient(0, H * 0.25, 0, H);
  g.addColorStop(0, "rgba(0,0,0,.02)");
  g.addColorStop(0.62, "rgba(0,0,0,.35)");
  g.addColorStop(1, "rgba(0,0,0,.88)");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  c.fillStyle = THEME.ivory;
  const afterTitle = fitTextWithoutEllipsis(c, page.title, {
    x: 86,
    y: 1195,
    maxWidth: 990,
    maxLines: 4,
    fontSize: 86,
    minFontSize: 48,
    lineHeight: 94,
    fontFamily: "Georgia",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  }).endY;

  c.fillStyle = "rgba(255,248,235,.88)";
  const copy = buildVisualPageSections(page.body, page.title);
  const bodyType = visualBodyTypography(copy.body);
  const bodyY = afterTitle + 50;
  const minimumBodySize = 21;
  fitTextWithoutEllipsis(c, copy.body, {
    x: 90,
    y: bodyY,
    maxWidth: 930,
    maxLines: lineBudgetBefore(bodyY, 1650, bodyType, minimumBodySize, 7),
    fontSize: bodyType.fontSize,
    minFontSize: minimumBodySize,
    lineHeight: bodyType.lineHeight,
    fontFamily: "Arial",
  });

  c.fillStyle = "rgba(255,248,235,.78)";
  fitTextWithoutEllipsis(c, project.title, {
    x: 86,
    y: 96,
    maxWidth: 850,
    maxLines: 1,
    fontSize: 22,
    minFontSize: 14,
    lineHeight: 24,
    fontFamily: "Arial",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  });
  c.fillText(safeVisualText(String(page.pageNumber).padStart(2, "0"), "headline"), 1040, 1708);
}

async function drawQuoteEditorial(c: CanvasRenderingContext2D, page: VisualBookPage) {
  const copy = buildVisualPageSections(page.body, page.title);
  const imageH = visualWordCount(copy.body) > 115 ? 410 : visualWordCount(copy.body) > 90 ? 480 : 540;
  await imageCover(c, page.imageData, 80, 150, 1040, imageH, THEME.paperWarm);
  drawImageFrame(c, 80, 150, 1040, imageH);

  const afterTitle = drawPairedQuoteTitle(c, page.title, {
    x: 154,
    y: imageH + 320,
    maxWidth: 880,
    maxLines: 4,
    fontSize: 72,
    minFontSize: 44,
    lineHeight: 82,
    fontFamily: "Georgia",
    fontWeight: "700",
    preserveAll: true,
    textRole: "headline",
  }).endY;

  drawAccentLine(c, 156, afterTitle + 26, 260);

  c.fillStyle = "#302d2a";
  const bodyType = visualBodyTypography(copy.body);
  const bodyY = afterTitle + 84;
  const minimumBodySize = Math.max(21, bodyType.fontSize - 5);
  const afterBody = fitTextWithoutEllipsis(c, copy.body, {
    x: 156,
    y: bodyY,
    maxWidth: 870,
    maxLines: lineBudgetBefore(bodyY, 1448, bodyType, minimumBodySize, 8),
    fontSize: bodyType.fontSize,
    minFontSize: minimumBodySize,
    lineHeight: bodyType.lineHeight,
    fontFamily: "Arial",
  }).endY;

  drawTakeawayBox(c, 80, Math.min(Math.max(afterBody + 42, 1440), 1490), 1040, 210, copy.body);

  drawFooter(c, page);
}

function drawRunningHeader(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  c.fillStyle = THEME.ink;
  fitTextWithoutEllipsis(c, project.title, {
    x: 74,
    y: 78,
    maxWidth: 850,
    maxLines: 1,
    fontSize: 25,
    minFontSize: 15,
    lineHeight: 28,
    fontFamily: "Georgia",
    preserveAll: true,
    textRole: "headline",
  });

  c.fillStyle = THEME.ink;
  c.font = "24px Georgia";
  c.textAlign = "right";
  c.fillText(safeVisualText(`Page ${page.pageNumber}`, "headline"), W - 76, 78);
  c.textAlign = "left";

  c.strokeStyle = THEME.line;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(74, 104);
  c.lineTo(W - 76, 104);
  c.stroke();
}

function drawPaper(c: CanvasRenderingContext2D) {
  c.fillStyle = THEME.paper;
  c.fillRect(0, 0, W, H);

  const g = c.createRadialGradient(W * 0.5, H * 0.25, 120, W * 0.5, H * 0.5, H);
  g.addColorStop(0, "rgba(255,255,255,.20)");
  g.addColorStop(1, "rgba(160,135,100,.08)");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}

function drawImageFrame(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.strokeStyle = "rgba(10,58,116,.46)";
  c.lineWidth = 3;
  c.strokeRect(x, y, w, h);
}

function drawAccentLine(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  c.strokeStyle = DEFAULT_VISUAL_ACCENT_COLORS.divider;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + w, y);
  c.stroke();

  drawSmallMark(c, x + w + 24, y - 8, DEFAULT_VISUAL_ACCENT_COLORS.diamond);
}

export function drawPairedQuoteTitle(
  c: CanvasRenderingContext2D,
  title: string,
  options: TextFitOptions,
) {
  c.fillStyle = THEME.ink;
  const result = fitTextWithoutEllipsis(c, normalizePairedQuoteTitle(title, false), options);
  if (!result.lines.length) return result;

  setCanvasFont(c, options, result.fontSize);
  const lastLine = result.lines[result.lines.length - 1];
  const closingX = options.x + c.measureText(lastLine).width + 12;
  const closingY = options.y + (result.lines.length - 1) * result.lineHeight + result.fontSize * 0.2;
  const quoteSize = Math.min(112, Math.max(72, result.fontSize * 1.55));
  const rightLimit = options.x + options.maxWidth + quoteSize * 0.45;
  if (closingX + quoteSize * 0.32 > rightLimit) return result;

  c.fillStyle = DEFAULT_VISUAL_ACCENT_COLORS.quote;
  c.font = `700 ${quoteSize}px Georgia`;
  c.fillText("“", options.x - quoteSize * 0.56, options.y + quoteSize * 0.14);
  c.fillText("”", closingX, closingY);
  return result;
}

function drawTakeawayBox(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  source: string,
) {
  const bulletOptions: AdaptiveBulletOptions = {
    maxBullets: 2,
    maxWidth: w - 125,
    maxLinesPerBullet: 2,
    fontSize: 26,
    minFontSize: 16,
    lineHeight: 34,
    maxHeight: Math.max(86, Math.min(175, H - y - 150)),
    fontFamily: "Arial",
    bulletGap: 12,
  };
  const fit = fitBulletsAdaptive(c, source, bulletOptions);
  if (!fit.bullets.length) return;
  const actualHeight = Math.min(H - y - 118, Math.max(h, fit.requiredHeight + 108));

  c.fillStyle = DEFAULT_VISUAL_PALETTE.mint;
  c.fillRect(x, y, w, actualHeight);
  c.strokeStyle = DEFAULT_VISUAL_ACCENT_COLORS.takeawayBorder;
  c.lineWidth = 2.4;
  c.strokeRect(x, y, w, actualHeight);

  drawSmallMark(c, x + w / 2 - 10, y - 13, DEFAULT_VISUAL_ACCENT_COLORS.diamond);

  c.fillStyle = DEFAULT_VISUAL_ACCENT_COLORS.takeawayLabel;
  c.font = "700 18px Arial";
  c.fillText(safeVisualText("KEY TAKEAWAY", "headline"), x + 42, y + 40);

  drawSafeBulletBlock(c, source, {
    ...bulletOptions,
    x: x + 78,
    y: y + 88,
    bulletX: x + 52,
    maxHeight: actualHeight - 102,
    textColor: DEFAULT_VISUAL_PALETTE.ink,
    bulletColors: DEFAULT_VISUAL_ACCENT_COLORS.takeawayBullets,
  });
}

function drawCompactBox(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  source: string,
) {
  const bulletOptions: AdaptiveBulletOptions = {
    maxBullets: 2,
    maxWidth: w - 86,
    maxLinesPerBullet: 2,
    fontSize: 23,
    minFontSize: 16,
    lineHeight: 31,
    maxHeight: Math.max(120, Math.min(245, H - y - 160)),
    fontFamily: "Arial",
    bulletGap: 14,
  };
  const fit = fitBulletsAdaptive(c, source, bulletOptions);
  if (!fit.bullets.length) return;
  const actualHeight = Math.min(H - y - 118, Math.max(h, fit.requiredHeight + 100));

  c.fillStyle = DEFAULT_VISUAL_PALETTE.mint;
  c.fillRect(x, y, w, actualHeight);
  c.strokeStyle = DEFAULT_VISUAL_ACCENT_COLORS.takeawayBorder;
  c.lineWidth = 2;
  c.strokeRect(x, y, w, actualHeight);

  c.fillStyle = DEFAULT_VISUAL_ACCENT_COLORS.takeawayLabel;
  c.font = "700 17px Arial";
  c.fillText(safeVisualText("TAKEAWAY", "headline"), x + 28, y + 35);

  drawSafeBulletBlock(c, source, {
    ...bulletOptions,
    x: x + 58,
    y: y + 82,
    bulletX: x + 34,
    maxHeight: actualHeight - 96,
    textColor: DEFAULT_VISUAL_PALETTE.ink,
    bulletColors: DEFAULT_VISUAL_ACCENT_COLORS.takeawayBullets,
  });
}

function drawFooter(c: CanvasRenderingContext2D, page: VisualBookPage) {
  c.fillStyle = THEME.muted;
  c.font = "700 22px Arial";
  c.textAlign = "right";
  c.fillText(safeVisualText(String(page.pageNumber).padStart(2, "0"), "headline"), W - 78, H - 70);
  c.textAlign = "left";
}

function drawSmallMark(c: CanvasRenderingContext2D, x: number, y: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x + 12, y);
  c.lineTo(x + 22, y + 12);
  c.lineTo(x + 12, y + 24);
  c.lineTo(x + 2, y + 12);
  c.closePath();
  c.fill();
}

async function drawComic(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  if (page.role === "cover") {
    await imageCover(c, page.panels?.[0]?.imageData ?? page.imageData, 0, 0, W, H, "#17211d");

    const g = c.createLinearGradient(0, H * 0.36, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.91)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.fillStyle = "#fff9ed";
    c.font = "700 96px Georgia";
    wrap(c, project.title, 88, 1270, 1024, 105, 4);

    c.font = "700 27px Arial";
    c.fillText(project.author.toUpperCase(), 92, 1708);
    return;
  }

  c.fillStyle = "#121413";
  c.fillRect(0, 0, W, H);

  const panels = page.panels?.length ? page.panels : [emptyPanel()];
  const boxes = panelBoxes(panels.length);

  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const b = boxes[i];

    await imageCover(c, p.imageData, b.x, b.y, b.w, b.h, "#2e3330");
    c.strokeStyle = "#f8f1e5";
    c.lineWidth = 10;
    c.strokeRect(b.x, b.y, b.w, b.h);

    panelWords(c, p, b);
  }

  c.fillStyle = "#f8f1e5";
  c.font = "700 23px Arial";
  c.fillText(`${page.pageNumber}  ${page.title}`.toUpperCase(), 46, 1762);
}

function panelWords(c: CanvasRenderingContext2D, p: ComicPanel, b: { x: number; y: number; w: number; h: number }) {
  let y = b.y + 24;

  for (const line of p.dialogue.slice(0, 3)) {
    const text = line.speaker ? `${line.speaker.toUpperCase()}: ${line.text}` : line.text;
    const bh = Math.min(176, 58 + Math.ceil(text.length / 28) * 29);

    c.fillStyle = "rgba(255,255,255,.94)";
    roundedRect(c, b.x + 24, y, Math.min(b.w - 48, 430), bh, 26);
    c.fill();

    c.fillStyle = "#141514";
    c.font = "700 23px Arial";
    wrap(c, text, b.x + 46, y + 37, Math.min(b.w - 92, 384), 29, 5);

    y += bh + 15;
  }

  if (p.caption) {
    c.fillStyle = "rgba(248,235,191,.94)";
    c.fillRect(b.x + 24, b.y + b.h - 100, b.w - 48, 74);

    c.fillStyle = "#171817";
    c.font = "italic 21px Georgia";
    wrap(c, p.caption, b.x + 40, b.y + b.h - 71, b.w - 80, 27, 2);
  }

  if (p.soundEffect) {
    c.save();
    c.translate(b.x + b.w - 36, b.y + b.h * 0.55);
    c.rotate(-0.13);
    c.textAlign = "right";
    c.font = "900 53px Arial";
    c.lineWidth = 11;
    c.strokeStyle = "#111";
    c.strokeText(p.soundEffect.toUpperCase(), 0, 0);
    c.fillStyle = "#f5b541";
    c.fillText(p.soundEffect.toUpperCase(), 0, 0);
    c.restore();
  }
}

function panelBoxes(count: number) {
  const gap = 22;
  const m = 38;
  const uw = W - m * 2;
  const uh = H - 120;

  if (count <= 1) return [{ x: m, y: 34, w: uw, h: uh }];

  if (count === 2) {
    const h = (uh - gap) / 2;
    return [0, 1].map((i) => ({ x: m, y: 34 + i * (h + gap), w: uw, h }));
  }

  if (count === 3) {
    const th = uh * 0.54;
    const bh = uh - th - gap;
    return [
      { x: m, y: 34, w: uw, h: th },
      { x: m, y: 34 + th + gap, w: (uw - gap) / 2, h: bh },
      { x: m + (uw + gap) / 2, y: 34 + th + gap, w: (uw - gap) / 2, h: bh },
    ];
  }

  const w = (uw - gap) / 2;
  const h = (uh - gap) / 2;

  return [0, 1, 2, 3].map((i) => ({
    x: m + (i % 2) * (w + gap),
    y: 34 + Math.floor(i / 2) * (h + gap),
    w,
    h,
  }));
}

async function imageCover(
  c: CanvasRenderingContext2D,
  data: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  fallback: string,
) {
  drawImagePlaceholder(c, x, y, w, h, fallback);

  if (!data) return;

  try {
    const im = await loadImage(data);
    const scale = Math.max(w / im.width, h / im.height);
    const sw = w / scale;
    const sh = h / scale;

    c.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
  } catch {
    // The designed placeholder keeps the export usable when stored image data is incomplete.
  }
}

function drawImagePlaceholder(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fallback: string,
) {
  c.fillStyle = fallback;
  c.fillRect(x, y, w, h);

  const wash = c.createLinearGradient(x, y, x + w, y + h);
  const comicPlaceholder = fallback === "#17211d" || fallback === "#2e3330";
  wash.addColorStop(0, "rgba(255,248,235,.18)");
  wash.addColorStop(0.52, comicPlaceholder ? "rgba(169,130,74,.10)" : "rgba(15,93,59,.12)");
  wash.addColorStop(1, comicPlaceholder ? "rgba(122,20,40,.12)" : "rgba(10,58,116,.14)");
  c.fillStyle = wash;
  c.fillRect(x, y, w, h);

  c.strokeStyle = "rgba(255,248,235,.16)";
  c.lineWidth = Math.max(2, Math.min(w, h) * 0.008);
  c.beginPath();
  c.moveTo(x + w * 0.12, y + h * 0.84);
  c.lineTo(x + w * 0.46, y + h * 0.48);
  c.lineTo(x + w * 0.63, y + h * 0.66);
  c.lineTo(x + w * 0.88, y + h * 0.30);
  c.stroke();
}

export type TextFitOptions = {
  x: number;
  y: number;
  maxWidth: number;
  maxLines: number;
  fontSize: number;
  minFontSize?: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
  preserveAll?: boolean;
  textRole?: "headline" | "sentence" | "paragraph";
};

export type TextFitResult = {
  endY: number;
  fontSize: number;
  lineHeight: number;
  lines: string[];
  text: string;
};

const VISIBLE_ELLIPSIS = /(?:\.{3,}|…+)/;
const SENTENCE_ENDING = /[.!?]["'”’)}\]]*$/;

type VisualTextFont = {
  fontSize: number;
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
};

export type AdaptiveBulletFit = {
  bullets: string[];
  fontSize: number;
  lineHeight: number;
  linesPerBullet: number[];
  requiredHeight: number;
};

/**
 * Ellipsis-bearing trailing fragments are already incomplete source copy. They
 * are removed instead of being disguised with a period, which previously let
 * chopped words such as `answe...` survive as `answe.` in the final artwork.
 */
export function removeVisibleEllipsis(source: unknown) {
  const original = String(source ?? "");
  if (VISIBLE_ELLIPSIS.test(original)) return removeIncompleteTrailingFragment(original);
  return sanitizeHeadline(original);
}

function sanitizeHeadline(source: unknown) {
  return String(source ?? "")
    .replace(/(?:\.{3,}|…+)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])(?:\s*[.!?])+/g, "$1")
    .trim();
}

export function normalizePairedQuoteTitle(source: unknown, useQuotes = true) {
  const plain = sanitizeHeadline(source)
    .replace(/^[\s“”"']+/, "")
    .replace(/[\s“”"']+$/, "")
    .trim();
  if (!plain) return "";
  return useQuotes ? `“${plain}”` : plain;
}

export function safeVisualText(
  source: unknown,
  textRole: "headline" | "sentence" | "paragraph" = "paragraph",
) {
  const original = String(source ?? "").trim();
  if (!original) return "";
  if (VISIBLE_ELLIPSIS.test(original)) return removeIncompleteTrailingFragment(original);
  if (textRole === "headline") return normalizePairedQuoteTitle(original, false);
  if (textRole === "sentence") return ensureCompleteSemanticSentence(original);
  return removeIncompleteTrailingFragment(original);
}

export function validateVisualTextBeforeDraw(
  source: unknown,
  textRole: "headline" | "sentence" | "paragraph" = "paragraph",
) {
  const safe = safeVisualText(source, textRole);
  if (!safe || VISIBLE_ELLIPSIS.test(safe)) return "";
  if (textRole !== "headline" && rejectDanglingSentenceEnding(safe)) return "";
  return safe;
}

export function cleanTruncatedText(source: unknown) {
  return removeIncompleteTrailingFragment(source);
}

export function isCompleteSentence(source: unknown) {
  const clean = String(source ?? "").trim();
  const beginsNaturally = /^[“"'([{]*[A-Z0-9]/.test(clean);
  return Boolean(
    clean
    && beginsNaturally
    && !VISIBLE_ELLIPSIS.test(clean)
    && SENTENCE_ENDING.test(clean)
    && !rejectDanglingSentenceEnding(clean),
  );
}

/** Rejects punctuated fragments that look finished typographically but not semantically. */
export function rejectDanglingSentenceEnding(source: unknown) {
  const clean = String(source ?? "")
    .replace(/[.!?]+["'”’)}\]]*$/, "")
    .trim();
  if (!clean) return true;
  const danglingEndings = [
    /\b(?:a|an|and|as|at|because|but|by|for|from|how|if|in|of|on|or|that|the|their|these|this|those|to|what|when|where|which|while|who|whose|with|without|your)$/i,
    /\b(?:about|because of|the cost of|the limits of|with a|with an|with the|about a|about an|about the|as if|as if a|as if an|as if the|and a|and an|and the|or a|or an|or the|but a|but an|but the|where a|where an|where the)$/i,
    /\b(?:about|for|from|of|with)\s+(?:what|which|that)\s+(?:a|an|the)?\s*[a-z][a-z'-]*$/i,
    /\b(?:the shape of|the way)(?:\s+(?:a|an|the))?$/i,
  ];
  return danglingEndings.some((pattern) => pattern.test(clean));
}

export function ensureCompleteSemanticSentence(source: unknown) {
  const clean = sanitizeHeadline(source);
  return isCompleteSentence(clean) ? clean : "";
}

export function splitIntoCompleteSentences(source: unknown) {
  return String(source ?? "")
    .split(/(?:\.{3,}|…+)/)
    .flatMap((chunk) => chunk.match(/[^.!?]+[.!?]+(?:["'”’)}\]]+)?/g) ?? [])
    .map((sentence) => sentence.replace(/^[-•]\s*/, "").replace(/\s+/g, " ").trim())
    .filter(isCompleteSentence);
}

export function removeIncompleteTrailingFragment(source: unknown) {
  return splitIntoCompleteSentences(source).join(" ");
}

export function fitCompleteSentenceOnly(source: unknown, fallback: unknown = "", maxCharacters = 220) {
  const limit = Math.max(18, maxCharacters);

  for (const candidate of [source, fallback]) {
    const sentence = splitIntoCompleteSentences(candidate).find((part) => part.length <= limit);
    if (sentence) return sentence;

    for (const complete of splitIntoCompleteSentences(candidate)) {
      const clause = shorterCompleteClause(complete, limit);
      if (clause) return clause;
    }
  }

  return "";
}

export function shortenToCompletePhrase(source: unknown, maxCharacters = 118) {
  const limit = Math.max(18, maxCharacters);
  const sentences = splitIntoCompleteSentences(source);
  const completeSentence = sentences.find((sentence) => sentence.length <= limit);
  if (completeSentence) return completeSentence;

  for (const sentence of sentences) {
    const clause = shorterCompleteClause(sentence, limit);
    if (clause) return clause;
  }

  return "";
}

export function extractShortCompleteBullets(source: unknown, maxBullets = 2, maxCharacters = 118) {
  const limit = Math.max(18, maxCharacters);
  const seen = new Set<string>();
  return splitIntoCompleteSentences(source)
    .slice()
    .reverse()
    .map((candidate) => candidate.length <= limit ? candidate : shorterCompleteClause(candidate, limit))
    .filter((candidate) => {
      if (!candidate) return false;
      const key = candidate.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, maxBullets))
    .reverse();
}

export function extractCleanBullets(source: unknown, maxBullets = 4, maxCharacters = 118) {
  return extractShortCompleteBullets(source, maxBullets, maxCharacters);
}

export function fitCompleteWordsOnly(
  c: CanvasRenderingContext2D,
  source: unknown,
  maxWidth: number,
  maxLines: number,
) {
  return fitCompleteSentencesToLines(c, source, maxWidth, maxLines, canvasFont(c));
}

export function fitLinesWithoutEllipsis(
  c: CanvasRenderingContext2D,
  source: unknown,
  maxWidth: number,
  maxLines: number,
) {
  const fitted = fitCompleteSentencesToLines(c, source, maxWidth, maxLines, canvasFont(c));
  return fitted ? wrappedLines(c, fitted, maxWidth) : [];
}

export function fitTextByFontSize(
  c: CanvasRenderingContext2D,
  source: string,
  options: TextFitOptions,
): TextFitResult {
  const startSize = Math.max(13, options.fontSize);
  const roleMinimum = options.textRole === "headline" ? 13 : 15;
  const minimum = Math.min(startSize, Math.max(roleMinimum, options.minFontSize ?? startSize));
  const maximumLines = Math.max(1, options.maxLines);

  for (let size = startSize; size >= minimum; size -= 1) {
    setCanvasFont(c, options, size);
    const candidateLines = wrappedLines(c, source, options.maxWidth);
    if (candidateLines.length <= maximumLines && candidateLines.every((line) => c.measureText(line).width <= options.maxWidth)) {
      const lineHeight = Math.max(size * 1.18, options.lineHeight * (size / startSize));
      return {
        endY: options.y + candidateLines.length * lineHeight,
        fontSize: size,
        lineHeight,
        lines: candidateLines,
        text: source,
      };
    }
  }

  const lineHeight = Math.max(minimum * 1.18, options.lineHeight * (minimum / startSize));
  return { endY: options.y, fontSize: minimum, lineHeight, lines: [], text: "" };
}

export function fitCompleteTextAdaptive(
  c: CanvasRenderingContext2D,
  source: unknown,
  options: TextFitOptions,
): TextFitResult {
  const textRole = options.textRole ?? "paragraph";
  const safe = validateVisualTextBeforeDraw(source, textRole);
  const fullFit = safe ? fitTextByFontSize(c, safe, options) : null;
  if (fullFit?.lines.length) return fullFit;

  const startSize = Math.max(13, options.fontSize);
  const roleMinimum = textRole === "headline" ? 13 : 15;
  const minimum = Math.min(startSize, Math.max(roleMinimum, options.minFontSize ?? startSize));
  const lineHeight = Math.max(minimum * 1.18, options.lineHeight * (minimum / startSize));
  if (textRole === "headline" || !safe) {
    return { endY: options.y, fontSize: minimum, lineHeight, lines: [], text: "" };
  }

  setCanvasFont(c, options, minimum);
  const fittedText = fitCompleteParagraphToBox(c, safe, options.maxWidth, Math.max(1, options.maxLines), {
    fontSize: minimum,
    fontFamily: options.fontFamily,
    fontWeight: options.fontWeight,
    fontStyle: options.fontStyle,
  });
  const lines = fittedText ? wrappedLines(c, fittedText, options.maxWidth) : [];
  return {
    endY: options.y + lines.length * lineHeight,
    fontSize: minimum,
    lineHeight,
    lines,
    text: fittedText,
  };
}

export function drawSafeWrappedText(
  c: CanvasRenderingContext2D,
  source: unknown,
  options: TextFitOptions,
) {
  const result = fitCompleteTextAdaptive(c, source, options);
  setCanvasFont(c, options, result.fontSize);
  result.lines.forEach((line, index) => {
    if (line && !VISIBLE_ELLIPSIS.test(line) && c.measureText(line).width <= options.maxWidth) {
      c.fillText(line, options.x, options.y + index * result.lineHeight);
    }
  });
  return result;
}

export function fitTextWithoutEllipsis(
  c: CanvasRenderingContext2D,
  source: unknown,
  options: TextFitOptions,
) {
  return drawSafeWrappedText(c, source, options);
}

export function fitCompleteSentencesToLines(
  c: CanvasRenderingContext2D,
  source: unknown,
  maxWidth: number,
  maxLines: number,
  font: VisualTextFont,
) {
  const previousFont = c.font;
  setCanvasFont(c, font, font.fontSize);
  const sentences = splitIntoCompleteSentences(source);
  let complete = "";

  for (const sentence of sentences) {
    const candidate = complete ? `${complete} ${sentence}` : sentence;
    if (fitsLineBudget(c, candidate, maxWidth, maxLines)) {
      complete = candidate;
      continue;
    }
    if (complete) break;
  }

  if (!complete) {
    complete = sentences.find((sentence) => fitsLineBudget(c, sentence, maxWidth, maxLines)) ?? "";
  }

  c.font = previousFont;
  return complete;
}

export function fitCompleteParagraphToBox(
  c: CanvasRenderingContext2D,
  source: unknown,
  maxWidth: number,
  maxLines: number,
  font: VisualTextFont,
) {
  return fitCompleteSentencesToLines(c, source, maxWidth, maxLines, font);
}

export function extractCompleteBullets(
  c: CanvasRenderingContext2D,
  source: unknown,
  maxBullets: number,
  maxWidth: number,
  maxLinesPerBullet: number,
  font: VisualTextFont,
) {
  const previousFont = c.font;
  setCanvasFont(c, font, font.fontSize);
  const selected: string[] = [];

  for (const sentence of splitIntoCompleteSentences(source).slice().reverse()) {
    const fittedCandidate = fitsLineBudget(c, sentence, maxWidth, maxLinesPerBullet)
      ? sentence
      : completeClauseForLineBudget(c, sentence, maxWidth, maxLinesPerBullet);
    const candidate = ensureCompleteSemanticSentence(fittedCandidate);
    if (candidate && !selected.some((item) => item.toLowerCase() === candidate.toLowerCase())) {
      selected.push(candidate);
    }
    if (selected.length >= Math.max(1, maxBullets)) break;
  }

  if (!selected.length) {
    const safeFallbacks = [
      "The page asks the reader to notice what has shifted.",
      "The scene turns private tension into visible consequence.",
      "This moment changes what the character is willing to protect.",
    ];
    const fallback = safeFallbacks.find((candidate) => (
      fitsLineBudget(c, candidate, maxWidth, maxLinesPerBullet)
    ));
    if (fallback) selected.push(fallback);
  }

  c.font = previousFont;
  return selected.reverse();
}

type AdaptiveBulletOptions = {
  maxBullets: number;
  maxWidth: number;
  maxLinesPerBullet: number;
  fontSize: number;
  minFontSize: number;
  lineHeight: number;
  maxHeight: number;
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
  bulletGap?: number;
};

const SAFE_VISUAL_FALLBACKS = [
  "The page asks the reader to notice what has shifted.",
  "The scene turns private tension into visible consequence.",
  "This moment changes what the character is willing to protect.",
];

export function fitBulletsAdaptive(
  c: CanvasRenderingContext2D,
  source: unknown,
  options: AdaptiveBulletOptions,
): AdaptiveBulletFit {
  const previousFont = c.font;
  const sentences = splitIntoCompleteSentences(source);
  const maximum = Math.max(1, options.maxBullets);
  const minimumSize = Math.min(options.fontSize, Math.max(15, options.minFontSize));
  const gap = Math.max(8, options.bulletGap ?? 14);

  const attempt = (bullets: string[]): AdaptiveBulletFit | null => {
    if (!bullets.length) return null;
    for (let size = options.fontSize; size >= minimumSize; size -= 1) {
      setCanvasFont(c, options, size);
      const lineHeight = Math.max(size * 1.18, options.lineHeight * (size / options.fontSize));
      const linesPerBullet = bullets.map((bullet) => wrappedLines(c, bullet, options.maxWidth).length);
      const requiredHeight = linesPerBullet.reduce((sum, count) => sum + count * lineHeight, 0)
        + Math.max(0, bullets.length - 1) * gap;
      if (
        linesPerBullet.every((count) => count > 0 && count <= options.maxLinesPerBullet)
        && requiredHeight <= options.maxHeight
      ) {
        return { bullets, fontSize: size, lineHeight, linesPerBullet, requiredHeight };
      }
    }
    return null;
  };

  const preferred = sentences.slice(-maximum);
  let result = attempt(preferred);

  if (!result) {
    setCanvasFont(c, options, minimumSize);
    const individuallyFitting = sentences.filter((sentence) => (
      fitsLineBudget(c, sentence, options.maxWidth, options.maxLinesPerBullet)
    )).slice(-maximum);
    result = attempt(individuallyFitting);
  }

  if (!result) {
    setCanvasFont(c, options, minimumSize);
    const shorterSourceBullets = preferred
      .map((sentence) => completeClauseForLineBudget(c, sentence, options.maxWidth, options.maxLinesPerBullet))
      .map(ensureCompleteSemanticSentence)
      .filter(Boolean);
    result = attempt(shorterSourceBullets);
  }

  for (let count = Math.min(maximum - 1, sentences.length); !result && count >= 1; count -= 1) {
    result = attempt(sentences.slice(-count));
  }

  if (!result) {
    const fallback = SAFE_VISUAL_FALLBACKS.find((candidate) => attempt([candidate]));
    if (fallback) result = attempt([fallback]);
  }

  c.font = previousFont;
  return result ?? {
    bullets: [],
    fontSize: minimumSize,
    lineHeight: Math.max(minimumSize * 1.18, options.lineHeight * (minimumSize / options.fontSize)),
    linesPerBullet: [],
    requiredHeight: 0,
  };
}

type SafeBulletDrawOptions = AdaptiveBulletOptions & {
  x: number;
  y: number;
  bulletX: number;
  textColor: string;
  bulletColors: string[];
  bulletRadius?: number;
};

export function drawSafeBulletBlock(
  c: CanvasRenderingContext2D,
  source: unknown,
  options: SafeBulletDrawOptions,
) {
  const fit = fitBulletsAdaptive(c, source, options);
  setCanvasFont(c, options, fit.fontSize);
  let baseline = options.y;
  fit.bullets.forEach((bullet, index) => {
    c.fillStyle = options.bulletColors[index % options.bulletColors.length];
    c.beginPath();
    c.arc(options.bulletX, baseline - fit.fontSize * 0.34, options.bulletRadius ?? 5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = options.textColor;
    const lines = wrappedLines(c, validateVisualTextBeforeDraw(bullet, "sentence"), options.maxWidth);
    lines.forEach((line, lineIndex) => c.fillText(line, options.x, baseline + lineIndex * fit.lineHeight));
    baseline += lines.length * fit.lineHeight + Math.max(8, options.bulletGap ?? 14);
  });
  return fit;
}

function sentenceParts(source: string) {
  return splitIntoCompleteSentences(source);
}

function shorterCompleteClause(source: string, maxCharacters: number) {
  const clauses = source
    .replace(/[.!?]["'”’)}\]]*$/, "")
    .split(/[;:]/)
    .map((clause) => clause.trim())
    .filter(isStandaloneClause)
    .map((clause) => `${clause.replace(/[,;:\-–—\s]+$/, "")}.`)
    .filter((clause) => isCompleteSentence(clause) && clause.length <= maxCharacters);
  return clauses[0] ?? "";
}

function completeClauseForLineBudget(
  c: CanvasRenderingContext2D,
  source: string,
  maxWidth: number,
  maxLines: number,
) {
  const clauses = source
    .replace(/[.!?]["'”’)}\]]*$/, "")
    .split(/[;:]/)
    .map((clause) => clause.trim())
    .filter(isStandaloneClause)
    .map((clause) => `${clause.replace(/[,;:\-–—\s]+$/, "")}.`);
  return clauses.find((clause) => fitsLineBudget(c, clause, maxWidth, maxLines)) ?? "";
}

function isStandaloneClause(source: string) {
  const clean = source.replace(/^[“"'([{]+/, "").replace(/[”"')\]}]+$/, "").trim();
  if (clean.split(/\s+/).length < 4) return false;
  if (/^(?:although|as|because|if|since|that|though|unless|until|when|whenever|where|whether|which|while|who|whose)\b/i.test(clean)) return false;
  return !rejectDanglingSentenceEnding(`${clean}.`);
}

function fitsLineBudget(c: CanvasRenderingContext2D, source: string, maxWidth: number, maxLines: number) {
  const lines = wrappedLines(c, source, maxWidth);
  return lines.length > 0
    && lines.length <= Math.max(1, maxLines)
    && lines.every((line) => c.measureText(line).width <= maxWidth);
}

function canvasFont(c: CanvasRenderingContext2D): VisualTextFont {
  const match = /(?:(italic)\s+)?(?:(\d{3})\s+)?(\d+(?:\.\d+)?)px\s+(.+)/.exec(c.font);
  return {
    fontSize: Number(match?.[3] ?? 16),
    fontFamily: match?.[4] ?? "Arial",
    fontWeight: match?.[2],
    fontStyle: match?.[1],
  };
}

function setCanvasFont(c: CanvasRenderingContext2D, options: VisualTextFont, fontSize: number) {
  c.font = [options.fontStyle, options.fontWeight, `${fontSize}px`, options.fontFamily].filter(Boolean).join(" ");
}

function wrappedLines(c: CanvasRenderingContext2D, source: string, maxWidth: number) {
  const words = source.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && c.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function wrap(
  c: CanvasRenderingContext2D,
  text: unknown,
  x: number,
  y: number,
  max: number,
  lh: number,
  limit: number,
) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let consumed = 0;

  for (; consumed < words.length; consumed += 1) {
    const word = words[consumed];
    const test = line ? `${line} ${word}` : word;

    if (c.measureText(test).width > max && line) {
      lines.push(line);
      line = word;
      if (lines.length === limit) {
        line = "";
        break;
      }
    } else {
      line = test;
    }
  }

  if (line && lines.length < limit) lines.push(line);

  if (consumed < words.length && lines.length) {
    let last = lines[lines.length - 1].replace(/[.,;:!?]+$/, "");
    while (last && c.measureText(`${last}…`).width > max) {
      last = last.replace(/\s*\S+$/, "");
    }
    lines[lines.length - 1] = `${last || lines[lines.length - 1]}…`;
  }

  lines.forEach((s, i) => c.fillText(s, x, y + i * lh));
  return y + lines.length * lh;
}

export function buildVisualPageSections(source: unknown, _title = "") {
  void _title; // Keep the existing call contract without using a headline as body-copy fallback.
  const clean = cleanTruncatedText(source);
  const sentences = sentenceParts(clean);

  const body = clean;
  const highlights = extractShortCompleteBullets(body, 2, 118);
  const noteSource = sentences[0] ?? "";

  return {
    body,
    highlights,
    note: shortenToCompletePhrase(noteSource, 118),
  };
}

export function visualBodyTypography(source: unknown, narrow = false) {
  const words = visualWordCount(source);

  if (narrow) {
    if (words > 115) return { fontSize: 24, lineHeight: 38, maxLines: 16 };
    if (words > 82) return { fontSize: 26, lineHeight: 41, maxLines: 15 };
    return { fontSize: 29, lineHeight: 46, maxLines: 13 };
  }

  if (words > 135) return { fontSize: 25, lineHeight: 39, maxLines: 10 };
  if (words > 95) return { fontSize: 27, lineHeight: 42, maxLines: 9 };
  return { fontSize: 30, lineHeight: 47, maxLines: 8 };
}

function lineBudgetBefore(
  startY: number,
  bottomY: number,
  typography: ReturnType<typeof visualBodyTypography>,
  minimumFontSize: number,
  maximumLines = typography.maxLines,
) {
  const minimumLineHeight = Math.max(
    minimumFontSize * 1.12,
    typography.lineHeight * (minimumFontSize / typography.fontSize),
  );
  return Math.min(maximumLines, Math.max(1, Math.floor((bottomY - startY) / minimumLineHeight)));
}

function visualWordCount(source: unknown) {
  return String(source).trim().split(/\s+/).filter(Boolean).length;
}

function roundedRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function loadImage(data: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("A page image could not be rendered."));
    im.src = data;
  });
}

function emptyPanel(): ComicPanel {
  return { id: "empty", order: 1, scene: "", camera: "", dialogue: [], caption: "", soundEffect: "" };
}

function stripImages(page: VisualBookPage) {
  return {
    ...page,
    imageData: undefined,
    panels: page.panels?.map((p) => ({ ...p, imageData: undefined })) ?? [],
  };
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
