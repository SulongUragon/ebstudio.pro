import type { Manuscript } from "./book-types";
import type { jsPDF as JsPdfDocument } from "jspdf";

const OPENER_PALETTE = {
  green: "#0f5d3b",
  ink: "#07151f",
  cream: "#fbf8f1",
  mist: "#d8e2dc",
} as const;

const INTERNAL_LABEL =
  /\b(?:EB\s*Studio\s*Pro(?:\s*\/\s*KDP\s*Edition)?|KDP\s*(?:Edition|Package)|Export\s*(?:Edition|Package))\b/gi;
const EXACT_PLACEHOLDER =
  /^(?:AUTHOR\s+NAME|YOUR\s+NAME|BOOK\s+TITLE|TITLE|SUBTITLE|SAMPLE\s+TEXT|LOREM\s+IPSUM)[\s:.,;!?-]*$/i;
const EMBEDDED_PLACEHOLDER =
  /\b(?:AUTHOR\s+NAME|YOUR\s+NAME|BOOK\s+TITLE|SAMPLE\s+TEXT|LOREM\s+IPSUM)\b/i;

export type LongFormChapterOpener = {
  sectionIndex: number;
  chapterNumber: number;
  label: string;
  title: string;
  deck: string;
  imageData: string;
  imagePrompt: string;
  visualMood: string;
  usesFallback: boolean;
};

export type ChapterImageAsset = {
  dataUri: string;
  base64: string;
  extension: "jpg" | "png" | "webp";
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  pdfFormat: "JPEG" | "PNG" | "WEBP";
};

export function sanitizeChapterOpenerMetadata(value: unknown) {
  const text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(INTERNAL_LABEL, "")
    .replace(/(?:\.\.\.|…)+/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`]+/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\s+([,:;.!?])/g, "$1")
    .replace(/^[\s:;|/\\-]+/, "")
    .trim();
  return EXACT_PLACEHOLDER.test(text) || EMBEDDED_PLACEHOLDER.test(text) ? "" : text;
}

export function sanitizeChapterOpenerDeck(value: unknown) {
  const text = sanitizeChapterOpenerMetadata(value).replace(/\s+/g, " ").trim();
  if (!text || EXACT_PLACEHOLDER.test(text)) return "";
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [];
  const complete = sentences
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.length <= 240 && sentence.split(/\s+/).length <= 42);
  return complete ?? "";
}

export function chapterImageAsset(value: unknown): ChapterImageAsset | null {
  const dataUri = String(value ?? "").trim();
  const match = dataUri.match(/^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=\s]+)$/i);
  if (!match || !match[2].replace(/\s+/g, "")) return null;
  const mime = match[1].toLowerCase();
  const extension = mime === "png" ? "png" : mime === "webp" ? "webp" : "jpg";
  return {
    dataUri,
    base64: match[2].replace(/\s+/g, ""),
    extension,
    mediaType: extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg",
    pdfFormat: extension === "png" ? "PNG" : extension === "webp" ? "WEBP" : "JPEG",
  };
}

export function getLongFormChapterOpeners(book: Manuscript): LongFormChapterOpener[] {
  const imageBySection = new Map(
    (book.images ?? []).map((image) => [Number(image.sectionIndex), image]),
  );
  let chapterOrdinal = 0;

  return (book.sections ?? []).flatMap((section, sectionIndex) => {
    if (section?.kind !== "chapter") return [];
    chapterOrdinal += 1;
    const parsedNumber = Number(section.number);
    const chapterNumber = Number.isFinite(parsedNumber) && parsedNumber > 0
      ? parsedNumber
      : chapterOrdinal;
    const label = `Chapter ${chapterNumber}`;
    const plan = book.plan?.[sectionIndex];
    const fallbackTitle = book.mode === "fiction" ? "The Story Continues" : "The Next Step";
    const rawTitle = sanitizeChapterOpenerMetadata(section.title) || fallbackTitle;
    const title = removeRepeatedChapterLabel(rawTitle, chapterNumber) || fallbackTitle;
    const deckCandidates = [section.openerDeck, plan?.openerDeck, section.summary];
    const deck = deckCandidates
      .map(sanitizeChapterOpenerDeck)
      .find((candidate) => candidate && normalizeText(candidate) !== normalizeText(title)) ?? "";
    const savedImage = imageBySection.get(sectionIndex);
    const asset = chapterImageAsset(savedImage?.imageData);
    const imagePrompt = sanitizeChapterOpenerMetadata(
      section.openerImagePrompt || plan?.openerImagePrompt || savedImage?.prompt,
    );
    const visualMood = sanitizeChapterOpenerMetadata(
      section.openerVisualMood || plan?.openerVisualMood,
    );

    return [{
      sectionIndex,
      chapterNumber,
      label,
      title,
      deck,
      imageData: asset?.dataUri ?? "",
      imagePrompt,
      visualMood,
      usesFallback: !asset,
    }];
  });
}

export function drawLongFormChapterOpenerPage(
  pdf: JsPdfDocument,
  opener: LongFormChapterOpener,
  pageWidth: number,
  pageHeight: number,
) {
  const frame = { x: 36, y: 36, width: pageWidth - 72, height: pageHeight - 72 };
  pdf.setFillColor(OPENER_PALETTE.cream);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  drawPremiumFallback(pdf, frame.x, frame.y, frame.width, frame.height);

  let usedImage = false;
  const asset = chapterImageAsset(opener.imageData);
  if (asset) {
    try {
      const props = pdf.getImageProperties(asset.dataUri);
      const sourceRatio = Number(props.width) / Number(props.height);
      const frameRatio = frame.width / frame.height;
      let width = frame.width;
      let height = frame.height;
      if (Number.isFinite(sourceRatio) && sourceRatio > 0) {
        if (sourceRatio > frameRatio) height = width / sourceRatio;
        else width = height * sourceRatio;
      }
      pdf.addImage(
        asset.dataUri,
        asset.pdfFormat,
        frame.x + (frame.width - width) / 2,
        frame.y + (frame.height - height) / 2,
        width,
        height,
        undefined,
        "FAST",
      );
      usedImage = true;
    } catch {
      usedImage = false;
    }
  }

  const panelHeight = opener.deck ? 250 : 210;
  const panelY = frame.y + frame.height - panelHeight;
  pdf.saveGraphicsState();
  pdf.setGState(pdf.GState({ opacity: usedImage ? 0.42 : 0.3 }));
  pdf.setFillColor(OPENER_PALETTE.ink);
  pdf.rect(frame.x, panelY - 42, frame.width, 42, "F");
  pdf.restoreGraphicsState();
  pdf.saveGraphicsState();
  pdf.setGState(pdf.GState({ opacity: usedImage ? 0.86 : 0.76 }));
  pdf.setFillColor(OPENER_PALETTE.ink);
  pdf.rect(frame.x, panelY, frame.width, panelHeight, "F");
  pdf.restoreGraphicsState();

  const textX = frame.x + 38;
  const textWidth = frame.width - 76;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(OPENER_PALETTE.mist);
  pdf.text(opener.label.toUpperCase(), textX, panelY + 35);
  pdf.setDrawColor(OPENER_PALETTE.green);
  pdf.setLineWidth(2);
  pdf.line(textX, panelY + 49, textX + 72, panelY + 49);

  const title = fitText(
    pdf,
    opener.title,
    textWidth,
    opener.deck ? 92 : 110,
    30,
    5,
    1.08,
    "times",
    "bold",
  );
  let y = panelY + 83;
  pdf.setFont("times", "bold");
  pdf.setFontSize(title.size);
  pdf.setTextColor(OPENER_PALETTE.cream);
  for (const line of title.lines) {
    pdf.text(line, textX, y);
    y += title.size * 1.08;
  }

  if (opener.deck) {
    const deck = fitText(pdf, opener.deck, textWidth, 40, 12.5, 8.5, 1.28, "times", "italic");
    if (deck.fits) {
      y += 15;
      pdf.setFont("times", "italic");
      pdf.setFontSize(deck.size);
      pdf.setTextColor(OPENER_PALETTE.mist);
      for (const line of deck.lines) {
        pdf.text(line, textX, y);
        y += deck.size * 1.28;
      }
    }
  }

  pdf.setDrawColor(OPENER_PALETTE.green);
  pdf.setLineWidth(1.2);
  pdf.line(frame.x, frame.y, frame.x + frame.width, frame.y);
  return { usedImage };
}

function removeRepeatedChapterLabel(title: string, chapterNumber: number) {
  const prefix = new RegExp(`^chapter\\s+${chapterNumber}\\s*[:.\\-–—]?\\s*`, "i");
  let clean = title.trim();
  while (prefix.test(clean)) clean = clean.replace(prefix, "").trim();
  return clean;
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fitText(
  pdf: JsPdfDocument,
  text: string,
  maxWidth: number,
  maxHeight: number,
  initialSize: number,
  minimumSize: number,
  lineHeightRatio: number,
  font: "times" | "helvetica",
  style: "normal" | "bold" | "italic",
) {
  let size = initialSize;
  let lines: string[] = [];
  while (true) {
    pdf.setFont(font, style);
    pdf.setFontSize(size);
    const split = pdf.splitTextToSize(text, maxWidth);
    lines = (Array.isArray(split) ? split : [split]).map(String);
    if (lines.length * size * lineHeightRatio <= maxHeight) {
      return { lines, size, fits: true };
    }
    if (size <= minimumSize) break;
    size = Math.max(minimumSize, size - 0.5);
  }
  return {
    lines,
    size,
    fits: lines.length * size * lineHeightRatio <= maxHeight,
  };
}

function drawPremiumFallback(
  pdf: JsPdfDocument,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const stops = [
    [6, 24, 39],
    [10, 58, 116],
    [15, 93, 59],
    [7, 21, 31],
  ] as const;
  const bands = 24;
  for (let index = 0; index < bands; index += 1) {
    const progress = index / Math.max(1, bands - 1);
    const scaled = progress * (stops.length - 1);
    const stopIndex = Math.min(stops.length - 2, Math.floor(scaled));
    const local = scaled - stopIndex;
    const from = stops[stopIndex];
    const to = stops[stopIndex + 1];
    pdf.setFillColor(
      Math.round(from[0] + (to[0] - from[0]) * local),
      Math.round(from[1] + (to[1] - from[1]) * local),
      Math.round(from[2] + (to[2] - from[2]) * local),
    );
    pdf.rect(x, y + (height * index) / bands, width, height / bands + 1, "F");
  }
  pdf.saveGraphicsState();
  pdf.setGState(pdf.GState({ opacity: 0.13 }));
  pdf.setDrawColor(OPENER_PALETTE.mist);
  pdf.setLineWidth(0.55);
  for (let offset = -height; offset < width; offset += 28) {
    pdf.line(x + offset, y + height, x + offset + height, y);
  }
  pdf.restoreGraphicsState();
}
