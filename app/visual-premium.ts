import type { VisualBookPage, VisualBookProject } from "./visual-book-types";
import { parseIngredients, type IngredientGroup } from "./visual-book-utils";
import {
  beginVisualTextAudit,
  buildVisualPageSections,
  cancelVisualTextAudit,
  drawSafeTextLine,
  drawVerbatimVisualLine,
  finishVisualTextAudit,
  fitCompleteSentenceOnly,
  fitTextWithoutEllipsis,
  resolveEditorialLayout,
  splitIntoCompleteSentences,
  validateVisualTextBeforeDraw,
  type TextFitOptions,
} from "./visual-book-exporters";

/**
 * Premium page design for the editorial visual styles: ivory paper (or black and
 * gold for Dark Luxury), Cormorant Garamond with letter-spaced Montserrat labels,
 * full-bleed art, drop caps, justified text, pull quotes, and real book pages
 * (title page, contents, colophon, back cover) around the storyboard.
 */

export const PREMIUM_W = 1200;
export const PREMIUM_H = 1800;
const W = PREMIUM_W;
const H = PREMIUM_H;
const SERIF = "'Cormorant Garamond'";
const SANS = "Montserrat";

type Theme = {
  paper: string; ink: string; body: string; muted: string; accent: string;
  hairline: string; placeholder: string; dark: boolean;
};

const IVORY: Theme = {
  paper: "#f4efe6", ink: "#1d1a16", body: "#2b2621", muted: "#7a6f62", accent: "#a8865a",
  hairline: "rgba(29,26,22,.18)", placeholder: "#e4dccf", dark: false,
};
const NOIR: Theme = {
  paper: "#0f0e0c", ink: "#f3ead9", body: "#e3d8c4", muted: "#9c8f7a", accent: "#d4a843",
  hairline: "rgba(243,234,217,.18)", placeholder: "#1c1a16", dark: true,
};

const PREMIUM_STYLES = new Set(["cinematic-editorial", "warm-storybook", "dark-luxury", "clean-modern", "bold-color", "ink-noir"]);

export const PREMIUM_CANVAS_FONTS = [
  `500 40px ${SERIF}`, `600 40px ${SERIF}`, `italic 500 40px ${SERIF}`, `500 16px ${SANS}`,
];

export function isPremiumProject(project: Pick<VisualBookProject, "visualStyle">) {
  return PREMIUM_STYLES.has(String(project.visualStyle ?? ""));
}

/* ---------- book sequence ---------- */

export type PremiumSheet =
  | { kind: "cover"; page: VisualBookPage; folio: number }
  | { kind: "title"; folio: number }
  | { kind: "contents"; folio: number }
  | { kind: "page"; page: VisualBookPage; folio: number; chapter: number }
  | { kind: "colophon"; folio: number }
  | { kind: "back"; folio: number };

/** Every sheet of the finished book, in order, with the page number printed on it. */
export function premiumSequence(project: VisualBookProject): PremiumSheet[] {
  const pages = project.pages;
  const cover = pages.find(page => page.role === "cover") ?? pages[0];
  const story = pages.filter(page => page !== cover);
  const sheets: PremiumSheet[] = [];
  if (cover) sheets.push({ kind: "cover", page: cover, folio: 0 });
  sheets.push({ kind: "title", folio: 0 });
  if (pages.length >= 7) sheets.push({ kind: "contents", folio: 0 });
  story.forEach((page, index) => sheets.push({ kind: "page", page, folio: 0, chapter: index + 1 }));
  sheets.push({ kind: "colophon", folio: 0 });
  sheets.push({ kind: "back", folio: 0 });
  return sheets.map((sheet, index) => ({ ...sheet, folio: index + 1 }));
}

export function premiumSheetForPage(project: VisualBookProject, page: VisualBookPage): PremiumSheet {
  const found = premiumSequence(project).find(sheet => "page" in sheet && sheet.page.id === page.id);
  return found ?? (page.role === "cover" ? { kind: "cover", page, folio: 1 } : { kind: "page", page, folio: page.pageNumber, chapter: Math.max(1, page.pageNumber - 1) });
}

export function premiumSheetFilename(sheet: PremiumSheet) {
  const number = String(sheet.folio).padStart(2, "0");
  return sheet.kind === "page" || sheet.kind === "cover" ? `page-${number}.jpg` : `page-${number}-${sheet.kind}.jpg`;
}

/* ---------- rendering ---------- */

/** One recorded line of text, used to place real, selectable text in the PDF. */
export type PremiumTextRun = {
  text: string; x: number; y: number; font: string; color: string; letterSpacing: number;
};

export async function loadPremiumFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(PREMIUM_CANVAS_FONTS.map(font => document.fonts.load(font).catch(() => [])));
}

/**
 * Draws one sheet. With `capture`, solid-color text is recorded instead of
 * painted so the PDF can set it as real text over the artwork.
 */
export async function renderPremiumSheet(
  project: VisualBookProject,
  sheet: PremiumSheet,
  options: { capture?: PremiumTextRun[]; quality?: number } = {},
) {
  await loadPremiumFonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("This browser could not render the visual page.");
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  const theme = project.visualStyle === "dark-luxury" ? NOIR : IVORY;
  drawPaper(c, theme);

  if (options.capture) installTextCapture(c, options.capture);
  beginVisualTextAudit(c);
  try {
    await drawSheet(c, theme, project, sheet);
    finishVisualTextAudit(c);
  } catch (error) {
    cancelVisualTextAudit(c);
    throw error;
  }
  return canvas.toDataURL("image/jpeg", options.quality ?? 0.94);
}

function installTextCapture(c: CanvasRenderingContext2D, runs: PremiumTextRun[]) {
  const paint = c.fillText.bind(c);
  c.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    // Gradient text (the gold foil title) stays painted into the artwork.
    if (typeof c.fillStyle !== "string") {
      if (typeof maxWidth === "number") paint(text, x, y, maxWidth);
      else paint(text, x, y);
      return;
    }
    const spacing = parseFloat(String((c as LetterSpacedContext).letterSpacing ?? "0")) || 0;
    const width = c.measureText(text).width;
    const left = c.textAlign === "center" ? x - width / 2 : c.textAlign === "right" || c.textAlign === "end" ? x - width : x;
    runs.push({ text, x: left, y, font: c.font, color: c.fillStyle, letterSpacing: spacing });
  };
}

type LetterSpacedContext = CanvasRenderingContext2D & { letterSpacing?: string };

async function drawSheet(c: CanvasRenderingContext2D, t: Theme, project: VisualBookProject, sheet: PremiumSheet) {
  if (sheet.kind === "cover") return drawCover(c, t, project, sheet.page);
  if (sheet.kind === "title") return drawTitlePage(c, t, project);
  if (sheet.kind === "contents") return drawContents(c, t, project);
  if (sheet.kind === "colophon") return drawColophon(c, t, project);
  if (sheet.kind === "back") return drawBackCover(c, project);
  const page = sheet.page;
  const ctx: SheetContext = { folio: sheet.folio, chapter: sheet.chapter, reserve: 0 };
  if (page.role === "cta") {
    if (!page.closingLayout) return drawClosing(c, t, project, page, ctx);
    // A chosen layout on the last page keeps room at the foot for the closing signature.
    const closing: SheetContext = { ...ctx, reserve: SIGNATURE_RESERVE };
    const asContent = { ...page, layout: page.closingLayout };
    await drawStoryLayout(c, t, project, asContent, closing);
    const fadeBottom = page.closingLayout === "fade-bottom";
    drawSignature(c, t, project, fadeBottom ? H - FADE_BOTTOM_BAND_H - 20 : H - 162, page.closingLayout === "full-bleed" || (t.dark && !fadeBottom));
    return;
  }
  const ingredients = page.ingredientsPage ? parseIngredients(project.ingredients) : [];
  if (ingredients.length) return drawIngredientsPage(c, t, page, ingredients, ctx);
  return drawStoryLayout(c, t, project, page, ctx);
}

async function drawStoryLayout(c: CanvasRenderingContext2D, t: Theme, project: VisualBookProject, page: VisualBookPage, ctx: SheetContext) {
  if (page.layout === "fade-top" || page.layout === "fade-bottom") return drawFade(c, t, page, page.layout === "fade-top" ? "top" : "bottom", ctx);
  const layout = resolveEditorialLayout(page);
  if (layout === "full-bleed") return drawFullBleed(c, page, ctx);
  if (layout === "image-left") return drawSplit(c, t, page, "left", ctx);
  if (layout === "image-right") return drawSplit(c, t, page, "right", ctx);
  if (layout === "quote") return drawQuote(c, t, page, ctx);
  return drawImageTop(c, t, page, ctx);
}

type SheetContext = { folio: number; chapter: number; reserve: number };

/** Space kept at the foot of a last page for the author's name and imprint. */
const SIGNATURE_RESERVE = 150;
const FADE_BOTTOM_BAND_H = 880;

/** Author name with the imprint (for example ROBANO | STUDIO) set beneath it. */
function drawSignature(c: CanvasRenderingContext2D, t: Theme, project: VisualBookProject, y: number, onDark: boolean) {
  c.textAlign = "center";
  c.fillStyle = onDark ? "#d4a843" : t.accent;
  label(c, project.author.toUpperCase(), W / 2, y, 15, 7);
  const imprint = (project.imprint ?? "").trim();
  if (imprint) {
    c.fillStyle = onDark ? "#cfc4b0" : t.muted;
    label(c, imprint.toUpperCase(), W / 2, y + 30, 13, 6);
  }
  c.textAlign = "left";
}

/* ---------- cover and book pages ---------- */

async function drawCover(c: CanvasRenderingContext2D, t: Theme, project: VisualBookProject, page: VisualBookPage) {
  await imageCover(c, page.imageData, 0, 0, W, H, "#1a1814");
  const shade = c.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(10,9,8,.55)");
  shade.addColorStop(0.22, "rgba(10,9,8,.05)");
  shade.addColorStop(0.5, "rgba(10,9,8,.10)");
  shade.addColorStop(1, "rgba(10,9,8,.90)");
  c.fillStyle = shade;
  c.fillRect(0, 0, W, H);

  c.strokeStyle = "rgba(212,168,67,.55)";
  c.lineWidth = 1.5;
  c.strokeRect(40, 40, W - 80, H - 80);

  c.textAlign = "center";
  c.fillStyle = "#efe6d4";
  label(c, project.author.toUpperCase(), W / 2, 132, 17, 7);

  const subtitle = fitCompleteSentenceOnly(project.subtitle, "");
  const titleY = subtitle ? H - 560 : H - 440;
  c.fillStyle = t.dark ? goldFoil(c, titleY - 120, titleY + 260) : "#f6eedd";
  const title = text(c, project.title || page.title, {
    x: W / 2, y: titleY, maxWidth: 940, maxLines: 3,
    fontSize: 132, minFontSize: 72, lineHeight: 128,
    fontFamily: SERIF, fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  ornamentRule(c, W / 2, title.endY + 10, "#d4a843");
  if (subtitle) {
    c.fillStyle = "#e8dfcd";
    text(c, subtitle, {
      x: W / 2, y: title.endY + 92, maxWidth: 820, maxLines: 3,
      fontSize: 38, minFontSize: 28, lineHeight: 50,
      fontFamily: SERIF, fontStyle: "italic", fontWeight: "500", preserveAll: true,
    });
  }
  c.fillStyle = "#d4a843";
  label(c, "A VISUAL EDITION", W / 2, H - 112, 14, 8);
  c.textAlign = "left";
}

function goldFoil(c: CanvasRenderingContext2D, top: number, bottom: number) {
  const foil = c.createLinearGradient(W * 0.18, top, W * 0.82, bottom);
  foil.addColorStop(0, "#9c7a2e");
  foil.addColorStop(0.28, "#f1d58a");
  foil.addColorStop(0.46, "#c99a3a");
  foil.addColorStop(0.62, "#fbe7a8");
  foil.addColorStop(0.82, "#b8892f");
  foil.addColorStop(1, "#e2bf6b");
  return foil;
}

function drawTitlePage(c: CanvasRenderingContext2D, t: Theme, project: VisualBookProject) {
  c.textAlign = "center";
  c.fillStyle = t.ink;
  const title = text(c, project.title, {
    x: W / 2, y: 700, maxWidth: 900, maxLines: 3,
    fontSize: 104, minFontSize: 60, lineHeight: 108,
    fontFamily: SERIF, fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  ornamentRule(c, W / 2, title.endY + 4, t.accent);
  const subtitle = fitCompleteSentenceOnly(project.subtitle, "");
  if (subtitle) {
    c.fillStyle = t.muted;
    text(c, subtitle, {
      x: W / 2, y: title.endY + 86, maxWidth: 760, maxLines: 3,
      fontSize: 36, minFontSize: 27, lineHeight: 48,
      fontFamily: SERIF, fontStyle: "italic", fontWeight: "500", preserveAll: true,
    });
  }
  c.fillStyle = t.accent;
  label(c, project.author.toUpperCase(), W / 2, H - 260, 17, 8);
  c.textAlign = "left";
}

function drawContents(c: CanvasRenderingContext2D, t: Theme, project: VisualBookProject) {
  const entries = premiumSequence(project).filter((sheet): sheet is Extract<PremiumSheet, { kind: "page" }> => sheet.kind === "page");
  const rowH = Math.min(118, Math.floor(1180 / Math.max(1, entries.length)));
  const titleSize = Math.max(28, Math.min(42, Math.round(rowH * 0.38)));
  c.textAlign = "center";
  c.fillStyle = t.accent;
  const listTop = Math.max(470, Math.round((H - entries.length * rowH) / 2 + 40));
  label(c, "CONTENTS", W / 2, listTop - 170, 17, 10);
  ornamentRule(c, W / 2, listTop - 118, t.accent);
  c.textAlign = "left";

  let y = listTop;
  for (const entry of entries) {
    c.fillStyle = t.accent;
    label(c, roman(entry.chapter), 170, y, 18, 4);
    c.fillStyle = t.ink;
    const fit = text(c, entry.page.title, {
      x: 260, y, maxWidth: 680, maxLines: 1,
      fontSize: titleSize, minFontSize: 22, lineHeight: titleSize * 1.2,
      fontFamily: SERIF, fontWeight: "500", preserveAll: true, textRole: "headline",
    });
    c.font = `500 ${fit.fontSize}px ${SERIF}`;
    const titleEnd = 260 + (fit.lines[0] ? c.measureText(fit.lines[0]).width : 0);
    c.fillStyle = t.muted;
    c.textAlign = "right";
    label(c, String(entry.folio).padStart(2, "0"), W - 170, y, 15, 3);
    c.textAlign = "left";
    dottedLeader(c, titleEnd + 18, W - 230, y - 6, t.hairline);
    y += rowH;
  }
}

function drawColophon(c: CanvasRenderingContext2D, t: Theme, project: VisualBookProject) {
  const year = new Date(project.createdAt || Date.now()).getFullYear() || new Date().getFullYear();
  c.textAlign = "center";
  c.fillStyle = t.ink;
  text(c, project.title, {
    x: W / 2, y: 1180, maxWidth: 800, maxLines: 2,
    fontSize: 40, minFontSize: 28, lineHeight: 48,
    fontFamily: SERIF, fontStyle: "italic", fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  ornamentRule(c, W / 2, 1240, t.accent);
  c.fillStyle = t.muted;
  const lines = [
    `Copyright © ${year} ${project.author}. All rights reserved.`,
    "No part of this book may be reproduced without written permission from the author.",
    ...((project.imprint ?? "").trim() ? [`Published by ${(project.imprint ?? "").trim()}.`] : []),
    "Set in Cormorant Garamond and Montserrat.",
    "Designed with EB Studio Pro.",
  ];
  let y = 1320;
  for (const line of lines) {
    const fit = text(c, line, {
      x: W / 2, y, maxWidth: 820, maxLines: 2,
      fontSize: 25, minFontSize: 19, lineHeight: 36,
      fontFamily: SERIF, fontWeight: "500",
    });
    y = Math.max(fit.endY, y + 36) + 14;
  }
  c.textAlign = "left";
}

async function drawBackCover(c: CanvasRenderingContext2D, project: VisualBookProject) {
  const cover = project.pages.find(page => page.role === "cover") ?? project.pages[0];
  c.fillStyle = "#14120f";
  c.fillRect(0, 0, W, H);
  if (cover?.imageData) {
    c.save();
    c.filter = "blur(28px) saturate(.8)";
    await imageCover(c, cover.imageData, -60, -60, W + 120, H + 120, "#14120f");
    c.restore();
  }
  c.fillStyle = "rgba(10,9,8,.72)";
  c.fillRect(0, 0, W, H);
  c.strokeStyle = "rgba(212,168,67,.55)";
  c.lineWidth = 1.5;
  c.strokeRect(40, 40, W - 80, H - 80);

  c.textAlign = "center";
  c.fillStyle = "#d4a843";
  label(c, project.title.toUpperCase(), W / 2, 420, 16, 8);
  ornamentRule(c, W / 2, 470, "#d4a843");
  const hook = fitCompleteSentenceOnly(cover?.body ?? "", project.subtitle, 260);
  if (hook) {
    c.fillStyle = "#f3ead9";
    text(c, hook, {
      x: W / 2, y: 640, maxWidth: 820, maxLines: 6,
      fontSize: 56, minFontSize: 36, lineHeight: 72,
      fontFamily: SERIF, fontStyle: "italic", fontWeight: "500", preserveAll: true,
    });
  }
  c.fillStyle = "#d4a843";
  label(c, project.author.toUpperCase(), W / 2, H - 220, 16, 8);
  const imprint = (project.imprint ?? "").trim();
  if (imprint) {
    c.fillStyle = "#cfc4b0";
    label(c, imprint.toUpperCase(), W / 2, H - 188, 13, 6);
  }
  c.fillStyle = "#9c8f7a";
  label(c, "A VISUAL EDITION", W / 2, H - 140, 13, 7);
  c.textAlign = "left";
}

/* ---------- story pages ---------- */

/** Art is drawn 2:3, so every plate is 2:3 and shows the whole picture uncropped. */
const PLATE_RATIO = 1.5;

async function drawImageTop(c: CanvasRenderingContext2D, t: Theme, page: VisualBookPage, ctx: SheetContext) {
  const copy = buildVisualPageSections(page.body, page.title);
  const words = wordCount(copy.body);
  const plateH = words > 140 ? 560 : words > 110 ? 610 : 660;
  const plateW = Math.round(plateH / PLATE_RATIO);
  await framedImage(c, t, page.imageData, (W - plateW) / 2, 140, plateW, plateH);

  const below = 140 + plateH + 18;
  c.textAlign = "center";
  c.fillStyle = t.accent;
  label(c, chapterLabel(ctx.chapter), W / 2, below + 86, 15, 7);
  c.fillStyle = t.ink;
  const title = text(c, page.title, {
    x: W / 2, y: below + 166, maxWidth: 900, maxLines: 2,
    fontSize: 66, minFontSize: 44, lineHeight: 72,
    fontFamily: SERIF, fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  ornamentRule(c, W / 2, title.endY - 14, t.accent);
  c.textAlign = "left";

  bodyWithQuote(c, t, page, copy.body, { x: 150, y: title.endY + 62, maxWidth: 900, bottom: H - 150 - ctx.reserve, dropCap: true });
  centerFolio(c, t, ctx.folio, W / 2);
}

async function drawSplit(c: CanvasRenderingContext2D, t: Theme, page: VisualBookPage, side: "left" | "right", ctx: SheetContext) {
  const copy = buildVisualPageSections(page.body, page.title);
  const plateW = 480;
  const plateH = Math.round(plateW * PLATE_RATIO);
  const plateY = 150;
  const plateX = side === "left" ? 108 : W - 108 - plateW;
  await framedImage(c, t, page.imageData, plateX, plateY, plateW, plateH);

  // Title and opening lines sit beside the plate; the copy then runs full width beneath it.
  const colX = side === "left" ? plateX + plateW + 76 : 108;
  const colW = W - 108 - plateW - 76 - 108;
  const fullX = 108;
  const fullW = W - 216;
  c.fillStyle = t.accent;
  label(c, chapterLabel(ctx.chapter), colX, plateY + 40, 15, 7);
  c.fillStyle = t.ink;
  const title = text(c, page.title, {
    x: colX, y: plateY + 128, maxWidth: colW, maxLines: 4,
    fontSize: 60, minFontSize: 40, lineHeight: 66,
    fontFamily: SERIF, fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  c.fillStyle = t.accent;
  c.fillRect(colX, title.endY + 4, 64, 2);

  bodyWithQuote(c, t, page, copy.body, {
    x: fullX, y: title.endY + 76, maxWidth: fullW, bottom: H - 150 - ctx.reserve, dropCap: true,
    wrap: { x: colX, width: colW, until: plateY + plateH + 66 },
  });
  centerFolio(c, t, ctx.folio, W / 2);
}

async function drawFullBleed(c: CanvasRenderingContext2D, page: VisualBookPage, ctx: SheetContext) {
  const copy = buildVisualPageSections(page.body, page.title);
  await imageCover(c, page.imageData, 0, 0, W, H, "#1a1814");
  // Darkens from the upper third so the title and copy stay readable on bright art.
  const shade = c.createLinearGradient(0, H * 0.22, 0, H);
  shade.addColorStop(0, "rgba(10,9,8,0)");
  shade.addColorStop(0.3, "rgba(10,9,8,.62)");
  shade.addColorStop(0.55, "rgba(10,9,8,.84)");
  shade.addColorStop(1, "rgba(10,9,8,.96)");
  c.fillStyle = shade;
  c.fillRect(0, 0, W, H);

  const onImage: Theme = { ...NOIR, body: "#ece3d1" };
  c.textAlign = "center";
  c.fillStyle = "#d4a843";
  label(c, chapterLabel(ctx.chapter), W / 2, 960, 15, 7);
  c.fillStyle = "#f6eedd";
  const title = text(c, page.title, {
    x: W / 2, y: 1042, maxWidth: 920, maxLines: 2,
    fontSize: 70, minFontSize: 46, lineHeight: 76,
    fontFamily: SERIF, fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  ornamentRule(c, W / 2, title.endY - 14, "#d4a843");
  c.textAlign = "left";
  bodyWithQuote(c, onImage, page, copy.body, { x: 170, y: title.endY + 64, maxWidth: 860, bottom: H - 150 - ctx.reserve, dropCap: true, noQuote: true });
  c.textAlign = "center";
  // No running title on top: it would sit on the brightest part of the art.
  c.fillStyle = "#cfc4b0";
  label(c, String(ctx.folio).padStart(2, "0"), W / 2, H - 82, 15, 4);
  c.textAlign = "left";
}

async function drawQuote(c: CanvasRenderingContext2D, t: Theme, page: VisualBookPage, ctx: SheetContext) {
  const copy = buildVisualPageSections(page.body, page.title);
  const plateH = wordCount(copy.body) > 120 ? 560 : 620;
  const plateW = Math.round(plateH / PLATE_RATIO);
  await framedImage(c, t, page.imageData, (W - plateW) / 2, 140, plateW, plateH);
  c.textAlign = "center";
  c.fillStyle = t.ink;
  const title = text(c, page.title, {
    x: W / 2, y: 140 + plateH + 130, maxWidth: 860, maxLines: 3,
    fontSize: 62, minFontSize: 42, lineHeight: 70,
    fontFamily: SERIF, fontStyle: "italic", fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  ornamentRule(c, W / 2, title.endY - 6, t.accent);
  c.textAlign = "left";
  bodyWithQuote(c, t, page, copy.body, { x: 150, y: title.endY + 70, maxWidth: 900, bottom: H - 150 - ctx.reserve, dropCap: true });
  centerFolio(c, t, ctx.folio, W / 2);
}

async function drawClosing(c: CanvasRenderingContext2D, t: Theme, project: VisualBookProject, page: VisualBookPage, ctx: SheetContext) {
  const copy = buildVisualPageSections(page.body, page.title);
  const plateH = 640;
  const plateW = Math.round(plateH / PLATE_RATIO);
  await framedImage(c, t, page.imageData, (W - plateW) / 2, 150, plateW, plateH);
  c.textAlign = "center";
  c.fillStyle = t.ink;
  const title = text(c, page.title, {
    x: W / 2, y: 150 + plateH + 140, maxWidth: 860, maxLines: 2,
    fontSize: 64, minFontSize: 44, lineHeight: 72,
    fontFamily: SERIF, fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  ornamentRule(c, W / 2, title.endY - 12, t.accent);
  c.textAlign = "left";
  bodyWithQuote(c, t, page, copy.body, { x: W / 2, y: title.endY + 70, maxWidth: 820, bottom: H - 270, align: "center", noQuote: true });
  drawSignature(c, t, project, H - 162, false);
  c.textAlign = "center";
  c.fillStyle = t.muted;
  label(c, String(ctx.folio).padStart(2, "0"), W / 2, H - 76, 15, 4);
  c.textAlign = "left";
}

/* ---------- fade layouts ---------- */

/** Height of the picture band on fade pages; its last 45 percent blends into the paper. */
const FADE_ART_H = 1000;

/**
 * Wide art runs edge to edge across one half of the page and dissolves into the
 * paper (ivory, or black on Dark Luxury). The copy sits on clear paper beyond it.
 */
async function drawFade(c: CanvasRenderingContext2D, t: Theme, page: VisualBookPage, side: "top" | "bottom", ctx: SheetContext) {
  const copy = buildVisualPageSections(page.body, page.title);
  // At the bottom the band is shorter, so the copy above it keeps clear paper.
  const bandH = side === "top" ? FADE_ART_H : FADE_BOTTOM_BAND_H;
  const artY = side === "top" ? 0 : H - bandH;
  if (page.imageData) {
    const band = document.createElement("canvas");
    band.width = W;
    band.height = bandH;
    const b = band.getContext("2d");
    if (b) {
      b.imageSmoothingEnabled = true;
      b.imageSmoothingQuality = "high";
      await imageCover(b, page.imageData, 0, 0, W, bandH, t.paper, side === "top" ? 0.35 : 0.65);
      // Keep the picture solid near the page edge, then let it dissolve toward the copy.
      b.globalCompositeOperation = "destination-in";
      const mask = side === "top" ? b.createLinearGradient(0, 0, 0, bandH) : b.createLinearGradient(0, bandH, 0, 0);
      mask.addColorStop(0, "rgba(0,0,0,1)");
      mask.addColorStop(0.55, "rgba(0,0,0,1)");
      mask.addColorStop(0.8, "rgba(0,0,0,.45)");
      mask.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = mask;
      b.fillRect(0, 0, W, bandH);
      c.drawImage(band, 0, artY);
    }
  }

  // The copy only ever sits on clear paper, never on the visible picture.
  const textTop = side === "top" ? FADE_ART_H - 40 : 170;
  const textBottom = side === "top" ? H - 150 - ctx.reserve : artY + 40 - ctx.reserve;
  c.textAlign = "center";
  c.fillStyle = t.accent;
  label(c, chapterLabel(ctx.chapter), W / 2, textTop, 15, 7);
  c.fillStyle = t.ink;
  const title = text(c, page.title, {
    x: W / 2, y: textTop + 82, maxWidth: 900, maxLines: 2,
    fontSize: 64, minFontSize: 44, lineHeight: 70,
    fontFamily: SERIF, fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  ornamentRule(c, W / 2, title.endY - 12, t.accent);
  c.textAlign = "left";
  bodyWithQuote(c, t, page, copy.body, { x: 150, y: title.endY + 60, maxWidth: 900, bottom: textBottom, dropCap: true, noQuote: side === "bottom" });
  c.textAlign = "center";
  c.fillStyle = t.muted;
  label(c, String(ctx.folio).padStart(2, "0"), W / 2, side === "top" ? H - 82 : 92, 15, 4);
  c.textAlign = "left";
}

/* ---------- recipe ingredients ---------- */

async function drawIngredientsPage(c: CanvasRenderingContext2D, t: Theme, page: VisualBookPage, groups: IngredientGroup[], ctx: SheetContext) {
  const plateH = 380;
  const plateW = Math.round(plateH / 1.5);
  let y = 130;
  // The art is shown only when the list is short enough to keep one roomy column.
  const rowCount = groups.reduce((sum, group) => sum + group.rows.length + (group.group ? 1 : 0), 0);
  if (page.imageData && rowCount <= 10) {
    await framedImage(c, t, page.imageData, (W - plateW) / 2, y, plateW, plateH);
    y += plateH + 18;
  }
  c.textAlign = "center";
  c.fillStyle = t.accent;
  label(c, "WHAT YOU NEED", W / 2, y + 80, 15, 8);
  c.fillStyle = t.ink;
  const title = text(c, page.title, {
    x: W / 2, y: y + 156, maxWidth: 900, maxLines: 2,
    fontSize: 60, minFontSize: 42, lineHeight: 66,
    fontFamily: SERIF, fontWeight: "500", preserveAll: true, textRole: "headline",
  });
  ornamentRule(c, W / 2, title.endY - 10, t.accent);
  const intro = validateVisualTextBeforeDraw(page.body, "paragraph");
  let top = title.endY + 50;
  if (intro) {
    c.fillStyle = t.muted;
    const fit = text(c, intro, {
      x: W / 2, y: top + 20, maxWidth: 820, maxLines: 3,
      fontSize: 30, minFontSize: 24, lineHeight: 42,
      fontFamily: SERIF, fontStyle: "italic", fontWeight: "500",
    });
    top = Math.max(top, fit.endY) + 20;
  }
  c.textAlign = "left";
  drawIngredientList(c, groups, {
    x: 150, y: top + 40, width: W - 300, bottom: H - 140,
    ink: t.ink, muted: t.muted, accent: t.accent, leader: t.hairline,
    itemFont: SERIF, itemWeight: "500", labelFont: SANS,
  });
  centerFolio(c, t, ctx.folio, W / 2);
}

export type IngredientListStyle = {
  x: number; y: number; width: number; bottom: number;
  ink: string; muted: string; accent: string; leader: string;
  itemFont: string; itemWeight: string; labelFont: string;
};

/**
 * Sets the list: group names in small caps, each item on the left, its quantity on the
 * right, a dotted leader between. Two columns when one would run past the bottom.
 */
export function drawIngredientList(c: CanvasRenderingContext2D, groups: IngredientGroup[], style: IngredientListStyle) {
  // Each group heading takes a row plus a little air above it.
  const rows = groups.reduce((sum, group, index) => sum + group.rows.length + (group.group ? (index ? 1.5 : 1) : 0), 0);
  const available = style.bottom - style.y;
  const columns = rows * 46 > available ? 2 : 1;
  const gap = 70;
  const colW = columns === 2 ? (style.width - gap) / 2 : style.width;
  const perColumn = Math.ceil(rows / columns);
  const rowH = Math.max(34, Math.min(56, Math.floor(available / Math.max(1, perColumn))));
  const size = Math.max(20, Math.min(32, Math.round(rowH * 0.6)));
  let column = 0;
  let line = 0;
  const place = () => ({ x: style.x + column * (colW + gap), y: style.y + line * rowH });
  const next = () => {
    line += 1;
    if (columns === 2 && column === 0 && line >= perColumn) { column = 1; line = 0; }
  };
  for (const group of groups) {
    if (group.group) {
      if (line > 0 && line >= perColumn - 1 && column === 0 && columns === 2) { column = 1; line = 0; }
      if (line > 0) line += 0.5;
      const at = place();
      c.fillStyle = style.accent;
      label(c, group.group.toUpperCase(), at.x, at.y + size * 0.95, 14, 5);
      next();
    }
    for (const row of group.rows) {
      const at = place();
      c.font = `${style.itemWeight} ${size}px ${style.itemFont}`;
      c.fillStyle = style.ink;
      const quantityW = row.quantity ? Math.min(colW * 0.42, measure(c, row.quantity, `italic ${style.itemWeight} ${size}px ${style.itemFont}`) ) : 0;
      const itemOptions = {
        x: at.x, y: at.y + size, maxWidth: colW - quantityW - 40, maxLines: 1,
        fontSize: size, minFontSize: Math.round(size * 0.88), lineHeight: rowH,
        fontFamily: style.itemFont, fontWeight: style.itemWeight, preserveAll: true, textRole: "headline" as const,
      };
      // Items start with a capital letter on the page, whatever case the list was typed in.
      const item = row.item.charAt(0).toUpperCase() + row.item.slice(1);
      let itemFit = text(c, item, itemOptions);
      // A long name wraps onto a second row instead of disappearing.
      if (!itemFit.lines.length) {
        itemFit = text(c, item, { ...itemOptions, maxLines: 2 });
        if (itemFit.lines.length > 1) line += 1;
      }
      c.font = `${style.itemWeight} ${itemFit.fontSize}px ${style.itemFont}`;
      const lastLine = itemFit.lines.at(-1) ?? "";
      const itemEnd = at.x + c.measureText(lastLine).width;
      const quantityY = at.y + size + (itemFit.lines.length - 1) * itemFit.lineHeight;
      if (row.quantity) {
        c.fillStyle = style.muted;
        c.textAlign = "right";
        text(c, row.quantity, {
          x: at.x + colW, y: quantityY, maxWidth: colW * 0.42, maxLines: 1,
          fontSize: size, minFontSize: 16, lineHeight: size * 1.2,
          fontFamily: style.itemFont, fontStyle: "italic", fontWeight: style.itemWeight, preserveAll: true, textRole: "headline",
        });
        c.textAlign = "left";
        dottedLeader(c, itemEnd + 14, at.x + colW - quantityW - 14, quantityY - 6, style.leader);
      }
      next();
    }
  }
}

function measure(c: CanvasRenderingContext2D, value: string, font: string) {
  const before = c.font;
  c.font = font;
  const width = c.measureText(value).width;
  c.font = before;
  return width;
}

/* ---------- body text ---------- */

type BodyBox = {
  x: number; y: number; maxWidth: number; bottom: number;
  dropCap?: boolean; align?: "center"; noQuote?: boolean;
  /** A narrower column used beside an image plate, for lines that start above `until`. */
  wrap?: { x: number; width: number; until: number };
};

type BodyLine = { words: string[]; x: number; width: number };

type BodyPlan = {
  size: number; lineHeight: number; lines: BodyLine[]; dropCap: string; dropCapSize: number; dropCapX: number; endY: number;
};

/** Sets the page copy, and the page's pull quote underneath when there is room for it. */
function bodyWithQuote(c: CanvasRenderingContext2D, t: Theme, page: VisualBookPage, source: string, box: BodyBox) {
  const body = validateVisualTextBeforeDraw(source, "paragraph");
  if (!body) return;
  const quote = box.noQuote ? "" : pullQuoteFor(page, body);
  const quoteLines = quote ? countLines(c, quote, `italic 500 42px ${SERIF}`, Math.min(760, box.maxWidth)) : 0;
  const quoteH = quote && quoteLines <= 3 ? 70 + quoteLines * 54 + 40 : 0;

  // Prefer the copy plus a pull quote at a comfortable size; otherwise give the copy all the room.
  const withQuote = quoteH ? planBody(c, body, { ...box, bottom: box.bottom - quoteH }, 30) : null;
  const plan = withQuote ?? planBody(c, body, box, 24) ?? planBody(c, trimToFit(c, body, box), box, 24);
  if (!plan) return;
  drawBody(c, t, plan, box);

  if (withQuote && quote) {
    const cx = box.align === "center" ? box.x : box.x + box.maxWidth / 2;
    const top = plan.endY + 30;
    c.strokeStyle = t.accent;
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx - 60, top); c.lineTo(cx + 60, top); c.stroke();
    c.textAlign = "center";
    c.fillStyle = t.accent;
    const fit = text(c, quote, {
      x: cx, y: top + 66, maxWidth: Math.min(760, box.maxWidth), maxLines: 3,
      fontSize: 42, minFontSize: 32, lineHeight: 54,
      fontFamily: SERIF, fontStyle: "italic", fontWeight: "500", textRole: "sentence",
    });
    c.beginPath(); c.moveTo(cx - 60, fit.endY + 4); c.lineTo(cx + 60, fit.endY + 4); c.stroke();
    c.textAlign = "left";
  }
}

/** Uses the AI's pull quote when it is a whole sentence from the page, otherwise picks one. */
export function pullQuoteFor(page: Pick<VisualBookPage, "pullQuote">, body: string) {
  const sentences = splitIntoCompleteSentences(body);
  const chosen = validateVisualTextBeforeDraw(page.pullQuote ?? "", "sentence");
  if (chosen && chosen.length <= 150) return chosen;
  const candidates = sentences.filter(sentence => sentence.length >= 36 && sentence.length <= 120);
  return candidates.at(-1) ?? "";
}

function planBody(c: CanvasRenderingContext2D, body: string, box: BodyBox, minimum: number): BodyPlan | null {
  const start = 37;
  const firstChar = body.charAt(0);
  const useDropCap = Boolean(box.dropCap && box.align !== "center" && /[A-Za-z]/.test(firstChar));
  for (let size = start; size >= minimum; size -= 1) {
    const lineHeight = Math.round(size * 1.5);
    const capacity = Math.floor((box.bottom - box.y) / lineHeight) + 1;
    if (capacity < 1) return null;
    const dropCapSize = Math.round((2 * lineHeight + size * 0.64) / 0.64);
    let words = body.split(/\s+/).filter(Boolean);
    let dropCap = "";
    let dropW = 0;
    if (useDropCap) {
      dropCap = firstChar;
      c.font = `600 ${dropCapSize}px ${SERIF}`;
      dropW = Math.ceil(c.measureText(dropCap).width) + 16;
      const rest = words[0].slice(1);
      words = rest ? [rest, ...words.slice(1)] : words.slice(1);
    }
    c.font = `500 ${size}px ${SERIF}`;
    const geometry = (index: number) => {
      const top = box.y + index * lineHeight - size;
      const column = box.wrap && top < box.wrap.until ? { x: box.wrap.x, width: box.wrap.width } : { x: box.x, width: box.maxWidth };
      return useDropCap && index < 3 ? { x: column.x + dropW, width: column.width - dropW } : column;
    };
    const lines: BodyLine[] = [];
    let current: string[] = [];
    for (const word of words) {
      const g = geometry(lines.length);
      const candidate = [...current, word].join(" ");
      if (current.length && c.measureText(candidate).width > g.width) {
        lines.push({ words: current, ...g });
        current = [word];
      } else current.push(word);
    }
    if (current.length) lines.push({ words: current, ...geometry(lines.length) });
    if (lines.length <= capacity) {
      const dropCapX = (box.wrap && box.y - size < box.wrap.until ? box.wrap.x : box.x) - 2;
      return { size, lineHeight, lines, dropCap, dropCapSize, dropCapX, endY: box.y + (lines.length - 1) * lineHeight + size * 0.35 };
    }
  }
  return null;
}

/** Drops whole sentences from the end only when even the smallest size cannot hold the copy. */
function trimToFit(c: CanvasRenderingContext2D, body: string, box: BodyBox) {
  const sentences = splitIntoCompleteSentences(body);
  for (let count = sentences.length - 1; count >= 1; count -= 1) {
    const candidate = sentences.slice(0, count).join(" ");
    if (planBody(c, candidate, box, 24)) return candidate;
  }
  return sentences[0] ?? "";
}

function wrapWords(c: CanvasRenderingContext2D, words: string[], maxWidth: number) {
  const lines: string[][] = [];
  let line: string[] = [];
  for (const word of words) {
    const candidate = [...line, word].join(" ");
    if (line.length && c.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = [word];
    } else line.push(word);
  }
  if (line.length) lines.push(line);
  return lines;
}

function drawBody(c: CanvasRenderingContext2D, t: Theme, plan: BodyPlan, box: BodyBox) {
  if (plan.dropCap) {
    c.fillStyle = t.accent;
    c.font = `600 ${plan.dropCapSize}px ${SERIF}`;
    drawVerbatimVisualLine(c, plan.dropCap, plan.dropCapX, box.y + 2 * plan.lineHeight);
  }
  c.fillStyle = t.body;
  c.font = `500 ${plan.size}px ${SERIF}`;
  const space = c.measureText(" ").width;
  plan.lines.forEach((line, index) => {
    const y = box.y + index * plan.lineHeight;
    if (box.align === "center") {
      c.textAlign = "center";
      drawVerbatimVisualLine(c, line.words.join(" "), box.x, y);
      c.textAlign = "left";
      return;
    }
    const isLast = index === plan.lines.length - 1;
    const natural = c.measureText(line.words.join(" ")).width;
    const gaps = line.words.length - 1;
    const extra = gaps > 0 ? (line.width - natural) / gaps : 0;
    // Full lines are justified; the last line, and any line that would open wide gaps, stay ragged.
    if (isLast || gaps === 0 || extra > space * 1.6) {
      drawVerbatimVisualLine(c, line.words.join(" "), line.x, y);
      return;
    }
    let cursor = line.x;
    for (const word of line.words) {
      drawVerbatimVisualLine(c, word, cursor, y);
      cursor += c.measureText(word).width + space + extra;
    }
  });
}

/* ---------- shared pieces ---------- */

function countLines(c: CanvasRenderingContext2D, source: string, font: string, maxWidth: number) {
  c.font = font;
  return wrapWords(c, source.split(/\s+/).filter(Boolean), maxWidth).length;
}

function centerFolio(c: CanvasRenderingContext2D, t: Theme, folio: number, x: number) {
  c.textAlign = "center";
  c.fillStyle = t.muted;
  label(c, String(folio).padStart(2, "0"), x, H - 82, 15, 4);
  c.textAlign = "left";
}

function label(c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, spacing: number) {
  c.font = `500 ${size}px ${SANS}`;
  const ctx = c as LetterSpacedContext;
  const before = ctx.letterSpacing;
  ctx.letterSpacing = `${spacing}px`;
  // Letter spacing adds a trailing gap; shift centered and right-aligned labels to compensate.
  const nudge = c.textAlign === "center" ? spacing / 2 : c.textAlign === "right" ? spacing : 0;
  drawSafeTextLine(c, value, x + nudge, y, "headline");
  ctx.letterSpacing = before ?? "0px";
}

function ornamentRule(c: CanvasRenderingContext2D, cx: number, y: number, color: string) {
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(cx - 90, y); c.lineTo(cx - 14, y);
  c.moveTo(cx + 14, y); c.lineTo(cx + 90, y);
  c.stroke();
  c.beginPath();
  c.moveTo(cx, y - 6); c.lineTo(cx + 6, y); c.lineTo(cx, y + 6); c.lineTo(cx - 6, y);
  c.closePath();
  c.fill();
  c.restore();
}

function dottedLeader(c: CanvasRenderingContext2D, from: number, to: number, y: number, color: string) {
  if (to - from < 30) return;
  c.save();
  c.fillStyle = color;
  for (let x = from; x <= to; x += 14) {
    c.beginPath();
    c.arc(x, y, 1.6, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

async function framedImage(c: CanvasRenderingContext2D, t: Theme, data: string | undefined, x: number, y: number, w: number, h: number) {
  await imageCover(c, data, x, y, w, h, t.placeholder);
  c.strokeStyle = t.accent;
  c.lineWidth = 1.5;
  c.strokeRect(x - 18, y - 18, w + 36, h + 36);
}

function text(c: CanvasRenderingContext2D, source: unknown, options: TextFitOptions) {
  return fitTextWithoutEllipsis(c, source, options);
}

function chapterLabel(chapter: number) {
  return `CHAPTER ${roman(Math.max(1, chapter))}`;
}

export function roman(n: number) {
  const map: Array<[number, string]> = [[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  let rest = Math.max(1, Math.floor(n));
  for (const [value, symbol] of map) while (rest >= value) { out += symbol; rest -= value; }
  return out;
}

function wordCount(source: string) {
  return source.trim().split(/\s+/).filter(Boolean).length;
}

function drawPaper(c: CanvasRenderingContext2D, t: Theme) {
  c.fillStyle = t.paper;
  c.fillRect(0, 0, W, H);
  // Fine paper grain, seeded so every export of a page is identical.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  c.fillStyle = t.dark ? "rgba(255,255,255,.018)" : "rgba(60,45,25,.025)";
  for (let i = 0; i < 9000; i += 1) c.fillRect(rand() * W, rand() * H, 1.4, 1.4);
}

async function imageCover(c: CanvasRenderingContext2D, data: string | undefined, x: number, y: number, w: number, h: number, fallback: string, focusY = 0.5) {
  c.fillStyle = fallback;
  c.fillRect(x, y, w, h);
  if (!data) return;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("A page image could not be rendered."));
      element.src = data;
    });
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale;
    const sh = h / scale;
    c.drawImage(image, (image.width - sw) / 2, (image.height - sh) * focusY, sw, sh, x, y, w, h);
  } catch {
    // The paper-colored placeholder keeps the export usable when stored image data is incomplete.
  }
}

/* ---------- vector PDF ---------- */

const PDF_FONTS: Array<{ file: string; family: string; style: string; match: (font: string) => boolean }> = [
  { file: "cormorant-500-italic.ttf", family: "CormorantItalic", style: "normal", match: font => /cormorant/i.test(font) && /italic/i.test(font) },
  { file: "cormorant-600.ttf", family: "CormorantSemibold", style: "normal", match: font => /cormorant/i.test(font) && /\b600\b/.test(font) },
  { file: "cormorant-500.ttf", family: "Cormorant", style: "normal", match: font => /cormorant/i.test(font) },
  { file: "montserrat-500.ttf", family: "Montserrat", style: "normal", match: font => /montserrat/i.test(font) },
];

/**
 * Builds the PDF with the artwork and paper as images and every line of
 * copy as real embedded text, so it stays sharp at any zoom and can be selected.
 */
export async function exportPremiumPdf(project: VisualBookProject, filename: string) {
  (await buildPremiumPdf(project)).save(filename);
}

export async function buildPremiumPdf(project: VisualBookProject) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [W, H], compress: true });
  await registerPdfFonts(pdf);
  const sheets = premiumSequence(project);
  for (let index = 0; index < sheets.length; index += 1) {
    if (index) pdf.addPage([W, H], "portrait");
    const runs: PremiumTextRun[] = [];
    const background = await renderPremiumSheet(project, sheets[index], { capture: runs, quality: 0.92 });
    pdf.addImage(background, "JPEG", 0, 0, W, H, undefined, "FAST");
    placePdfText(pdf, runs);
  }
  pdf.setProperties({ title: project.title, author: project.author, subject: project.subtitle, creator: "EB Studio Pro" });
  return pdf;
}

type PdfDoc = InstanceType<typeof import("jspdf").jsPDF>;

async function registerPdfFonts(pdf: PdfDoc) {
  for (const font of PDF_FONTS) {
    const response = await fetch(`/fonts/premium/${font.file}`);
    if (!response.ok) throw new Error("The book fonts could not be loaded for the PDF.");
    pdf.addFileToVFS(font.file, arrayBufferToBase64(await response.arrayBuffer()));
    pdf.addFont(font.file, font.family, font.style);
  }
}

/** Canvas pixels to jsPDF font size on a px-unit page (jsPDF scales points by 0.75 there). */
export const PDF_FONT_SCALE = 4 / 3;

export function placePdfText(pdf: PdfDoc, runs: PremiumTextRun[]) {
  for (const run of runs) {
    const font = PDF_FONTS.find(item => item.match(run.font)) ?? PDF_FONTS[2];
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(run.font)?.[1] ?? 30);
    const { r, g, b, a } = parseColor(run.color);
    pdf.setFont(font.family, font.style);
    pdf.setFontSize(size * PDF_FONT_SCALE);
    pdf.setTextColor(r, g, b);
    if (a < 1) pdf.setGState(opacityState(pdf, a));
    pdf.text(run.text, run.x, run.y, { baseline: "alphabetic", charSpace: run.letterSpacing || undefined });
    if (a < 1) pdf.setGState(opacityState(pdf, 1));
  }
}

function opacityState(pdf: PdfDoc, opacity: number) {
  const GState = (pdf as unknown as { GState: new (options: { opacity: number }) => unknown }).GState;
  return new GState({ opacity }) as Parameters<PdfDoc["setGState"]>[0];
}

export function parseColor(color: string) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const value = parseInt(hex[1], 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, a: 1 };
  }
  const rgba = /rgba?\(([^)]+)\)/i.exec(color);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map(part => part.trim());
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
