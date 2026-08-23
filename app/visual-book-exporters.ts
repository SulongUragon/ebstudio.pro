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

const THEME = {
  paper: "#f7f1e7",
  paperWarm: "#efe5d6",
  ink: "#17131c",
  muted: "#625a52",
  line: "#b7a487",
  gold: "#a9824a",
  wine: "#7a1428",
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
  c.font = "700 72px Georgia";
  const afterTitle = wrap(c, page.title, titleX, 205, titleWidth, 78, 5);
  drawScribbleUnderline(c, titleX, afterTitle + 20, Math.min(350, titleWidth - 30), page.pageNumber % 2 ? NOTEBOOK.green : NOTEBOOK.navy);

  c.fillStyle = NOTEBOOK.muted;
  c.font = "italic 25px Georgia";
  wrap(c, copy.note, titleX, afterTitle + 68, titleWidth - 12, 36, 3);

  await drawPinnedPhoto(c, page.imageData, photoX, 172, 450, 570, page.pageNumber % 2 ? -0.025 : 0.022);

  c.fillStyle = NOTEBOOK.ink;
  const notebookType = visualBodyTypography(copy.body);
  c.font = `${notebookType.fontSize}px Georgia`;
  const afterBody = wrap(c, copy.body, 78, 850, 1042, notebookType.lineHeight, Math.max(10, notebookType.maxLines));

  const boxY = Math.min(Math.max(afterBody + 50, 1335), 1440);
  drawPartialBorderBox(c, 78, boxY, 1044, 245, page.pageNumber % 2 ? NOTEBOOK.green : NOTEBOOK.navy);
  drawHandwrittenNoteLabel(c, label, 116, boxY + 50, page.pageNumber % 2 ? NOTEBOOK.green : NOTEBOOK.navy);
  drawNotebookHighlights(c, copy.highlights, 116, boxY + 101, 940);
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
  c.font = "700 90px Georgia";
  const afterTitle = wrap(c, project.title || page.title, 86, 1090, 1020, 98, 4);
  drawScribbleUnderline(c, 88, afterTitle + 24, 390, NOTEBOOK.green);

  if (project.subtitle) {
    c.fillStyle = NOTEBOOK.muted;
    c.font = "italic 30px Georgia";
    wrap(c, project.subtitle, 90, afterTitle + 78, 930, 45, 3);
  }

  c.fillStyle = NOTEBOOK.navy;
  c.font = "700 22px Arial";
  c.fillText(project.author.toUpperCase(), 90, H - 92);
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
  c.font = "italic 20px Georgia";
  c.fillText(project.title, 76, H - 60);

  c.fillStyle = NOTEBOOK.navy;
  c.font = "700 21px Arial";
  c.textAlign = "right";
  c.fillText(String(page.pageNumber).padStart(2, "0"), W - 76, H - 60);
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
  c.fillText(label, x, y);
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

function drawNotebookHighlights(c: CanvasRenderingContext2D, highlights: string[], x: number, y: number, w: number) {
  c.font = "26px Georgia";
  highlights.slice(0, 2).forEach((item, index) => {
    const itemY = y + index * 64;
    c.fillStyle = index % 2 ? NOTEBOOK.navy : NOTEBOOK.green;
    c.beginPath();
    c.arc(x + 8, itemY - 9, 5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = NOTEBOOK.ink;
    wrap(c, item, x + 32, itemY, w - 32, 34, 2);
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
  c.font = "700 96px Georgia";
  const titleY = H - (project.subtitle ? 440 : 350);
  const afterTitle = wrap(c, project.title, 104, titleY, 980, 104, 4);

  if (project.subtitle) {
    c.fillStyle = "rgba(255,248,235,.90)";
    c.font = "30px Arial";
    wrap(c, project.subtitle, 108, Math.max(afterTitle + 26, titleY + 245), 900, 44, 3);
  }

  c.fillStyle = "rgba(255,248,235,.92)";
  c.font = "700 23px Arial";
  c.fillText(project.author.toUpperCase(), 108, H - 96);

  drawSmallMark(c, W - 150, 94, THEME.gold);
}

async function drawOpeningEditorial(c: CanvasRenderingContext2D, page: VisualBookPage) {
  const copy = buildVisualPageSections(page.body, page.title);

  c.fillStyle = THEME.ink;
  c.font = "700 82px Georgia";
  const afterTitle = wrap(c, page.title, 76, 225, 1030, 88, 3);
  drawAccentLine(c, 78, afterTitle + 22, 300);

  const imageY = afterTitle + 82;
  const requestedImageH = visualWordCount(copy.body) > 120 ? 500 : visualWordCount(copy.body) > 90 ? 570 : 650;
  const imageH = Math.min(requestedImageH, 1050 - imageY);
  await imageCover(c, page.imageData, 76, imageY, 1048, imageH, THEME.paperWarm);
  drawImageFrame(c, 76, imageY, 1048, imageH);

  c.fillStyle = "#312d2b";
  const bodyType = visualBodyTypography(copy.body);
  c.font = `${bodyType.fontSize}px Arial`;
  const afterBody = wrap(c, copy.body, 78, imageY + imageH + 82, 1010, bodyType.lineHeight, bodyType.maxLines);

  drawTakeawayBox(c, 78, Math.min(Math.max(afterBody + 44, 1430), 1500), 1044, 210, copy.highlights);
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
  c.font = "700 78px Georgia";
  const afterTitle = wrap(c, page.title, 76, titleY, 1010, 84, 3);

  drawAccentLine(c, 78, afterTitle + 28, 320);

  c.fillStyle = "#312d2b";
  const bodyType = visualBodyTypography(copy.body);
  c.font = `${bodyType.fontSize}px Arial`;
  const afterBody = wrap(c, copy.body, 78, afterTitle + 88, 1010, bodyType.lineHeight, bodyType.maxLines);

  drawTakeawayBox(c, 78, Math.min(Math.max(afterBody + 54, 1400), 1490), 1044, 220, copy.highlights);
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
  c.font = "700 76px Georgia";
  const afterTitle = wrap(c, page.title, textX, 235, 480, 82, 5);

  drawAccentLine(c, textX, afterTitle + 28, 210);

  c.fillStyle = "#302d2a";
  const bodyType = visualBodyTypography(copy.body, true);
  c.font = `${bodyType.fontSize}px Arial`;
  const afterBody = wrap(c, copy.body, textX, afterTitle + 88, 480, bodyType.lineHeight, bodyType.maxLines);

  const boxY = Math.min(Math.max(afterBody + 56, 1130), 1280);
  drawCompactBox(c, textX, boxY, 480, 260, copy.highlights);

  drawFooter(c, page);
}

async function drawClosingEditorial(c: CanvasRenderingContext2D, page: VisualBookPage) {
  const copy = buildVisualPageSections(page.body, page.title);
  const imageH = visualWordCount(copy.body) > 115 ? 470 : visualWordCount(copy.body) > 90 ? 540 : 610;

  await imageCover(c, page.imageData, 76, 150, 1048, imageH, THEME.paperWarm);
  drawImageFrame(c, 76, 150, 1048, imageH);

  c.fillStyle = THEME.ink;
  c.font = "700 84px Georgia";
  const afterTitle = wrap(c, page.title, 84, imageH + 290, 1010, 90, 3);
  drawAccentLine(c, 86, afterTitle + 24, 300);

  c.fillStyle = "#302d2a";
  const bodyType = visualBodyTypography(copy.body);
  c.font = `${bodyType.fontSize}px Arial`;
  const afterBody = wrap(c, copy.body, 86, afterTitle + 84, 990, bodyType.lineHeight, bodyType.maxLines);

  drawTakeawayBox(c, 86, Math.min(Math.max(afterBody + 48, 1430), 1490), 1028, 220, copy.highlights);
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
  c.font = "700 86px Georgia";
  const afterTitle = wrap(c, page.title, 86, 1195, 990, 94, 4);

  c.fillStyle = "rgba(255,248,235,.88)";
  const copy = buildVisualPageSections(page.body, page.title);
  const bodyType = visualBodyTypography(copy.body);
  c.font = `${bodyType.fontSize}px Arial`;
  wrap(c, copy.body, 90, afterTitle + 50, 930, bodyType.lineHeight, Math.min(7, bodyType.maxLines));

  c.fillStyle = "rgba(255,248,235,.78)";
  c.font = "700 22px Arial";
  c.fillText(project.title, 86, 96);
  c.fillText(String(page.pageNumber).padStart(2, "0"), 1040, 1708);
}

async function drawQuoteEditorial(c: CanvasRenderingContext2D, page: VisualBookPage) {
  const copy = buildVisualPageSections(page.body, page.title);
  const imageH = visualWordCount(copy.body) > 115 ? 410 : visualWordCount(copy.body) > 90 ? 480 : 540;
  await imageCover(c, page.imageData, 80, 150, 1040, imageH, THEME.paperWarm);
  drawImageFrame(c, 80, 150, 1040, imageH);

  c.fillStyle = THEME.wine;
  c.font = "700 112px Georgia";
  c.fillText("“", 94, imageH + 335);

  c.fillStyle = THEME.ink;
  c.font = "700 72px Georgia";
  const afterTitle = wrap(c, page.title, 154, imageH + 320, 880, 82, 4);

  drawAccentLine(c, 156, afterTitle + 26, 260);

  c.fillStyle = "#302d2a";
  const bodyType = visualBodyTypography(copy.body);
  c.font = `${bodyType.fontSize}px Arial`;
  const afterBody = wrap(c, copy.body, 156, afterTitle + 84, 870, bodyType.lineHeight, Math.min(8, bodyType.maxLines));

  drawTakeawayBox(c, 80, Math.min(Math.max(afterBody + 42, 1440), 1490), 1040, 210, copy.highlights);

  drawFooter(c, page);
}

function drawRunningHeader(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  c.fillStyle = THEME.ink;
  c.font = "25px Georgia";
  c.fillText(project.title, 74, 78);

  c.fillStyle = THEME.ink;
  c.font = "24px Georgia";
  c.textAlign = "right";
  c.fillText(`Page ${page.pageNumber}`, W - 76, 78);
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
  c.strokeStyle = "rgba(169,130,74,.55)";
  c.lineWidth = 3;
  c.strokeRect(x, y, w, h);
}

function drawAccentLine(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  c.strokeStyle = THEME.wine;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + w, y);
  c.stroke();

  drawSmallMark(c, x + w + 24, y - 8, THEME.gold);
}

function drawTakeawayBox(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  highlights: string[],
) {
  if (!highlights.length) return;

  c.strokeStyle = "rgba(169,130,74,.78)";
  c.lineWidth = 2.4;
  c.strokeRect(x, y, w, h);

  drawSmallMark(c, x + w / 2 - 10, y - 13, THEME.wine);

  c.fillStyle = THEME.wine;
  c.font = "700 18px Arial";
  c.fillText("KEY TAKEAWAY", x + 42, y + 40);

  c.font = "28px Arial";

  highlights.slice(0, 2).forEach((item, index) => {
    const by = y + 88 + index * 64;
    c.fillStyle = THEME.gold;
    c.beginPath();
    c.arc(x + 52, by - 9, 5, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = "#3a342f";
    wrap(c, item, x + 78, by, w - 125, 35, 2);
  });
}

function drawCompactBox(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  highlights: string[],
) {
  if (!highlights.length) return;

  c.strokeStyle = "rgba(169,130,74,.70)";
  c.lineWidth = 2;
  c.strokeRect(x, y, w, h);

  c.fillStyle = THEME.wine;
  c.font = "700 17px Arial";
  c.fillText("TAKEAWAY", x + 28, y + 35);

  c.font = "25px Arial";

  highlights.slice(0, 2).forEach((item, index) => {
    const by = y + 82 + index * 76;
    c.fillStyle = THEME.gold;
    c.beginPath();
    c.arc(x + 34, by - 9, 5, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = "#3a342f";
    wrap(c, item, x + 58, by, w - 86, 32, 2);
  });
}

function drawFooter(c: CanvasRenderingContext2D, page: VisualBookPage) {
  c.fillStyle = THEME.muted;
  c.font = "700 22px Arial";
  c.textAlign = "right";
  c.fillText(String(page.pageNumber).padStart(2, "0"), W - 78, H - 70);
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
  wash.addColorStop(0, "rgba(255,248,235,.18)");
  wash.addColorStop(0.52, "rgba(169,130,74,.10)");
  wash.addColorStop(1, "rgba(122,20,40,.12)");
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

export function buildVisualPageSections(source: unknown, title = "") {
  const clean = String(source).replace(/\s+/g, " ").trim();
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);

  const fallback = clean || title.trim();
  const highlightCount = sentences.length >= 4 ? 2 : sentences.length >= 2 ? 1 : 0;
  const highlightSource = highlightCount ? sentences.slice(-highlightCount) : fallback ? [fallback] : [];
  const highlights = highlightSource.map((sentence) => excerpt(sentence, 125));
  const noteSource = sentences[0] || fallback;

  return {
    body: fallback,
    highlights,
    note: excerpt(noteSource, 118),
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

function visualWordCount(source: unknown) {
  return String(source).trim().split(/\s+/).filter(Boolean).length;
}

function excerpt(source: string, limit: number) {
  if (source.length <= limit) return source;
  const clipped = source.slice(0, limit - 1).replace(/\s+\S*$/, "").trim();
  return `${clipped || source.slice(0, limit - 1).trim()}…`;
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
