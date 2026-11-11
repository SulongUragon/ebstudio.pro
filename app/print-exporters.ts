import type { jsPDF as JsPdfDocument } from "jspdf";
import type { Manuscript } from "./book-types";
import {
  cleanText,
  copyrightYear,
  downloadBlob,
  exportFilenameStem,
  getCoverReadiness,
  getKdpReadiness,
  normalizeExportBook,
  parseRichBlocks,
  sectionDescriptiveTitle,
  sectionRole,
  sectionTocLabel,
  type InlineToken,
  type NormalizedBook,
  type RichBlock,
} from "./exporters";

/* ------------------------------------------------------------------------ */
/* Paperback interior                                                        */
/* ------------------------------------------------------------------------ */

export type PaperbackTrim = "6x9" | "5.5x8.5" | "5x8";

export const PAPERBACK_TRIMS: Record<PaperbackTrim, { label: string; width: number; height: number }> = {
  "6x9": { label: "6 × 9 in", width: 6, height: 9 },
  "5.5x8.5": { label: "5.5 × 8.5 in", width: 5.5, height: 8.5 },
  "5x8": { label: "5 × 8 in", width: 5, height: 8 },
};

export const KDP_MIN_PAPERBACK_PAGES = 24;
export const KDP_MAX_PAPERBACK_PAGES = 828;

const POINTS_PER_INCH = 72;

/**
 * KDP's minimum inside (gutter) margin grows with the final page count. The
 * interior adds a further 0.125 in of comfort on top of the minimum so a page
 * count that lands on a band edge never fails KDP's margin check.
 */
export function kdpMinimumGutterInches(pageCount: number) {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

export const GUTTER_COMFORT_INCHES = 0.125;
export const OUTSIDE_MARGIN_INCHES = 0.5;

export type PrintFontLoader = (fileName: string) => Promise<Uint8Array>;

export const PRINT_FONT_FILES = {
  normal: "EBGaramond-Regular.ttf",
  italic: "EBGaramond-Italic.ttf",
  bold: "EBGaramond-SemiBold.ttf",
} as const;

const PRINT_FONT_FAMILY = "EBGaramond";

const browserFontLoader: PrintFontLoader = async (fileName) => {
  const response = await fetch(`/fonts/eb-garamond/${fileName}`);
  if (!response.ok) throw new Error(`The print font ${fileName} could not be loaded.`);
  return new Uint8Array(await response.arrayBuffer());
};

export type PaperbackOptions = {
  trim?: PaperbackTrim;
  fontLoader?: PrintFontLoader;
};

export type PaperbackReport = {
  blob: Blob;
  pageCount: number;
  gutterInches: number;
  insideMarginInches: number;
  trim: PaperbackTrim;
  sectionStartPages: number[];
};

/** Manuscript checks for print. The ebook cover is not needed for an interior. */
export function getPaperbackReadiness(book: Manuscript) {
  const coverErrors = new Set(getCoverReadiness(book).errors);
  const readiness = getKdpReadiness(book);
  const errors = readiness.errors.filter((error) => !coverErrors.has(error));
  return { ready: errors.length === 0, errors, warnings: readiness.warnings };
}

type FontStyle = "normal" | "italic" | "bold";

type Fragment = { text: string; style: FontStyle };
type Word = { fragments: Fragment[]; width: number };

type TextOp = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  style: FontStyle;
  size: number;
  align?: "left" | "center" | "right";
  charSpace?: number;
};
type WordsOp = {
  kind: "words";
  words: Word[];
  x: number;
  y: number;
  size: number;
  gap: number;
};
type RuleOp = { kind: "rule"; x1: number; x2: number; y: number; width: number };
type TocNumberOp = { kind: "toc-number"; sectionIndex: number; y: number; size: number };
type PageOp = TextOp | WordsOp | RuleOp | TocNumberOp;

type PlannedPage = {
  ops: PageOp[];
  role: "title" | "copyright" | "contents" | "opening" | "body" | "blank";
  sectionLabel?: string;
};

type Metrics = {
  pageWidth: number;
  pageHeight: number;
  blockWidth: number;
  top: number;
  bottom: number;
  bodySize: number;
  leading: number;
  indent: number;
};

function toBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function registerPrintFonts(pdf: JsPdfDocument, loader: PrintFontLoader) {
  const entries = Object.entries(PRINT_FONT_FILES) as Array<[FontStyle, string]>;
  const loaded = await Promise.all(entries.map(async ([style, file]) => [style, file, await loader(file)] as const));
  for (const [style, file, bytes] of loaded) {
    pdf.addFileToVFS(file, toBase64(bytes));
    pdf.addFont(file, PRINT_FONT_FAMILY, style);
  }
}

class Measurer {
  private cache = new Map<string, number>();
  constructor(private pdf: JsPdfDocument) {}

  width(text: string, style: FontStyle, size: number) {
    const key = `${style}|${size}|${text}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    this.pdf.setFont(PRINT_FONT_FAMILY, style);
    this.pdf.setFontSize(size);
    const measured = this.pdf.getTextWidth(text);
    this.cache.set(key, measured);
    return measured;
  }
}

function tokenStyle(token: InlineToken, base: FontStyle): FontStyle {
  if (token.bold) return "bold";
  if (token.italics) return base === "italic" ? "normal" : "italic";
  return base;
}

function tokensToWords(tokens: InlineToken[], measurer: Measurer, size: number, base: FontStyle = "normal") {
  const words: Word[] = [];
  let current: Fragment[] = [];
  const flush = () => {
    if (!current.length) return;
    const width = current.reduce((total, fragment) => total + measurer.width(fragment.text, fragment.style, size), 0);
    words.push({ fragments: current, width });
    current = [];
  };
  for (const token of tokens) {
    const style = tokenStyle(token, base);
    for (const piece of cleanText(token.text).split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) {
        flush();
        continue;
      }
      current.push({ text: piece, style });
    }
  }
  flush();
  return words;
}

type BrokenLine = { words: Word[]; width: number; last: boolean; indent: number };

function breakLines(words: Word[], maxWidth: number, spaceWidth: number, firstIndent: number) {
  const lines: BrokenLine[] = [];
  let line: Word[] = [];
  let width = 0;
  let indent = firstIndent;
  for (const word of words) {
    const candidate = line.length ? width + spaceWidth + word.width : word.width;
    if (line.length && candidate > maxWidth - indent) {
      lines.push({ words: line, width, last: false, indent });
      line = [word];
      width = word.width;
      indent = 0;
      continue;
    }
    line.push(word);
    width = candidate;
  }
  if (line.length) lines.push({ words: line, width, last: true, indent });
  return lines;
}

function plainText(tokens: InlineToken[]) {
  return cleanText(tokens.map((token) => token.text).join("")).replace(/\s+/g, " ").trim();
}

class PaperbackLayout {
  pages: PlannedPage[] = [];
  y = 0;
  sectionStartPages: number[] = [];
  private spaceWidth: number;

  constructor(
    private book: NormalizedBook,
    private metrics: Metrics,
    private measurer: Measurer,
  ) {
    this.spaceWidth = measurer.width(" ", "normal", metrics.bodySize);
  }

  get page() {
    return this.pages[this.pages.length - 1];
  }

  addPage(role: PlannedPage["role"], sectionLabel?: string) {
    this.pages.push({ ops: [], role, sectionLabel });
    this.y = this.metrics.top;
    return this.page;
  }

  /** Recto pages are odd. A new part always opens on the right-hand page. */
  addRectoPage(role: PlannedPage["role"], sectionLabel?: string) {
    if (this.pages.length % 2 === 1) this.addPage("blank");
    return this.addPage(role, sectionLabel);
  }

  centeredLines(text: string, style: FontStyle, size: number, maxLines: number, minSize: number) {
    let fitted = size;
    let lines = this.wrapPlain(text, style, fitted, this.metrics.blockWidth);
    while (lines.length > maxLines && fitted > minSize) {
      fitted -= 1;
      lines = this.wrapPlain(text, style, fitted, this.metrics.blockWidth);
    }
    return { lines, size: fitted };
  }

  wrapPlain(text: string, style: FontStyle, size: number, maxWidth: number) {
    const words = tokensToWords([{ text }], this.measurer, size, style);
    const space = this.measurer.width(" ", style, size);
    return breakLines(words, maxWidth, space, 0).map((line) =>
      line.words.map((word) => word.fragments.map((fragment) => fragment.text).join("")).join(" "),
    );
  }

  layoutTitlePage() {
    const { pageHeight, blockWidth } = this.metrics;
    const page = this.addPage("title");
    const title = this.centeredLines(this.book.title, "bold", 26, 6, 18);
    let y = pageHeight * 0.3;
    for (const line of title.lines) {
      page.ops.push({ kind: "text", text: line, x: blockWidth / 2, y, style: "bold", size: title.size, align: "center" });
      y += title.size * 1.18;
    }
    if (this.book.subtitle) {
      const subtitle = this.centeredLines(this.book.subtitle, "italic", 14, 4, 11);
      y += 14;
      for (const line of subtitle.lines) {
        page.ops.push({ kind: "text", text: line, x: blockWidth / 2, y, style: "italic", size: subtitle.size, align: "center" });
        y += subtitle.size * 1.35;
      }
    }
    page.ops.push({ kind: "rule", x1: blockWidth / 2 - 30, x2: blockWidth / 2 + 30, y: pageHeight * 0.7, width: 0.6 });
    const author = this.centeredLines(this.book.author, "normal", 14, 2, 11);
    author.lines.forEach((line, index) => {
      page.ops.push({
        kind: "text",
        text: line,
        x: blockWidth / 2,
        y: pageHeight * 0.7 + 28 + index * author.size * 1.3,
        style: "normal",
        size: author.size,
        align: "center",
      });
    });
  }

  layoutCopyrightPage() {
    const { blockWidth, bottom } = this.metrics;
    const page = this.addPage("copyright");
    const lines = [
      `Copyright © ${copyrightYear(this.book.createdAt)} by ${this.book.author}`,
      "All rights reserved.",
    ];
    const wrapped = lines.flatMap((line) => this.wrapPlain(line, "normal", 9.5, blockWidth));
    let y = bottom - (wrapped.length - 1) * 13;
    for (const line of wrapped) {
      page.ops.push({ kind: "text", text: line, x: blockWidth / 2, y, style: "normal", size: 9.5, align: "center" });
      y += 13;
    }
  }

  layoutContents() {
    const { blockWidth, top, bottom } = this.metrics;
    const numberColumn = 30;
    const size = 11;
    const lineHeight = 15;
    const startContentsPage = () => {
      const page = this.addPage("contents");
      page.ops.push({ kind: "text", text: "Contents", x: blockWidth / 2, y: top + 30, style: "bold", size: 18, align: "center" });
      this.y = top + 78;
    };
    // Title is page 1 and copyright page 2, so Contents opens on recto page 3.
    startContentsPage();
    this.book.sections.forEach((section, index) => {
      const label = sectionTocLabel(section, this.book.mode);
      const lines = this.wrapPlain(label, "normal", size, blockWidth - numberColumn);
      const height = lines.length * lineHeight + 6;
      if (this.y + height - lineHeight > bottom) startContentsPage();
      lines.forEach((line, lineIndex) => {
        this.page.ops.push({ kind: "text", text: line, x: 0, y: this.y + lineIndex * lineHeight, style: "normal", size });
      });
      this.page.ops.push({ kind: "toc-number", sectionIndex: index, y: this.y + (lines.length - 1) * lineHeight, size });
      this.y += height;
    });
  }

  ensureLines(lines: number) {
    if (this.y + (lines - 1) * this.metrics.leading > this.metrics.bottom) {
      this.addPage("body", this.page.sectionLabel);
    }
  }

  /** Places pre-broken lines, keeping at least two lines together at a page break. */
  placeLines(lines: BrokenLine[], x: number, width: number, justify: boolean, size: number) {
    const { leading, bottom } = this.metrics;
    let index = 0;
    while (index < lines.length) {
      const remaining = lines.length - index;
      const fitting = Math.max(0, Math.floor((bottom - this.y) / leading) + 1);
      let take = Math.min(remaining, fitting);
      if (take < remaining) {
        if (remaining - take === 1 && take > 2) take -= 1;
        if (take < 2) {
          this.addPage("body", this.page.sectionLabel);
          continue;
        }
      }
      for (let offset = 0; offset < take; offset += 1) {
        const line = lines[index + offset];
        const available = width - line.indent;
        let gap = this.spaceWidth;
        if (justify && !line.last && line.words.length > 1) {
          const stretched = (available - (line.width - this.spaceWidth * (line.words.length - 1))) / (line.words.length - 1);
          if (stretched <= this.spaceWidth * 3) gap = stretched;
        }
        this.page.ops.push({ kind: "words", words: line.words, x: x + line.indent, y: this.y, size, gap });
        this.y += leading;
      }
      index += take;
      if (index < lines.length) this.addPage("body", this.page.sectionLabel);
    }
  }

  paragraph(tokens: InlineToken[], options: { indent: number; x?: number; width?: number; spaceAfter?: number }) {
    const { bodySize, blockWidth } = this.metrics;
    const x = options.x ?? 0;
    const width = options.width ?? blockWidth;
    const words = tokensToWords(tokens, this.measurer, bodySize);
    if (!words.length) return;
    const lines = breakLines(words, width, this.spaceWidth, options.indent);
    this.placeLines(lines, x, width, true, bodySize);
    this.y += options.spaceAfter ?? 0;
  }

  layoutSection(sectionIndex: number) {
    const { blockWidth, top, leading, bodySize, indent } = this.metrics;
    const section = this.book.sections[sectionIndex];
    const role = sectionRole(section, this.book.mode);
    const title = sectionDescriptiveTitle(section, this.book.mode);
    const label = sectionTocLabel(section, this.book.mode);
    const page = this.addRectoPage("opening", label);
    this.sectionStartPages[sectionIndex] = this.pages.length;

    let y = top + this.metrics.pageHeight * 0.14;
    page.ops.push({ kind: "text", text: role.toUpperCase(), x: blockWidth / 2, y, style: "normal", size: 10, align: "center", charSpace: 1.6 });
    y += 30;
    if (title !== role) {
      const fitted = this.centeredLines(title, "bold", 20, 4, 14);
      for (const line of fitted.lines) {
        page.ops.push({ kind: "text", text: line, x: blockWidth / 2, y, style: "bold", size: fitted.size, align: "center" });
        y += fitted.size * 1.2;
      }
    }
    y += 6;
    page.ops.push({ kind: "rule", x1: blockWidth / 2 - 24, x2: blockWidth / 2 + 24, y, width: 0.6 });
    this.y = y + 40;

    const fiction = this.book.mode === "fiction";
    let firstParagraph = true;
    const blocks: RichBlock[] = parseRichBlocks(section.content, section.title, label);
    for (const block of blocks) {
      if (block.type === "scene-break") {
        this.ensureLines(3);
        this.y += leading * 0.5;
        this.page.ops.push({ kind: "text", text: "*   *   *", x: blockWidth / 2, y: this.y, style: "normal", size: bodySize, align: "center" });
        this.y += leading * 1.5;
        firstParagraph = true;
        continue;
      }
      if (block.type === "heading") {
        const size = block.level === 2 ? bodySize + 2.5 : bodySize + 1;
        const lines = this.wrapPlain(plainText(block.inlines), "bold", size, blockWidth);
        this.y += leading * 0.6;
        this.ensureLines(lines.length + 2);
        for (const line of lines) {
          this.page.ops.push({ kind: "text", text: line, x: 0, y: this.y, style: "bold", size });
          this.y += size * 1.3;
        }
        this.y += leading * 0.35;
        firstParagraph = true;
        continue;
      }
      if (block.type === "list") {
        const markerWidth = 18;
        block.items.forEach((item, itemIndex) => {
          this.ensureLines(2);
          const marker = block.ordered ? `${itemIndex + 1}.` : "•";
          this.page.ops.push({ kind: "text", text: marker, x: 4, y: this.y, style: "normal", size: bodySize });
          this.paragraph(item, { indent: 0, x: markerWidth, width: blockWidth - markerWidth, spaceAfter: leading * 0.2 });
        });
        this.y += leading * 0.4;
        firstParagraph = true;
        continue;
      }
      if (fiction) {
        this.paragraph(block.inlines, { indent: firstParagraph ? 0 : indent });
      } else {
        this.paragraph(block.inlines, { indent: 0, spaceAfter: leading * 0.5 });
      }
      firstParagraph = false;
    }
  }
}

function buildMetrics(trim: PaperbackTrim, gutterInches: number): Metrics {
  const spec = PAPERBACK_TRIMS[trim];
  const pageWidth = spec.width * POINTS_PER_INCH;
  const pageHeight = spec.height * POINTS_PER_INCH;
  const inside = (gutterInches + GUTTER_COMFORT_INCHES) * POINTS_PER_INCH;
  const outside = OUTSIDE_MARGIN_INCHES * POINTS_PER_INCH;
  const small = spec.width < 5.5;
  const bodySize = small ? 10.5 : 11;
  return {
    pageWidth,
    pageHeight,
    blockWidth: pageWidth - inside - outside,
    top: 0.85 * POINTS_PER_INCH,
    bottom: pageHeight - 0.8 * POINTS_PER_INCH,
    bodySize,
    leading: small ? 14.5 : 15.2,
    indent: 0.25 * POINTS_PER_INCH,
  };
}

function layoutBook(book: NormalizedBook, metrics: Metrics, measurer: Measurer) {
  const layout = new PaperbackLayout(book, metrics, measurer);
  layout.layoutTitlePage();
  layout.layoutCopyrightPage();
  layout.layoutContents();
  book.sections.forEach((_, index) => layout.layoutSection(index));
  return layout;
}

/** Shortens a running head at a word boundary so it never runs into the margins. */
function fitRunningHead(pdf: JsPdfDocument, text: string, maxWidth: number) {
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  const words = text.split(/\s+/);
  while (words.length > 1) {
    words.pop();
    const candidate = `${words.join(" ").replace(/[,:;.]+$/, "")}…`;
    if (pdf.getTextWidth(candidate) <= maxWidth) return candidate;
  }
  return words[0] ?? "";
}

function renderPage(
  pdf: JsPdfDocument,
  page: PlannedPage,
  pageNumber: number,
  book: NormalizedBook,
  metrics: Metrics,
  insideMargin: number,
  sectionStartPages: number[],
) {
  const recto = pageNumber % 2 === 1;
  const outside = OUTSIDE_MARGIN_INCHES * POINTS_PER_INCH;
  const left = recto ? insideMargin : outside;
  pdf.setTextColor(20, 20, 20);
  pdf.setDrawColor(90, 90, 90);

  for (const op of page.ops) {
    if (op.kind === "text") {
      pdf.setFont(PRINT_FONT_FAMILY, op.style);
      pdf.setFontSize(op.size);
      const options: { align?: "left" | "center" | "right"; charSpace?: number } = {};
      if (op.align && op.align !== "left") options.align = op.align;
      if (op.charSpace) options.charSpace = op.charSpace;
      pdf.text(op.text, left + op.x, op.y, options);
      continue;
    }
    if (op.kind === "rule") {
      pdf.setLineWidth(op.width);
      pdf.line(left + op.x1, op.y, left + op.x2, op.y);
      continue;
    }
    if (op.kind === "toc-number") {
      pdf.setFont(PRINT_FONT_FAMILY, "normal");
      pdf.setFontSize(op.size);
      pdf.text(String(sectionStartPages[op.sectionIndex] ?? ""), left + metrics.blockWidth, op.y, { align: "right" });
      continue;
    }
    let x = left + op.x;
    pdf.setFontSize(op.size);
    op.words.forEach((word, wordIndex) => {
      for (const fragment of word.fragments) {
        pdf.setFont(PRINT_FONT_FAMILY, fragment.style);
        pdf.text(fragment.text, x, op.y);
        x += pdf.getTextWidth(fragment.text);
      }
      if (wordIndex < op.words.length - 1) x += op.gap;
    });
  }

  if (page.role === "body" || page.role === "opening") {
    pdf.setFont(PRINT_FONT_FAMILY, "normal");
    pdf.setFontSize(9.5);
    pdf.text(String(pageNumber), left + metrics.blockWidth / 2, metrics.pageHeight - 0.45 * POINTS_PER_INCH, { align: "center" });
  }
  if (page.role === "body") {
    // Trade convention: author on the left-hand page, the current section on the right.
    const head = recto ? page.sectionLabel ?? book.title : book.author;
    pdf.setFont(PRINT_FONT_FAMILY, "italic");
    pdf.setFontSize(9);
    pdf.text(fitRunningHead(pdf, head, metrics.blockWidth * 0.85), left + metrics.blockWidth / 2, 0.5 * POINTS_PER_INCH, { align: "center" });
  }
}

export async function createPaperbackPdf(book: Manuscript, options: PaperbackOptions = {}): Promise<PaperbackReport> {
  const readiness = getPaperbackReadiness(book);
  if (!readiness.ready) throw new Error(readiness.errors[0]);
  const trim = options.trim ?? "6x9";
  const spec = PAPERBACK_TRIMS[trim];
  if (!spec) throw new Error(`Unsupported paperback trim size: ${trim}`);
  const exportBook = normalizeExportBook(book);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    unit: "pt",
    format: [spec.width * POINTS_PER_INCH, spec.height * POINTS_PER_INCH],
    orientation: "portrait",
    putOnlyUsedFonts: true,
    compress: true,
  });
  await registerPrintFonts(pdf, options.fontLoader ?? browserFontLoader);
  const measurer = new Measurer(pdf);

  // The gutter depends on the final page count, and the page count depends on
  // the gutter. Lay out, check the band, and lay out again until it settles.
  let gutter = kdpMinimumGutterInches(0);
  let layout = layoutBook(exportBook, buildMetrics(trim, gutter), measurer);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const needed = kdpMinimumGutterInches(layout.pages.length);
    if (needed <= gutter) break;
    gutter = needed;
    layout = layoutBook(exportBook, buildMetrics(trim, gutter), measurer);
  }

  const pageCount = layout.pages.length;
  if (pageCount < KDP_MIN_PAPERBACK_PAGES) {
    throw new Error(
      `This book lays out to ${pageCount} pages. KDP paperbacks need at least ${KDP_MIN_PAPERBACK_PAGES}.`,
    );
  }
  if (pageCount > KDP_MAX_PAPERBACK_PAGES) {
    throw new Error(
      `This book lays out to ${pageCount} pages. KDP paperbacks allow at most ${KDP_MAX_PAPERBACK_PAGES}; choose a larger trim size.`,
    );
  }

  const metrics = buildMetrics(trim, gutter);
  const insideMargin = (gutter + GUTTER_COMFORT_INCHES) * POINTS_PER_INCH;
  pdf.setProperties({
    title: exportBook.title,
    subject: exportBook.subtitle || "Paperback interior",
    author: exportBook.author,
    creator: "EB Studio Pro",
  });
  layout.pages.forEach((page, index) => {
    if (index > 0) pdf.addPage();
    renderPage(pdf, page, index + 1, exportBook, metrics, insideMargin, layout.sectionStartPages);
  });

  return {
    blob: pdf.output("blob"),
    pageCount,
    gutterInches: gutter,
    insideMarginInches: gutter + GUTTER_COMFORT_INCHES,
    trim,
    sectionStartPages: layout.sectionStartPages,
  };
}

export function paperbackFilename(book: Pick<Manuscript, "title" | "mode">, trim: PaperbackTrim) {
  return `${exportFilenameStem(book)}-Paperback-${trim}.pdf`;
}

export async function exportPaperbackPdf(book: Manuscript, shouldDownload = true, options: PaperbackOptions = {}) {
  const report = await createPaperbackPdf(book, options);
  if (shouldDownload) downloadBlob(report.blob, paperbackFilename(book, report.trim));
  return report.blob;
}

/* ------------------------------------------------------------------------ */
/* Narration script                                                          */
/* ------------------------------------------------------------------------ */

export const NARRATION_WORDS_PER_MINUTE = 150;

export function estimateNarrationMinutes(wordCount: number) {
  return wordCount / NARRATION_WORDS_PER_MINUTE;
}

export function formatRuntime(minutes: number) {
  const total = Math.max(1, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** Splits prose into one sentence per prompter line, keeping closing quotes attached. */
export function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…]["'”’)]*)\s+(?=["'“‘(]*[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

type ScriptLine =
  | { kind: "cue"; text: string }
  | { kind: "heading"; text: string; size: number }
  | { kind: "spoken"; tokens: InlineToken[] }
  | { kind: "gap" }
  | { kind: "page-break" };

function sentenceTokens(tokens: InlineToken[]) {
  // Sentences are split on plain text, then each sentence is mapped back onto
  // the inline styling so italic emphasis survives for the narrator.
  const flat: Array<{ char: string; token: InlineToken }> = [];
  for (const token of tokens) {
    for (const char of cleanText(token.text).replace(/\s+/g, " ")) flat.push({ char, token });
  }
  const text = flat.map((entry) => entry.char).join("");
  const sentences = splitSentences(text);
  const result: InlineToken[][] = [];
  let cursor = 0;
  for (const sentence of sentences) {
    const start = text.indexOf(sentence, cursor);
    if (start < 0) {
      result.push([{ text: sentence }]);
      continue;
    }
    const end = start + sentence.length;
    const pieces: InlineToken[] = [];
    for (let index = start; index < end; index += 1) {
      const { char, token } = flat[index];
      const previous = pieces[pieces.length - 1];
      if (previous && previous.italics === token.italics && previous.bold === token.bold) {
        previous.text += char;
      } else {
        pieces.push({ text: char, italics: token.italics, bold: token.bold });
      }
    }
    result.push(pieces);
    cursor = end;
  }
  return result;
}

export function buildNarrationScript(book: Manuscript) {
  const exportBook = normalizeExportBook(book);
  const lines: ScriptLine[] = [];
  let totalWords = 0;
  const sectionRuntimes: Array<{ label: string; words: number }> = [];

  for (const section of exportBook.sections) {
    const label = sectionTocLabel(section, exportBook.mode);
    const role = sectionRole(section, exportBook.mode);
    const title = sectionDescriptiveTitle(section, exportBook.mode);
    let words = 0;
    const body: ScriptLine[] = [];
    for (const block of parseRichBlocks(section.content, section.title, label)) {
      if (block.type === "scene-break") {
        body.push({ kind: "cue", text: "[PAUSE 3 SECONDS. SCENE CHANGE]" }, { kind: "gap" });
        continue;
      }
      if (block.type === "heading") {
        const text = plainText(block.inlines);
        words += text.split(/\s+/).length;
        body.push({ kind: "heading", text, size: 42 }, { kind: "cue", text: "[PAUSE]" }, { kind: "gap" });
        continue;
      }
      if (block.type === "list") {
        block.items.forEach((item, index) => {
          const prefix = block.ordered ? `${index + 1}. ` : "";
          const text = plainText(item);
          words += text.split(/\s+/).length;
          body.push({ kind: "spoken", tokens: [{ text: prefix }, ...item] });
        });
        body.push({ kind: "gap" });
        continue;
      }
      const text = plainText(block.inlines);
      if (!text) continue;
      words += text.split(/\s+/).length;
      for (const sentence of sentenceTokens(block.inlines)) body.push({ kind: "spoken", tokens: sentence });
      body.push({ kind: "gap" });
    }
    totalWords += words;
    sectionRuntimes.push({ label, words });
    lines.push(
      { kind: "page-break" },
      { kind: "cue", text: `[${label.toUpperCase()}. ABOUT ${formatRuntime(estimateNarrationMinutes(words)).toUpperCase()}]` },
      { kind: "heading", text: role, size: 48 },
      ...(title !== role ? [{ kind: "heading" as const, text: title, size: 44 }] : []),
      { kind: "cue", text: "[PAUSE 2 SECONDS]" },
      { kind: "gap" },
      ...body,
      { kind: "cue", text: "[PAUSE 3 SECONDS. END OF SECTION]" },
    );
  }

  return { book: exportBook, lines, totalWords, sectionRuntimes };
}

export function narrationFilename(book: Pick<Manuscript, "title" | "mode">) {
  return `${exportFilenameStem(book)}-Narration-Script.docx`;
}

export async function exportNarrationScript(book: Manuscript, shouldDownload = true) {
  const readiness = getPaperbackReadiness(book);
  if (!readiness.ready) throw new Error(readiness.errors[0]);
  const script = buildNarrationScript(book);
  const exportBook = script.book;
  const { AlignmentType, Document, Packer, PageBreak, Paragraph, TextRun } = await import("docx");
  const font = "Arial";
  const cueColor = "8A6D1F";
  const runtime = formatRuntime(estimateNarrationMinutes(script.totalWords));

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [new TextRun({ text: exportBook.title, bold: true, size: 56, font })],
    }),
    ...(exportBook.subtitle
      ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: exportBook.subtitle, italics: true, size: 32, font })] })]
      : []),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: `Written by ${exportBook.author}`, size: 30, font })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "NARRATION SCRIPT", bold: true, size: 24, font, color: cueColor })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: `${script.totalWords.toLocaleString("en-US")} words. Estimated runtime ${runtime} at ${NARRATION_WORDS_PER_MINUTE} words per minute.`, size: 24, font })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 }, children: [new TextRun({ text: "Delivery: calm, steady, cinematic pace. One sentence per line. Italic words carry emphasis.", italics: true, size: 24, font })] }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ children: [new TextRun({ text: "[OPENING CREDITS]", bold: true, size: 28, font, color: cueColor })] }),
    new Paragraph({
      spacing: { before: 240, line: 420 },
      children: [new TextRun({ text: `${exportBook.title}.${exportBook.subtitle ? ` ${exportBook.subtitle}.` : ""} Written by ${exportBook.author}.`, size: 40, font })],
    }),
    new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: "[PAUSE 2 SECONDS]", bold: true, size: 28, font, color: cueColor })] }),
  ];

  for (const line of script.lines) {
    if (line.kind === "page-break") {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }
    if (line.kind === "gap") {
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }
    if (line.kind === "cue") {
      children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun({ text: line.text, bold: true, size: 28, font, color: cueColor })] }));
      continue;
    }
    if (line.kind === "heading") {
      children.push(new Paragraph({ spacing: { before: 120, after: 120, line: 420 }, children: [new TextRun({ text: line.text, bold: true, size: line.size, font })] }));
      continue;
    }
    children.push(
      new Paragraph({
        spacing: { after: 220, line: 360 },
        children: line.tokens
          .filter((token) => token.text)
          .map((token) => new TextRun({ text: token.text, italics: token.italics, bold: token.bold, size: 40, font })),
      }),
    );
  }

  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ children: [new TextRun({ text: "[CLOSING CREDITS]", bold: true, size: 28, font, color: cueColor })] }),
    new Paragraph({
      spacing: { before: 240, line: 420 },
      children: [new TextRun({ text: `This has been ${exportBook.title}, written by ${exportBook.author}.`, size: 40, font })],
    }),
    new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: "[END OF RECORDING]", bold: true, size: 28, font, color: cueColor })] }),
  );

  const document = new Document({
    creator: exportBook.author,
    title: `${exportBook.title} Narration Script`,
    description: `Narration script, estimated runtime ${runtime}`,
    styles: { default: { document: { run: { font, size: 40 } } } },
    sections: [{ properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, children }],
  });

  const blob = await Packer.toBlob(document);
  if (shouldDownload) downloadBlob(blob, narrationFilename(exportBook));
  return blob;
}
