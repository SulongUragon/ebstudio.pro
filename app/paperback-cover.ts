import type { Manuscript } from "./book-types";
import { BLURB_MAX_WORDS, BLURB_MIN_WORDS, countBlurbWords, removeDashes } from "./back-cover-copy";
import { cleanText, downloadBlob, exportFilenameStem, getCoverReadiness } from "./exporters";
import {
  createPaperbackPdf,
  getPaperbackReadiness,
  PAPERBACK_TRIMS,
  PRINT_FONT_FILES,
  type PaperbackTrim,
  type PrintFontLoader,
} from "./print-exporters";

/* KDP paperback cover rules, from KDP Help "Create a Paperback Cover". */
export const COVER_BLEED_INCHES = 0.125;
export const COVER_DPI = 300;
export const SPINE_TEXT_MIN_PAGES = 80;
export const SPINE_TEXT_EDGE_INCHES = 0.0625;
export const BARCODE_WIDTH_INCHES = 2;
export const BARCODE_HEIGHT_INCHES = 1.2;
export const BARCODE_OFFSET_INCHES = 0.25;
export const BACK_TEXT_MARGIN_INCHES = 0.375;

export type PaperType = "white" | "cream";

export const PAPER_THICKNESS_INCHES: Record<PaperType, number> = {
  white: 0.002252,
  cream: 0.0025,
};

const POINTS = 72;
const FONT_FAMILY = "EBGaramond";

export { BLURB_MAX_WORDS, BLURB_MIN_WORDS, countBlurbWords, removeDashes };

export type CoverGeometry = {
  trim: PaperbackTrim;
  paper: PaperType;
  pageCount: number;
  trimWidth: number;
  trimHeight: number;
  spineWidth: number;
  fullWidth: number;
  fullHeight: number;
  spineLeft: number;
  frontLeft: number;
  spineText: boolean;
  /** Pixel size of the front panel image (trim plus outer bleed) at 300 DPI. */
  frontPixels: { width: number; height: number };
  /** Barcode area on the back, in inches from the cover's top-left corner. */
  barcode: { left: number; top: number; width: number; height: number };
};

export function defaultPaperType(mode: Manuscript["mode"]): PaperType {
  return mode === "fiction" ? "cream" : "white";
}

export function frontCoverPixels(trim: PaperbackTrim) {
  const spec = PAPERBACK_TRIMS[trim];
  return {
    width: Math.round((spec.width + COVER_BLEED_INCHES) * COVER_DPI),
    height: Math.round((spec.height + COVER_BLEED_INCHES * 2) * COVER_DPI),
  };
}

export function paperbackCoverGeometry(trim: PaperbackTrim, pageCount: number, paper: PaperType): CoverGeometry {
  const spec = PAPERBACK_TRIMS[trim];
  if (!spec) throw new Error(`Unsupported paperback trim size: ${trim}`);
  const spineWidth = pageCount * PAPER_THICKNESS_INCHES[paper];
  const fullWidth = COVER_BLEED_INCHES + spec.width + spineWidth + spec.width + COVER_BLEED_INCHES;
  const fullHeight = spec.height + COVER_BLEED_INCHES * 2;
  const spineLeft = COVER_BLEED_INCHES + spec.width;
  const backRight = spineLeft;
  const trimBottom = COVER_BLEED_INCHES + spec.height;
  return {
    trim,
    paper,
    pageCount,
    trimWidth: spec.width,
    trimHeight: spec.height,
    spineWidth,
    fullWidth,
    fullHeight,
    spineLeft,
    frontLeft: spineLeft + spineWidth,
    spineText: pageCount >= SPINE_TEXT_MIN_PAGES,
    frontPixels: frontCoverPixels(trim),
    barcode: {
      left: backRight - BARCODE_OFFSET_INCHES - BARCODE_WIDTH_INCHES,
      top: trimBottom - BARCODE_OFFSET_INCHES - BARCODE_HEIGHT_INCHES,
      width: BARCODE_WIDTH_INCHES,
      height: BARCODE_HEIGHT_INCHES,
    },
  };
}

export function getPaperbackCoverReadiness(book: Manuscript) {
  const errors = [...getPaperbackReadiness(book).errors, ...getCoverReadiness(book).errors];
  const words = countBlurbWords(book.backCover?.blurb ?? "");
  if (!words) errors.push("Write or draft the back cover blurb.");
  else if (words < BLURB_MIN_WORDS) errors.push(`Make the back cover blurb at least ${BLURB_MIN_WORDS} words.`);
  else if (words > BLURB_MAX_WORDS) errors.push(`Keep the back cover blurb under ${BLURB_MAX_WORDS} words.`);
  return { ready: errors.length === 0, errors };
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [29, 29, 27];
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function relativeLuminance([red, green, blue]: [number, number, number]) {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** Dark ink on light backgrounds and warm white on dark ones. */
export function backTextColor(background: string): [number, number, number] {
  return relativeLuminance(hexToRgb(background)) > 0.35 ? [26, 24, 21] : [246, 241, 231];
}

function dataUriBytes(dataUri: string) {
  const base64 = dataUri.split(",")[1] ?? "";
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/** Reads the pixel size from a JPEG's start-of-frame marker. */
export function jpegSize(bytes: Uint8Array) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] };
    }
    offset += 2 + length;
  }
  return null;
}

export type PaperbackCoverOptions = {
  trim?: PaperbackTrim;
  paper?: PaperType;
  /** JPEG data URI of the front panel at exactly frontCoverPixels(trim). */
  frontImage: string;
  backColor?: string;
  pageCount?: number;
  fontLoader?: PrintFontLoader;
};

export type PaperbackCoverReport = { blob: Blob; geometry: CoverGeometry };

export async function createPaperbackCoverPdf(book: Manuscript, options: PaperbackCoverOptions): Promise<PaperbackCoverReport> {
  const readiness = getPaperbackCoverReadiness(book);
  if (!readiness.ready) throw new Error(readiness.errors[0]);
  const trim = options.trim ?? "6x9";
  const paper = options.paper ?? book.backCover?.paper ?? defaultPaperType(book.mode);
  const pageCount =
    options.pageCount ?? (await createPaperbackPdf(book, { trim, fontLoader: options.fontLoader })).pageCount;
  const geometry = paperbackCoverGeometry(trim, pageCount, paper);

  const frontBytes = dataUriBytes(options.frontImage);
  const size = jpegSize(frontBytes);
  if (!/^data:image\/jpe?g;base64,/i.test(options.frontImage) || !size) {
    throw new Error("The front cover image must be a JPEG.");
  }
  if (size.width < geometry.frontPixels.width || size.height < geometry.frontPixels.height) {
    throw new Error(
      `The front cover is ${size.width} × ${size.height} px. A ${PAPERBACK_TRIMS[trim].label} paperback needs ${geometry.frontPixels.width} × ${geometry.frontPixels.height} px for 300 DPI.`,
    );
  }

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "pt",
    format: [geometry.fullWidth * POINTS, geometry.fullHeight * POINTS],
    orientation: "landscape",
    putOnlyUsedFonts: true,
    compress: true,
  });
  const loader =
    options.fontLoader ??
    (async (fileName: string) => {
      const response = await fetch(`/fonts/eb-garamond/${fileName}`);
      if (!response.ok) throw new Error(`The print font ${fileName} could not be loaded.`);
      return new Uint8Array(await response.arrayBuffer());
    });
  for (const [style, file] of Object.entries(PRINT_FONT_FILES)) {
    pdf.addFileToVFS(file, toBase64(await loader(file)));
    pdf.addFont(file, FONT_FAMILY, style);
  }

  const background = book.backCover?.color || options.backColor || "#1d1d1b";
  const [red, green, blue] = hexToRgb(background);
  const ink = backTextColor(background);
  const fullWidth = geometry.fullWidth * POINTS;
  const fullHeight = geometry.fullHeight * POINTS;

  // Back and spine share one background that runs into the bleed.
  pdf.setFillColor(red, green, blue);
  pdf.rect(0, 0, geometry.frontLeft * POINTS, fullHeight, "F");

  // Front panel: trim plus bleed on the top, bottom, and outside edge.
  pdf.addImage(
    options.frontImage,
    "JPEG",
    geometry.frontLeft * POINTS,
    0,
    fullWidth - geometry.frontLeft * POINTS,
    fullHeight,
    undefined,
    "NONE",
  );

  const title = cleanText(book.title).trim();
  const author = cleanText(book.author).trim();
  pdf.setTextColor(ink[0], ink[1], ink[2]);

  if (geometry.spineText) {
    const spineWidth = geometry.spineWidth * POINTS;
    const usable = spineWidth - SPINE_TEXT_EDGE_INCHES * 2 * POINTS;
    const size = Math.max(5, Math.min(14, usable * 0.68));
    const center = geometry.spineLeft * POINTS + spineWidth / 2;
    const baseline = center - size * 0.32;
    const top = (COVER_BLEED_INCHES + 0.4) * POINTS;
    const bottom = fullHeight - (COVER_BLEED_INCHES + 0.4) * POINTS;
    pdf.setFontSize(size);
    pdf.setFont(FONT_FAMILY, "normal");
    const authorWidth = pdf.getTextWidth(author);
    pdf.setFont(FONT_FAMILY, "bold");
    let titleSize = size;
    const titleRoom = bottom - top - authorWidth - 0.4 * POINTS;
    while (pdf.getTextWidth(title) > titleRoom && titleSize > 5) {
      titleSize -= 0.5;
      pdf.setFontSize(titleSize);
    }
    // Rotated clockwise so the title reads top to bottom with the book face up.
    pdf.text(title, baseline, top, { angle: -90 });
    pdf.setFont(FONT_FAMILY, "normal");
    pdf.setFontSize(size);
    pdf.text(author, baseline, bottom - authorWidth, { angle: -90 });
  }

  // Back cover copy, kept clear of the hinge, the trim, and the barcode area.
  const left = (COVER_BLEED_INCHES + BACK_TEXT_MARGIN_INCHES) * POINTS;
  const right = (geometry.spineLeft - BACK_TEXT_MARGIN_INCHES) * POINTS;
  const textTop = (COVER_BLEED_INCHES + 0.75) * POINTS;
  const textBottom = (geometry.barcode.top - 0.3) * POINTS;
  const width = right - left;
  const paragraphs = removeDashes(cleanText(book.backCover?.blurb ?? ""))
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let fontSize = 12.5;
  let lines: Array<{ text: string; first: boolean; paragraphStart: boolean }> = [];
  for (; fontSize >= 9.5; fontSize -= 0.5) {
    pdf.setFontSize(fontSize);
    lines = [];
    paragraphs.forEach((paragraph, index) => {
      pdf.setFont(FONT_FAMILY, index === 0 ? "bold" : "normal");
      const wrapped = pdf.splitTextToSize(paragraph, width) as string[];
      wrapped.forEach((text, lineIndex) => lines.push({ text, first: index === 0, paragraphStart: lineIndex === 0 && index > 0 }));
    });
    const height = lines.length * fontSize * 1.38 + paragraphs.length * fontSize * 0.7;
    if (textTop + height <= textBottom) break;
  }
  if (fontSize < 9.5) throw new Error("The back cover blurb is too long to fit. Shorten it and export again.");

  let y = textTop;
  for (const line of lines) {
    if (line.paragraphStart) y += fontSize * 0.7;
    pdf.setFont(FONT_FAMILY, line.first ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    pdf.text(line.text, left, y);
    y += fontSize * 1.38;
  }

  // Author name sits bottom left, never reaching into the barcode area.
  const authorRoom = (geometry.barcode.left - 0.2) * POINTS - left;
  let authorSize = 11;
  pdf.setFont(FONT_FAMILY, "bold");
  pdf.setFontSize(authorSize);
  const spacedWidth = (size: number) => pdf.getTextWidth(author.toUpperCase()) + author.length * 1.2 * (size / 11);
  while (spacedWidth(authorSize) > authorRoom && authorSize > 7) {
    authorSize -= 0.5;
    pdf.setFontSize(authorSize);
  }
  pdf.text(author.toUpperCase(), left, (COVER_BLEED_INCHES + geometry.trimHeight - 0.5) * POINTS, {
    charSpace: 1.2 * (authorSize / 11),
  });

  pdf.setProperties({ title: `${title} paperback cover`, author, creator: "EB Studio Pro" });
  return { blob: pdf.output("blob"), geometry };
}

export function paperbackCoverFilename(book: Pick<Manuscript, "title" | "mode">, trim: PaperbackTrim) {
  return `${exportFilenameStem(book)}-Paperback-Cover-${trim}.pdf`;
}

export async function exportPaperbackCover(book: Manuscript, shouldDownload = true, options: PaperbackCoverOptions) {
  const report = await createPaperbackCoverPdf(book, options);
  if (shouldDownload) downloadBlob(report.blob, paperbackCoverFilename(book, report.geometry.trim));
  return report;
}
