import type { ComicPanel, VisualBookPage, VisualBookProject } from "./visual-book-types";
import { visualProjectFilename } from "./visual-book-utils";

const W = 1200;
const H = 1800;

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

  if (project.mode === "comic") {
    await drawComic(c, project, page);
  } else {
    await drawEditorialVisual(c, project, page);
  }

  return canvas.toDataURL("image/jpeg", 0.94);
}

async function drawEditorialVisual(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  const pageIndex = Math.max(0, page.pageNumber - 1);

  if (page.role === "cover") {
    await drawCover(c, project, page);
    return;
  }

  drawRunningHeader(c, project, page);

  if (page.layout === "full-bleed") {
    await drawCinematicFullBleed(c, project, page);
    return;
  }

  if (page.layout === "image-left") {
    await drawSplitEditorial(c, page, "left");
    return;
  }

  if (page.layout === "image-right") {
    await drawSplitEditorial(c, page, "right");
    return;
  }

  if (page.layout === "quote") {
    await drawQuoteEditorial(c, page);
    return;
  }

  await drawImageTopEditorial(c, page, pageIndex);
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

async function drawImageTopEditorial(c: CanvasRenderingContext2D, page: VisualBookPage, pageIndex: number) {
  const imageH = pageIndex % 3 === 0 ? 760 : 690;

  await imageCover(c, page.imageData, 76, 150, 1048, imageH, THEME.paperWarm);
  drawImageFrame(c, 76, 150, 1048, imageH);

  const titleY = imageH + 250;
  c.fillStyle = THEME.ink;
  c.font = "700 78px Georgia";
  const afterTitle = wrap(c, page.title, 76, titleY, 1010, 84, 3);

  drawAccentLine(c, 78, afterTitle + 28, 320);

  c.fillStyle = "#312d2b";
  c.font = "31px Arial";
  const afterBody = wrap(c, page.body, 78, afterTitle + 92, 1010, 49, 9);

  drawTakeawayBox(c, 78, Math.min(afterBody + 62, 1390), 1044, 250, page.body);
  drawFooter(c, page);
}

async function drawSplitEditorial(c: CanvasRenderingContext2D, page: VisualBookPage, imageSide: "left" | "right") {
  const imageX = imageSide === "left" ? 70 : 660;
  const textX = imageSide === "left" ? 650 : 78;
  const imageW = 470;
  const imageH = 1320;

  await imageCover(c, page.imageData, imageX, 178, imageW, imageH, THEME.paperWarm);
  drawImageFrame(c, imageX, 178, imageW, imageH);

  c.fillStyle = THEME.ink;
  c.font = "700 76px Georgia";
  const afterTitle = wrap(c, page.title, textX, 235, 480, 82, 5);

  drawAccentLine(c, textX, afterTitle + 28, 210);

  c.fillStyle = "#302d2a";
  c.font = "31px Arial";
  const afterBody = wrap(c, page.body, textX, afterTitle + 92, 480, 50, 13);

  const boxY = Math.min(Math.max(afterBody + 56, 1130), 1280);
  drawCompactBox(c, textX, boxY, 480, 260, page.body);

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
  c.font = "30px Arial";
  wrap(c, page.body, 90, afterTitle + 54, 930, 46, 5);

  c.fillStyle = "rgba(255,248,235,.78)";
  c.font = "700 22px Arial";
  c.fillText(project.title, 86, 96);
  c.fillText(String(page.pageNumber).padStart(2, "0"), 1040, 1708);
}

async function drawQuoteEditorial(c: CanvasRenderingContext2D, page: VisualBookPage) {
  await imageCover(c, page.imageData, 80, 150, 1040, 600, THEME.paperWarm);
  drawImageFrame(c, 80, 150, 1040, 600);

  c.fillStyle = THEME.wine;
  c.font = "700 112px Georgia";
  c.fillText("“", 94, 955);

  c.fillStyle = THEME.ink;
  c.font = "700 72px Georgia";
  const afterTitle = wrap(c, page.title, 154, 940, 880, 82, 4);

  drawAccentLine(c, 156, afterTitle + 26, 260);

  c.fillStyle = "#302d2a";
  c.font = "30px Arial";
  wrap(c, page.body, 156, afterTitle + 88, 870, 48, 8);

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

function drawTakeawayBox(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, source: string) {
  c.strokeStyle = "rgba(169,130,74,.78)";
  c.lineWidth = 2.4;
  c.strokeRect(x, y, w, h);

  drawSmallMark(c, x + w / 2 - 10, y - 13, THEME.wine);

  const bullets = extractBullets(source, 3);
  c.font = "28px Arial";

  bullets.forEach((item, index) => {
    const by = y + 66 + index * 58;
    c.fillStyle = THEME.gold;
    c.beginPath();
    c.arc(x + 52, by - 9, 5, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = "#3a342f";
    wrap(c, item, x + 78, by, w - 125, 35, 2);
  });
}

function drawCompactBox(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, source: string) {
  c.strokeStyle = "rgba(169,130,74,.70)";
  c.lineWidth = 2;
  c.strokeRect(x, y, w, h);

  const bullets = extractBullets(source, 3);
  c.font = "25px Arial";

  bullets.forEach((item, index) => {
    const by = y + 58 + index * 62;
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
  c.fillStyle = fallback;
  c.fillRect(x, y, w, h);

  if (!data) {
    c.fillStyle = "rgba(255,255,255,.42)";
    c.font = "700 24px Arial";
    c.textAlign = "center";
    c.fillText("IMAGE PENDING", x + w / 2, y + h / 2);
    c.textAlign = "left";
    return;
  }

  const im = await loadImage(data);
  const scale = Math.max(w / im.width, h / im.height);
  const sw = w / scale;
  const sh = h / scale;

  c.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
}

function wrap(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  max: number,
  lh: number,
  limit: number,
) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;

    if (c.measureText(test).width > max && line) {
      lines.push(line);
      line = word;
      if (lines.length === limit) break;
    } else {
      line = test;
    }
  }

  if (line && lines.length < limit) lines.push(line);

  lines.forEach((s, i) => c.fillText(s, x, y + i * lh));
  return y + lines.length * lh;
}

function extractBullets(source: string, count: number) {
  const clean = String(source).replace(/\s+/g, " ").trim();
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/^[-•]\s*/, "").trim())
    .filter((s) => s.length > 18);

  const picked = sentences.slice(0, count);

  while (picked.length < count) {
    picked.push(
      [
        "A sharper promise inside the page.",
        "A visual moment with emotional weight.",
        "A clean takeaway for the reader.",
      ][picked.length],
    );
  }

  return picked.map((s) => (s.length > 92 ? `${s.slice(0, 89).trim()}...` : s));
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
