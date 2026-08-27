import type { Manuscript, Mode, SectionKind } from "./book-types";
import type { ParagraphChild, TextRun as DocxTextRun } from "docx";
import type { jsPDF as JsPdfDocument } from "jspdf";
import {
  chapterImageAsset,
  drawLongFormChapterOpenerPage,
  getLongFormChapterOpeners,
} from "./longform-chapter-openers";

type InlineToken = {
  text: string;
  bold?: boolean;
  italics?: boolean;
  code?: boolean;
};

type RichBlock =
  | { type: "paragraph"; inlines: InlineToken[] }
  | { type: "heading"; level: 2 | 3; inlines: InlineToken[] }
  | { type: "list"; ordered: boolean; items: InlineToken[][] }
  | { type: "scene-break" };

type NormalizedSection = {
  sourceIndex: number;
  kind: SectionKind;
  number: number;
  title: string;
  content: string;
};

type NormalizedBook = {
  id: string;
  mode: Mode;
  title: string;
  subtitle: string;
  author: string;
  createdAt: string;
  coverImage: string;
  sections: NormalizedSection[];
};

export type KdpReadiness = {
  ready: boolean;
  errors: string[];
  warnings: string[];
};

/**
 * A generated section is only treated as finished if it actually contains a
 * chapter's worth of prose. A non-empty check is not enough: a failed
 * generation can leave behind a single truncated sentence that silently passes
 * every downstream gate and ships inside the published book.
 */
export const MIN_SECTION_CHARACTERS = 1200;

export function sectionTextLength(section: { content?: string } | undefined) {
  return cleanText(section?.content).trim().length;
}

export function isSectionFinished(section: { content?: string } | undefined) {
  return sectionTextLength(section) >= MIN_SECTION_CHARACTERS;
}

/**
 * Returns the indexes of sections that clear the absolute floor but are still
 * dramatically shorter than the rest of the book, which usually means the
 * writer stopped early. These are surfaced as warnings, not hard errors, so a
 * deliberately short chapter never blocks an export.
 *
 * The threshold sits at half the median because a real truncation can land well
 * above a third: a chapter that stopped mid scene at 42 percent of the median
 * shipped inside a finished book while the old 35 percent line stayed quiet.
 */
export const SHORT_SECTION_RATIO = 0.5;

export function shortSectionIndexes(
  sections: Array<{ content?: string } | undefined>,
) {
  const lengths = sections.map(sectionTextLength);
  const solid = lengths.filter((length) => length >= MIN_SECTION_CHARACTERS);
  if (solid.length < 3) return [];
  const sorted = [...solid].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return lengths.reduce<number[]>((found, length, index) => {
    if (length >= MIN_SECTION_CHARACTERS && length < median * SHORT_SECTION_RATIO) {
      found.push(index);
    }
    return found;
  }, []);
}

export function exportFilenameStem(book: Pick<Manuscript, "title" | "mode">) {
  const bookType = book.mode === "nonfiction" ? "Non-Fiction" : "Fiction";
  return `${safeFilename(book.title)}-${bookType}`;
}

export function getCoverReadiness(book: Manuscript): KdpReadiness {
  const errors: string[] = [];
  const title = cleanText(book?.title).trim();
  const cover = book?.cover;

  if (!cover?.imageData) {
    errors.push("Generate the final KDP cover.");
  } else {
    if (!/^data:image\/jpe?g;base64,/i.test(cover.imageData)) {
      errors.push("The KDP cover must be a JPEG.");
    }
    if (cover.width !== 1600 || cover.height !== 2560) {
      errors.push("Regenerate the cover at the KDP-ready 1600 × 2560 size.");
    }
    if (cleanText(cover.displayTitle).trim() !== title) {
      errors.push("The cover title must exactly match the book title.");
    }
    if (book.subtitle && cleanText(cover.displaySubtitle).trim() !== cleanText(book.subtitle).trim()) {
      errors.push("The cover subtitle must exactly match the book subtitle.");
    }
  }

  return { ready: errors.length === 0, errors, warnings: [] };
}

export function getKdpReadiness(book: Manuscript): KdpReadiness {
  const errors: string[] = [];
  const warnings: string[] = [];
  const title = cleanText(book?.title).trim();
  const author = cleanText(book?.author).trim();
  const sections = Array.isArray(book?.sections) ? book.sections : [];

  if (!title || title === "Untitled Book") errors.push("Add the exact final book title.");
  if (!author || author === "Unknown Author") errors.push("Add the exact author name.");
  if (!sections.length) errors.push("Generate at least one complete manuscript section.");
  if (book?.plan?.length && sections.length !== book.plan.length) {
    errors.push(`Complete all ${book.plan.length} planned sections.`);
  }
  if (sections.some((section) => !cleanText(section?.content).trim())) {
    errors.push("Every manuscript section must contain finished text.");
  }
  const truncated = sections.reduce<number[]>((found, section, index) => {
    const length = sectionTextLength(section);
    if (length > 0 && length < MIN_SECTION_CHARACTERS) found.push(index);
    return found;
  }, []);
  if (truncated.length) {
    const labels = truncated.map((index) => index + 1).join(", ");
    errors.push(
      `Section ${labels} stopped early and contains only a fragment. Retry ${truncated.length > 1 ? "those chapters" : "that chapter"} before exporting.`,
    );
  }

  errors.push(...getCoverReadiness(book).errors);

  const short = shortSectionIndexes(sections).map((index) => index + 1);
  if (short.length) {
    warnings.push(
      `Section ${short.join(", ")} is much shorter than the rest of the book. Read it before publishing.`,
    );
  }

  const tense = tenseOutlierIndexes(sections).map((index) => index + 1);
  if (tense.length) {
    warnings.push(
      `Section ${tense.join(", ")} is written in a different tense from the rest of the book. Rewrite ${tense.length > 1 ? "those chapters" : "that chapter"} before publishing.`,
    );
  }

  if (title.length > 180) warnings.push("The title is unusually long; inspect its cover fit carefully.");
  return { ready: errors.length === 0, errors, warnings };
}

const PAST_MARKERS =
  /\b(?:was|were|had|said|looked|felt|thought|knew|turned|stood|walked|watched|asked)\b/gi;
const PRESENT_MARKERS =
  /\b(?:is|are|has|says|looks|feels|thinks|knows|turns|stands|walks|watches|asks)\b/gi;

export function sectionWordCount(section: { content?: string } | undefined) {
  const text = cleanText(section?.content).trim();
  return text ? text.split(/\s+/).length : 0;
}

export function manuscriptWordCount(book: Manuscript | null | undefined) {
  if (!book) return 0;
  return (book.sections ?? []).reduce(
    (total, section) => total + sectionWordCount(section),
    0,
  );
}

/**
 * Returns the indexes of sections whose narration runs in a different tense
 * from the rest of the book. A single present tense chapter inside a past tense
 * novel reads as a mistake, and it slipped through three books before anyone
 * caught it by reading the exported file.
 */
export function tenseOutlierIndexes(
  sections: Array<{ content?: string } | undefined>,
) {
  const ratios = sections.map((section) => {
    // Dialogue is legitimately present tense, so it is removed before measuring.
    const narration = cleanText(section?.content).replace(/"[^"]*"/g, " ");
    if (narration.trim().split(/\s+/).length < 200) return null;
    const past = narration.match(PAST_MARKERS)?.length ?? 0;
    const present = narration.match(PRESENT_MARKERS)?.length ?? 0;
    if (past + present < 20) return null;
    return present / (past + present);
  });
  const measured = ratios.filter((ratio): ratio is number => ratio !== null);
  if (measured.length < 4) return [];
  const sorted = [...measured].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // Flag only a clear reversal against the book's own habit, not mild drift.
  return ratios.reduce<number[]>((found, ratio, index) => {
    if (ratio === null) return found;
    if (Math.abs(ratio - median) > 0.45) found.push(index);
    return found;
  }, []);
}

export async function exportDocx(book: Manuscript, shouldDownload = true) {
  const exportBook = normalizeExportBook(book);
  const {
    AlignmentType,
    Bookmark,
    Document,
    HeadingLevel,
    InternalHyperlink,
    LevelFormat,
    Packer,
    PageBreak,
    Paragraph,
    TextRun,
  } = await import("docx");

  const children = [
    new Paragraph({ spacing: { before: 2500 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: exportBook.title,
          bold: true,
          size: 52,
          font: "Georgia",
          color: "173B33",
        }),
      ],
    }),
    ...(exportBook.subtitle
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 280 },
            children: [
              new TextRun({
                text: exportBook.subtitle,
                italics: true,
                size: 25,
                font: "Georgia",
                color: "5F5A53",
              }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 850 },
      children: [new TextRun({ text: `by ${exportBook.author}`, size: 24, font: "Arial" })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ text: "Copyright", style: "KdpFrontMatterTitle" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 640, after: 240 },
      children: [
        new TextRun({
          text: `Copyright © ${copyrightYear(exportBook.createdAt)} by ${exportBook.author}`,
          font: "Georgia",
          size: 22,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "All rights reserved.", font: "Georgia", size: 22 })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ text: "Contents", style: "KdpContentsTitle" }),
    ...exportBook.sections.map((section, index) =>
      new Paragraph({
        style: "KdpContentsEntry",
        children: [
          new InternalHyperlink({
            anchor: sectionBookmark(index),
            children: [
              new TextRun({ text: sectionTocLabel(section, exportBook.mode), style: "Hyperlink" }),
            ],
          }),
        ],
      }),
    ),
  ];

  exportBook.sections.forEach((section, index) => {
    const headingText = sectionTocLabel(section, exportBook.mode);
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new Bookmark({
            id: sectionBookmark(index),
            children: [new TextRun({ text: headingText, bold: true, font: "Georgia" })],
          }),
        ],
      }),
    );

    let firstBodyParagraph = true;
    for (const block of parseRichBlocks(section.content, section.title, headingText)) {
      if (block.type === "scene-break") {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            style: "KdpSceneBreak",
            children: [new TextRun({ text: "* * *", font: "Georgia" })],
          }),
        );
        firstBodyParagraph = true;
        continue;
      }
      if (block.type === "heading") {
        children.push(
          new Paragraph({
            heading: block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            children: docxRuns(block.inlines, TextRun),
          }),
        );
        firstBodyParagraph = true;
        continue;
      }
      if (block.type === "list") {
        block.items.forEach((item) => {
          children.push(
            new Paragraph({
              style: "KdpList",
              ...(block.ordered
                ? { numbering: { reference: "kdp-numbered-list", level: 0 } }
                : { bullet: { level: 0 } }),
              children: docxRuns(item, TextRun),
            }),
          );
        });
        firstBodyParagraph = true;
        continue;
      }
      children.push(
        new Paragraph({
          style:
            exportBook.mode === "fiction"
              ? firstBodyParagraph
                ? "KdpFictionFirst"
                : "KdpFictionBody"
              : "KdpNonfictionBody",
          children: docxRuns(block.inlines, TextRun),
        }),
      );
      firstBodyParagraph = false;
    }
  });

  const document = new Document({
    creator: exportBook.author,
    title: exportBook.title,
    subject: exportBook.subtitle,
    description: exportBook.subtitle,
    keywords: "Kindle ebook; KDP; EB Studio Pro",
    styles: {
      default: {
        document: {
          run: { font: "Georgia", size: 22, color: "191A18" },
          paragraph: { spacing: { line: 360 } },
        },
        heading1: {
          run: { font: "Georgia", size: 34, bold: true, color: "191A18" },
          paragraph: { spacing: { before: 0, after: 360 }, keepNext: true },
        },
        heading2: {
          run: { font: "Georgia", size: 28, bold: true, color: "191A18" },
          paragraph: { spacing: { before: 280, after: 180 }, keepNext: true },
        },
        heading3: {
          run: { font: "Georgia", size: 24, bold: true, color: "191A18" },
          paragraph: { spacing: { before: 240, after: 140 }, keepNext: true },
        },
      },
      paragraphStyles: [
        {
          id: "KdpFrontMatterTitle",
          name: "KDP Front Matter Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Georgia", size: 34, bold: true },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 900, after: 300 } },
        },
        {
          id: "KdpContentsTitle",
          name: "KDP Contents Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Georgia", size: 34, bold: true },
          paragraph: { spacing: { after: 320 } },
        },
        {
          id: "KdpContentsEntry",
          name: "KDP Contents Entry",
          basedOn: "Normal",
          next: "KdpContentsEntry",
          run: { font: "Georgia", size: 22 },
          paragraph: { spacing: { after: 140 } },
        },
        {
          id: "KdpFictionFirst",
          name: "KDP Fiction First Paragraph",
          basedOn: "Normal",
          next: "KdpFictionBody",
          run: { font: "Georgia", size: 22 },
          paragraph: { spacing: { line: 360, after: 0 } },
        },
        {
          id: "KdpFictionBody",
          name: "KDP Fiction Body",
          basedOn: "Normal",
          next: "KdpFictionBody",
          run: { font: "Georgia", size: 22 },
          paragraph: { indent: { firstLine: 288 }, spacing: { line: 360, after: 0 } },
        },
        {
          id: "KdpNonfictionBody",
          name: "KDP Nonfiction Body",
          basedOn: "Normal",
          next: "KdpNonfictionBody",
          run: { font: "Georgia", size: 22 },
          paragraph: { spacing: { line: 360, after: 180 } },
        },
        {
          id: "KdpList",
          name: "KDP List",
          basedOn: "Normal",
          next: "KdpList",
          run: { font: "Georgia", size: 22 },
          paragraph: { spacing: { line: 330, after: 80 } },
        },
        {
          id: "KdpSceneBreak",
          name: "KDP Scene Break",
          basedOn: "Normal",
          next: "KdpFictionFirst",
          run: { font: "Georgia", size: 22 },
          paragraph: { spacing: { before: 220, after: 220 }, keepNext: true },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "kdp-numbered-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  if (shouldDownload) downloadBlob(blob, `${exportFilenameStem(exportBook)}-Kindle-Create.docx`);
  return blob;
}

const STANDARD_PUBLISHING_PALETTE = {
  green: "#0f5d3b",
  navy: "#0a3a74",
  ink: "#1d2730",
  muted: "#65717a",
  cream: "#fbf8f1",
  rule: "#d8e2dc",
} as const;

type ReferencePdfPageMeta =
  | { kind: "title" }
  | { kind: "contents" }
  | { kind: "opener"; label: string }
  | { kind: "section"; label: string };

function drawReferencePaper(
  pdf: JsPdfDocument,
  pageWidth: number,
  pageHeight: number,
) {
  pdf.setFillColor(STANDARD_PUBLISHING_PALETTE.cream);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  pdf.setFillColor(STANDARD_PUBLISHING_PALETTE.navy);
  pdf.rect(0, 0, pageWidth, 12, "F");
  pdf.setFillColor(STANDARD_PUBLISHING_PALETTE.green);
  pdf.rect(0, 12, pageWidth, 3, "F");
}

function pdfTextLines(
  pdf: JsPdfDocument,
  text: string,
  maxWidth: number,
  font: "times" | "helvetica",
  style: "normal" | "bold" | "italic",
  size: number,
) {
  pdf.setFont(font, style);
  pdf.setFontSize(size);
  const lines = pdf.splitTextToSize(cleanText(text).trim(), maxWidth);
  return Array.isArray(lines) ? lines.map(String) : [String(lines)];
}

function fitPdfText(
  pdf: JsPdfDocument,
  text: string,
  maxWidth: number,
  maxLines: number,
  initialSize: number,
  minimumSize: number,
  font: "times" | "helvetica",
  style: "normal" | "bold" | "italic",
) {
  let size = initialSize;
  let lines = pdfTextLines(pdf, text, maxWidth, font, style, size);
  while (lines.length > maxLines && size > minimumSize) {
    size = Math.max(minimumSize, size - 1);
    lines = pdfTextLines(pdf, text, maxWidth, font, style, size);
  }
  return { lines, size };
}

function drawReferenceTitlePage(
  pdf: JsPdfDocument,
  book: NormalizedBook,
  pageWidth: number,
  pageHeight: number,
  margin: number,
) {
  drawReferencePaper(pdf, pageWidth, pageHeight);
  const maxWidth = pageWidth - margin * 2;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.green);
  pdf.text("EB STUDIO PRO / REFERENCE EDITION", pageWidth / 2, 102, { align: "center" });
  pdf.setDrawColor(STANDARD_PUBLISHING_PALETTE.green);
  pdf.setLineWidth(2.2);
  pdf.line(pageWidth / 2 - 42, 120, pageWidth / 2 + 42, 120);

  const title = fitPdfText(pdf, book.title, maxWidth, 7, 34, 21, "times", "bold");
  const titleLineHeight = title.size * 1.13;
  const subtitle = book.subtitle
    ? fitPdfText(pdf, book.subtitle, maxWidth - 24, 5, 15, 10.5, "times", "italic")
    : null;
  const subtitleHeight = subtitle ? subtitle.lines.length * subtitle.size * 1.35 + 30 : 0;
  const titleHeight = title.lines.length * titleLineHeight;
  const contentHeight = titleHeight + subtitleHeight;
  let y = Math.max(190, (pageHeight - contentHeight) / 2 - 20);

  pdf.setFont("times", "bold");
  pdf.setFontSize(title.size);
  pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.navy);
  title.lines.forEach((line) => {
    pdf.text(line, pageWidth / 2, y, { align: "center" });
    y += titleLineHeight;
  });

  if (subtitle) {
    y += 22;
    pdf.setFont("times", "italic");
    pdf.setFontSize(subtitle.size);
    pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.muted);
    subtitle.lines.forEach((line) => {
      pdf.text(line, pageWidth / 2, y, { align: "center" });
      y += subtitle.size * 1.35;
    });
  }

  pdf.setDrawColor(STANDARD_PUBLISHING_PALETTE.rule);
  pdf.setLineWidth(0.8);
  pdf.line(pageWidth / 2 - 72, pageHeight - 155, pageWidth / 2 + 72, pageHeight - 155);
  const author = fitPdfText(pdf, book.author.toUpperCase(), maxWidth - 40, 2, 11, 8.5, "helvetica", "bold");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(author.size);
  pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.ink);
  author.lines.forEach((line, index) => {
    pdf.text(line, pageWidth / 2, pageHeight - 125 + index * author.size * 1.25, { align: "center" });
  });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.muted);
  pdf.text(book.mode === "fiction" ? "FICTION" : "NON-FICTION", pageWidth / 2, pageHeight - 98, { align: "center" });
}

function drawReferenceSectionHeading(
  pdf: JsPdfDocument,
  label: string,
  title: string,
  margin: number,
  usableWidth: number,
  startY: number,
) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.green);
  pdf.text(label, margin, startY);
  const fitted = fitPdfText(pdf, title, usableWidth, 4, 26, 17, "times", "bold");
  const lineHeight = fitted.size * 1.12;
  let y = startY + 31;
  pdf.setFont("times", "bold");
  pdf.setFontSize(fitted.size);
  pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.navy);
  fitted.lines.forEach((line) => {
    pdf.text(line, margin, y);
    y += lineHeight;
  });
  y += 12;
  pdf.setDrawColor(STANDARD_PUBLISHING_PALETTE.green);
  pdf.setLineWidth(1.6);
  pdf.line(margin, y, margin + 72, y);
  pdf.setDrawColor(STANDARD_PUBLISHING_PALETTE.rule);
  pdf.setLineWidth(0.6);
  pdf.line(margin + 72, y, margin + usableWidth, y);
  return y + 35;
}

function drawReferenceRunningElements(
  pdf: JsPdfDocument,
  pageMeta: Map<number, ReferencePdfPageMeta>,
  pageWidth: number,
  pageHeight: number,
  margin: number,
) {
  const pageCount = pdf.getNumberOfPages();
  for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
    const meta = pageMeta.get(pageNumber);
    if (!meta || meta.kind === "opener") continue;
    pdf.setPage(pageNumber);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.muted);
    pdf.text("EB STUDIO PRO", margin, 36);
    if (meta.kind === "section") {
      pdf.text(meta.label.toUpperCase(), pageWidth - margin, 36, { align: "right" });
    } else {
      pdf.text("CONTENTS", pageWidth - margin, 36, { align: "right" });
    }
    pdf.setDrawColor(STANDARD_PUBLISHING_PALETTE.rule);
    pdf.setLineWidth(0.45);
    pdf.line(margin, 44, pageWidth - margin, 44);
    pdf.line(margin, pageHeight - 42, pageWidth - margin, pageHeight - 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.navy);
    pdf.text(String(pageNumber - 1), pageWidth / 2, pageHeight - 23, { align: "center" });
  }
}

export async function exportPdf(book: Manuscript, shouldDownload = true) {
  const exportBook = normalizeExportBook(book);
  const openerBySection = new Map(
    getLongFormChapterOpeners(book).map((opener) => [opener.sectionIndex, opener]),
  );
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 70;
  const usableWidth = pageWidth - margin * 2;
  const bodyBottom = pageHeight - 64;
  const pageMeta = new Map<number, ReferencePdfPageMeta>();
  pageMeta.set(1, { kind: "title" });

  pdf.setProperties({
    title: exportBook.title,
    subject: exportBook.subtitle || `${exportBook.mode === "fiction" ? "Fiction" : "Non-Fiction"} reference edition`,
    author: exportBook.author,
    creator: "EB Studio Pro",
  });
  drawReferenceTitlePage(pdf, exportBook, pageWidth, pageHeight, margin);

  const addReferencePage = (meta: ReferencePdfPageMeta, drawPaper = true) => {
    pdf.addPage();
    pageMeta.set(pdf.getNumberOfPages(), meta);
    if (drawPaper) drawReferencePaper(pdf, pageWidth, pageHeight);
  };

  let contentsY = 0;
  const addContentsPage = (continued: boolean) => {
    addReferencePage({ kind: "contents" });
    drawReferenceSectionHeading(
      pdf,
      continued ? "CONTENTS / CONTINUED" : "REFERENCE EDITION",
      "Contents",
      margin,
      usableWidth,
      78,
    );
    contentsY = 150;
  };
  addContentsPage(false);

  exportBook.sections.forEach((section, index) => {
    pdf.setFont("helvetica", "normal");
    const fitted = fitPdfText(
      pdf,
      sectionTocLabel(section, exportBook.mode),
      usableWidth - 54,
      3,
      11.5,
      9.5,
      "helvetica",
      "normal",
    );
    const lineHeight = fitted.size * 1.35;
    const entryHeight = fitted.lines.length * lineHeight + 15;
    if (contentsY + entryHeight > bodyBottom) addContentsPage(true);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.green);
    pdf.text(String(index + 1).padStart(2, "0"), margin, contentsY + 1);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fitted.size);
    pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.ink);
    fitted.lines.forEach((line, lineIndex) => {
      pdf.text(line, margin + 42, contentsY + lineIndex * lineHeight);
    });
    pdf.setDrawColor(STANDARD_PUBLISHING_PALETTE.rule);
    pdf.setLineWidth(0.45);
    pdf.line(margin + 42, contentsY + entryHeight - 7, pageWidth - margin, contentsY + entryHeight - 7);
    contentsY += entryHeight;
  });

  for (const section of exportBook.sections) {
    const role = sectionRole(section, exportBook.mode);
    const title = sectionDescriptiveTitle(section, exportBook.mode);
    const pageLabel = sectionTocLabel(section, exportBook.mode);
    const opener = openerBySection.get(section.sourceIndex);
    if (opener) {
      addReferencePage({ kind: "opener", label: opener.label }, false);
      drawLongFormChapterOpenerPage(pdf, opener, pageWidth, pageHeight);
    }
    const addSectionPage = (continuation: boolean) => {
      addReferencePage({ kind: "section", label: role });
      if (continuation) return 72;
      return drawReferenceSectionHeading(pdf, role.toUpperCase(), title, margin, usableWidth, 78);
    };
    let y = addSectionPage(Boolean(opener));

    const moveToNextSectionPage = () => {
      y = addSectionPage(true);
    };
    const ensureSpace = (height: number) => {
      if (y + height > bodyBottom) moveToNextSectionPage();
    };
    const drawWrappedLines = (
      lines: string[],
      options: { x: number; size: number; lineHeight: number; font: "times" | "helvetica"; style: "normal" | "bold" | "italic"; color: string },
    ) => {
      pdf.setFont(options.font, options.style);
      pdf.setFontSize(options.size);
      pdf.setTextColor(options.color);
      for (const line of lines) {
        if (y + options.lineHeight > bodyBottom) moveToNextSectionPage();
        pdf.text(line, options.x, y);
        y += options.lineHeight;
      }
    };

    for (const block of parseRichBlocks(section.content, section.title, pageLabel)) {
      if (block.type === "scene-break") {
        ensureSpace(42);
        y += 8;
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.green);
        pdf.text("*  *  *", pageWidth / 2, y, { align: "center" });
        y += 29;
        continue;
      }

      if (block.type === "heading") {
        const text = blockPlainText(block);
        const size = block.level === 2 ? 14.5 : 12.5;
        const lines = pdfTextLines(pdf, text, usableWidth, "helvetica", "bold", size);
        ensureSpace(lines.length * (size * 1.3) + 22);
        y += 10;
        drawWrappedLines(lines, {
          x: margin,
          size,
          lineHeight: size * 1.3,
          font: "helvetica",
          style: "bold",
          color: STANDARD_PUBLISHING_PALETTE.navy,
        });
        y += 7;
        continue;
      }

      if (block.type === "list") {
        for (let itemIndex = 0; itemIndex < block.items.length; itemIndex += 1) {
          const marker = block.ordered ? `${itemIndex + 1}.` : "-";
          const text = block.items[itemIndex].map((token) => token.text).join("");
          const lines = pdfTextLines(pdf, text, usableWidth - 26, "times", "normal", 11.5);
          const lineHeight = 17.4;
          ensureSpace(Math.min(lines.length, 3) * lineHeight + 5);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9.5);
          pdf.setTextColor(STANDARD_PUBLISHING_PALETTE.green);
          pdf.text(marker, margin + 4, y);
          drawWrappedLines(lines, {
            x: margin + 24,
            size: 11.5,
            lineHeight,
            font: "times",
            style: "normal",
            color: STANDARD_PUBLISHING_PALETTE.ink,
          });
          y += 4;
        }
        y += 6;
        continue;
      }

      const text = blockPlainText(block);
      if (!text) continue;
      const lines = pdfTextLines(pdf, text, usableWidth, "times", "normal", 11.5);
      ensureSpace(Math.min(lines.length, 3) * 17.4 + 8);
      drawWrappedLines(lines, {
        x: margin,
        size: 11.5,
        lineHeight: 17.4,
        font: "times",
        style: "normal",
        color: STANDARD_PUBLISHING_PALETTE.ink,
      });
      y += 10;
    }
  }

  drawReferenceRunningElements(pdf, pageMeta, pageWidth, pageHeight, margin);

  const blob = pdf.output("blob");
  if (shouldDownload) downloadBlob(blob, `${exportFilenameStem(exportBook)}-Reference.pdf`);
  return blob;
}

export async function exportEpub(book: Manuscript, shouldDownload = true) {
  const readiness = getKdpReadiness(book);
  if (!readiness.ready) throw new Error(readiness.errors[0]);
  const exportBook = normalizeExportBook(book);
  const openerBySection = new Map(
    getLongFormChapterOpeners(book).map((opener) => [opener.sectionIndex, opener]),
  );
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const identifier = `urn:uuid:${exportBook.id}`;
  const sectionFiles = exportBook.sections.map((_, index) => `section-${index + 1}.xhtml`);
  const openerAssets = exportBook.sections.map((section, index) => {
    const opener = openerBySection.get(section.sourceIndex);
    const asset = chapterImageAsset(opener?.imageData);
    return asset
      ? { asset, fileName: `chapter-opener-${index + 1}.${asset.extension}` }
      : null;
  });
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  zip.file("OEBPS/cover.jpg", dataUriToBase64(exportBook.coverImage), { base64: true });
  openerAssets.forEach((entry) => {
    if (entry) zip.file(`OEBPS/${entry.fileName}`, entry.asset.base64, { base64: true });
  });
  zip.file(
    "OEBPS/style.css",
    `html{margin:0;padding:0;max-width:100%;}body{box-sizing:border-box;width:100%;max-width:100%;margin:0;padding:5%;overflow-x:hidden;font-family:serif;line-height:1.45;}main,p,h1,h2,h3,li,figure,img{max-width:100%;overflow-wrap:break-word;word-wrap:break-word;-webkit-hyphens:auto;hyphens:auto;}h1{font-size:1.55em;line-height:1.18;margin:1.25em 0 .85em;}h2{font-size:1.3em;margin:1.4em 0 .7em;}h3{font-size:1.12em;margin:1.3em 0 .6em;}p{margin:.35em 0;}p.fiction{text-indent:1.2em;margin:0;}p.first,p.scene-break{text-indent:0;}p.scene-break{text-align:center;margin:1.25em 0;}nav ol{padding-left:1.4em;}li{margin:.45em 0;}.chapter-opener{margin:0 0 1.25em;page-break-inside:avoid;break-inside:avoid;}.chapter-opener img{display:block;width:100%;height:auto;max-height:75vh;object-fit:contain;margin:0 auto;}.title-page{text-align:center;margin-top:25%;}.title-page h1{font-size:2.2em}.copyright{text-align:center;margin-top:16%;}.copyright-notice{margin-bottom:.55em;}code{font-family:monospace;}`,
  );
  zip.file(
    "OEBPS/title.xhtml",
    xhtmlPage(
      exportBook.title,
      `<main epub:type="titlepage" class="title-page"><h1>${escapeXml(exportBook.title)}</h1>${exportBook.subtitle ? `<p><em>${escapeXml(exportBook.subtitle)}</em></p>` : ""}<p>by ${escapeXml(exportBook.author)}</p></main>`,
    ),
  );
  zip.file(
    "OEBPS/copyright.xhtml",
    xhtmlPage(
      "Copyright",
      `<main epub:type="copyright-page" class="copyright"><p class="copyright-notice">Copyright © ${copyrightYear(exportBook.createdAt)} by ${escapeXml(exportBook.author)}</p><p>All rights reserved.</p></main>`,
    ),
  );

  exportBook.sections.forEach((section, index) => {
    const label = sectionTocLabel(section, exportBook.mode);
    const epubType = sectionEpubType(section, exportBook.mode);
    const blocks = epubBlocks(parseRichBlocks(section.content, section.title, label), exportBook.mode);
    const openerAsset = openerAssets[index];
    const openerImage = openerAsset
      ? `<figure class="chapter-opener"><img src="${openerAsset.fileName}" alt="${escapeXml(`Chapter opener for ${label}`)}"/></figure>`
      : "";
    zip.file(
      `OEBPS/${sectionFiles[index]}`,
      xhtmlPage(section.title, `<main epub:type="${epubType}">${openerImage}<h1 id="section-title">${escapeXml(label)}</h1>${blocks}</main>`),
    );
  });

  const navItems = exportBook.sections
    .map((section, index) => `<li><a href="${sectionFiles[index]}#section-title">${escapeXml(sectionTocLabel(section, exportBook.mode))}</a></li>`)
    .join("");
  zip.file(
    "OEBPS/nav.xhtml",
    xhtmlPage(
      "Contents",
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems}</ol></nav><nav epub:type="landmarks" hidden="hidden"><h2>Landmarks</h2><ol><li><a epub:type="cover" href="cover.jpg">Cover</a></li><li><a epub:type="titlepage" href="title.xhtml">Title Page</a></li><li><a epub:type="bodymatter" href="section-1.xhtml">Start Reading</a></li></ol></nav>`,
    ),
  );

  const ncxPoints = [
    `<navPoint id="title" playOrder="1"><navLabel><text>Title Page</text></navLabel><content src="title.xhtml"/></navPoint>`,
    ...exportBook.sections.map(
      (section, index) => `<navPoint id="section-${index + 1}" playOrder="${index + 2}"><navLabel><text>${escapeXml(sectionTocLabel(section, exportBook.mode))}</text></navLabel><content src="${sectionFiles[index]}#section-title"/></navPoint>`,
    ),
  ].join("");
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${escapeXml(identifier)}"/></head><docTitle><text>${escapeXml(exportBook.title)}</text></docTitle><navMap>${ncxPoints}</navMap></ncx>`,
  );

  const manifestItems = sectionFiles
    .map((file, index) => `<item id="section-${index + 1}" href="${file}" media-type="application/xhtml+xml"/>`)
    .join("");
  const openerManifestItems = openerAssets
    .map((entry, index) => entry
      ? `<item id="chapter-opener-${index + 1}" href="${entry.fileName}" media-type="${entry.asset.mediaType}"/>`
      : "")
    .join("");
  const spineItems = sectionFiles.map((_, index) => `<itemref idref="section-${index + 1}"/>`).join("");
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(exportBook.title)}</dc:title>
    <dc:creator id="creator">${escapeXml(exportBook.author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="rendition:layout">reflowable</meta>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    <item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
    ${manifestItems}${openerManifestItems}
  </manifest>
  <spine toc="ncx"><itemref idref="title"/><itemref idref="copyright"/><itemref idref="nav"/>${spineItems}</spine>
</package>`,
  );

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  if (shouldDownload) downloadBlob(blob, `${exportFilenameStem(exportBook)}.epub`);
  return blob;
}

type CoverTextLayout = {
  lines: string[];
  size: number;
  lineHeight: number;
};

const INTERNAL_COVER_LABEL =
  /\b(?:EB\s*Studio\s*Pro(?:\s*\/\s*KDP\s*Edition)?|KDP\s*(?:Edition|Package)|Export\s*(?:Edition|Package))\b/gi;

export function cleanCustomerFacingCoverText(text: string) {
  return cleanText(text)
    .replace(INTERNAL_COVER_LABEL, "")
    .replace(/(?:\.\.\.|…)+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,:;.!?])/g, "$1")
    .trim();
}

function estimatedCoverTextWidth(text: string, size: number) {
  let units = 0;
  for (const character of text) {
    if (character === " ") units += 0.28;
    else if (/[ilI1.,'`]/.test(character)) units += 0.28;
    else if (/[MW@%&]/.test(character)) units += 0.88;
    else if (/[A-Z0-9]/.test(character)) units += 0.66;
    else units += 0.52;
  }
  return units * size;
}

function wrapCoverText(text: string, maxWidth: number, size: number) {
  const words = cleanText(text).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || estimatedCoverTextWidth(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function fitCoverText(
  text: string,
  maxWidth: number,
  maxLines: number,
  initialSize: number,
  minimumSize: number,
  lineHeightRatio: number,
): CoverTextLayout {
  const safeText = cleanCustomerFacingCoverText(text);
  let size = initialSize;
  let lines = wrapCoverText(safeText, maxWidth, size);
  while (lines.length > maxLines && size > minimumSize) {
    size = Math.max(minimumSize, size - 2);
    lines = wrapCoverText(safeText, maxWidth, size);
  }
  return { lines, size, lineHeight: size * lineHeightRatio };
}

function svgTextLines(
  lines: string[],
  x: number,
  startY: number,
  lineHeight: number,
  attributes: string,
) {
  return lines
    .map((line, index) => `<text x="${x}" y="${startY + index * lineHeight}" ${attributes}>${escapeXml(line)}</text>`)
    .join("");
}

export function createPolishedKdpCoverSvg(book: Manuscript) {
  const width = 1600;
  const height = 2560;
  const titleText = cleanCustomerFacingCoverText(book.title);
  const subtitleText = cleanCustomerFacingCoverText(book.subtitle);
  const authorText = cleanCustomerFacingCoverText(book.author).toUpperCase();
  const title = fitCoverText(titleText, 1260, 7, 124, 52, 1.08);
  const subtitleCandidate = subtitleText
    ? fitCoverText(subtitleText, 1160, 4, 43, 27, 1.3)
    : null;
  const subtitle = subtitleCandidate && subtitleCandidate.lines.length <= 4
    ? subtitleCandidate
    : null;
  const author = fitCoverText(authorText, 1160, 2, 48, 28, 1.2);
  const titleHeight = title.lines.length * title.lineHeight;
  const subtitleHeight = subtitle ? subtitle.lines.length * subtitle.lineHeight : 0;
  const subtitleStart = subtitle ? 300 : 0;
  const titleStart = subtitle
    ? Math.max(590, subtitleStart + subtitleHeight + 120)
    : Math.max(520, 930 - titleHeight / 2);
  const authorStart = 2355 - (author.lines.length - 1) * author.lineHeight;
  const fallbackAtmosphere = `<g id="fallback-atmosphere" aria-hidden="true">
    <circle cx="1230" cy="420" r="520" fill="#0b4f8a" fill-opacity="0.2"/>
    <path d="M330 1810 L800 1260 L1270 1810 Z" fill="#041827" fill-opacity="0.82"/>
    <rect x="535" y="1440" width="530" height="570" fill="#061724"/>
    <path d="M485 1450 L800 1190 L1115 1450 Z" fill="#07131d"/>
    <rect x="735" y="1545" width="130" height="190" rx="3" fill="#e4b86b" fill-opacity="0.88"/>
    <line x1="800" y1="1545" x2="800" y2="1735" stroke="#f7f1e7" stroke-opacity="0.5" stroke-width="5"/>
    <line x1="735" y1="1640" x2="865" y2="1640" stroke="#f7f1e7" stroke-opacity="0.5" stroke-width="5"/>
    <g stroke="#9dc9cf" stroke-opacity="0.2" stroke-width="4">
      <line x1="170" y1="180" x2="60" y2="520"/><line x1="430" y1="80" x2="290" y2="510"/>
      <line x1="730" y1="130" x2="575" y2="610"/><line x1="1040" y1="70" x2="880" y2="565"/>
      <line x1="1370" y1="160" x2="1220" y2="625"/><line x1="1540" y1="510" x2="1370" y2="1035"/>
      <line x1="300" y1="1140" x2="115" y2="1710"/><line x1="1280" y1="1120" x2="1065" y2="1780"/>
    </g>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#03111f"/>
      <stop offset="0.55" stop-color="#0a3a74"/>
      <stop offset="1" stop-color="#0f5d3b"/>
    </linearGradient>
    <linearGradient id="full-cover-shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#020b13" stop-opacity="0.82"/>
      <stop offset="0.22" stop-color="#061d34" stop-opacity="0.56"/>
      <stop offset="0.55" stop-color="#061d34" stop-opacity="0.16"/>
      <stop offset="0.78" stop-color="#05231d" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#020b13" stop-opacity="0.88"/>
    </linearGradient>
    <linearGradient id="title-readability" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#03111f" stop-opacity="0"/>
      <stop offset="0.22" stop-color="#03111f" stop-opacity="0.7"/>
      <stop offset="0.78" stop-color="#03111f" stop-opacity="0.7"/>
      <stop offset="1" stop-color="#03111f" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#base)"/>
  ${fallbackAtmosphere}
  <rect width="${width}" height="${height}" fill="url(#full-cover-shade)"/>
  <rect x="120" y="${Math.max(430, titleStart - 150)}" width="1360" height="${Math.min(1100, titleHeight + subtitleHeight + 330)}" rx="20" fill="url(#title-readability)"/>
  <path d="M104 96 H310 M104 96 V302 M1290 2464 H1496 M1496 2258 V2464" fill="none" stroke="#9ccbb7" stroke-opacity="0.72" stroke-width="4"/>
  <line x1="690" y1="${titleStart - 72}" x2="910" y2="${titleStart - 72}" stroke="#0f5d3b" stroke-width="7"/>
  ${subtitle ? `<g id="official-subtitle">${svgTextLines(subtitle.lines, 800, subtitleStart, subtitle.lineHeight, `text-anchor="middle" fill="#e4e8df" font-family="Georgia, 'Times New Roman', serif" font-size="${subtitle.size}" font-style="italic"`)}</g>` : ""}
  <g id="official-title">${svgTextLines(title.lines, 800, titleStart, title.lineHeight, `text-anchor="middle" fill="#f7f1e7" font-family="Georgia, 'Times New Roman', serif" font-size="${title.size}" font-weight="700"`)}</g>
  <line x1="650" y1="2265" x2="950" y2="2265" stroke="#0f5d3b" stroke-width="5"/>
  <g id="official-author">${svgTextLines(author.lines, 800, authorStart, author.lineHeight, `text-anchor="middle" fill="#f7f1e7" font-family="Arial, Helvetica, sans-serif" font-size="${author.size}" font-weight="700" letter-spacing="3"`)}</g>
</svg>`;
}

export async function exportCover(book: Manuscript, shouldDownload = true) {
  const readiness = getCoverReadiness(book);
  if (!readiness.ready) throw new Error(readiness.errors[0]);
  // Cover Studio's imageData is already the completed customer-facing cover.
  // Passing it through preserves the full-bleed artwork and its single title
  // hierarchy. Re-compositing it here previously added an internal label,
  // redrew the title, and hid most of the artwork behind package-style bands.
  const bytes = dataUriToBytes(book.cover?.imageData ?? "");
  const blob = new Blob([bytes], { type: "image/jpeg" });
  if (shouldDownload) downloadBlob(blob, `${exportFilenameStem(book)}-KDP-Cover.jpg`);
  return blob;
}

export async function exportBundle(book: Manuscript, shouldDownload = true) {
  const readiness = getKdpReadiness(book);
  if (!readiness.ready) throw new Error(readiness.errors[0]);
  const exportBook = normalizeExportBook(book);
  const { default: JSZip } = await import("jszip");
  const [docxBlob, pdfBlob, epubBlob, coverBlob] = await Promise.all([
    exportDocx(book, false),
    exportPdf(book, false),
    exportEpub(book, false),
    exportCover(book, false),
  ]);
  const [docxData, pdfData, epubData, coverData] = await Promise.all([
    docxBlob.arrayBuffer(),
    pdfBlob.arrayBuffer(),
    epubBlob.arrayBuffer(),
    coverBlob.arrayBuffer(),
  ]);
  const filename = exportFilenameStem(exportBook);
  const bundle = new JSZip();
  bundle.file(`${filename}-Kindle-Create.docx`, docxData);
  bundle.file(`${filename}.epub`, epubData);
  bundle.file(`${filename}-KDP-Cover.jpg`, coverData);
  bundle.file(`${filename}-Reference.pdf`, pdfData);
  bundle.file("KDP-UPLOAD-GUIDE.txt", kdpUploadGuide(exportBook));
  const zipBlob = await bundle.generateAsync({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  if (shouldDownload) downloadBlob(zipBlob, `${filename}-KDP-Package.zip`);
  return zipBlob;
}

function kdpUploadGuide(book: NormalizedBook) {
  const filename = exportFilenameStem(book);
  return `EB STUDIO PRO - KDP UPLOAD GUIDE

BOOK: ${book.title}
BOOK TYPE: ${book.mode === "fiction" ? "Fiction" : "Non-Fiction"}
AUTHOR: ${book.author}

PACKAGE CONTENTS
- ${filename}-Kindle-Create.docx - Kindle Create source
- ${filename}.epub - Reflowable ebook alternative
- ${filename}-KDP-Cover.jpg - 1600 x 2560 marketing cover
- ${filename}-Reference.pdf - Fixed-layout review copy

RECOMMENDED KINDLE WORKFLOW
1. Open ${filename}-Kindle-Create.docx in Amazon Kindle Create.
2. Review every chapter, the linked Contents, scene breaks, lists, and formatting.
3. Export a KPF file from Kindle Create.
4. In KDP, upload the KPF as the ebook manuscript.
5. Upload ${filename}-KDP-Cover.jpg separately as the marketing cover.
6. Run KDP's Online Previewer before publishing.

EPUB ALTERNATIVE
You may upload ${filename}.epub instead of KPF. Do not upload KPF and EPUB together; choose one manuscript format.

PDF
The PDF is a polished reference and proofing copy. It is not the recommended reflowable Kindle manuscript and should not replace the KPF or EPUB upload.
`;
}

function xhtmlPage(title: string, body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="UTF-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body>
</html>`;
}

function parseRichBlocks(content: unknown, sectionTitle = "", sectionLabel = ""): RichBlock[] {
  const source = removeLeadingDuplicateHeading(cleanText(content), sectionTitle, sectionLabel);
  const lines = source.split("\n");
  const blocks: RichBlock[] = [];
  let paragraphLines: string[] = [];
  let lastHeadingLevel: 1 | 2 | 3 = 1;

  const flushParagraph = () => {
    const text = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ type: "paragraph", inlines: parseInlineMarkdown(text) });
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    if (/^(?:\*\s*){3,}$/.test(line) || /^-{3,}$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "scene-break" });
      continue;
    }
    const heading = line.match(/^#{2,6}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const requestedLevel = Number(heading[0].match(/^#+/)?.[0].length ?? 2) <= 2 ? 2 : 3;
      const safeLevel = Math.min(requestedLevel, lastHeadingLevel + 1) as 2 | 3;
      blocks.push({ type: "heading", level: safeLevel, inlines: parseInlineMarkdown(heading[1].trim()) });
      lastHeadingLevel = safeLevel;
      continue;
    }
    const unordered = line.match(/^[-*+]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items: InlineToken[][] = [];
      let listIndex = index;
      while (listIndex < lines.length) {
        const candidate = lines[listIndex].trim();
        const match = isOrdered
          ? candidate.match(/^\d+[.)]\s+(.+)$/)
          : candidate.match(/^[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(parseInlineMarkdown(match[1].trim()));
        listIndex += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, items });
      index = listIndex - 1;
      continue;
    }
    paragraphLines.push(line);
  }
  flushParagraph();
  return blocks;
}

function parseInlineMarkdown(value: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ text: value.slice(lastIndex, index) });
    const marker = match[0];
    if (marker.startsWith("**") || marker.startsWith("__")) {
      tokens.push({ text: marker.slice(2, -2), bold: true });
    } else if (marker.startsWith("`")) {
      tokens.push({ text: marker.slice(1, -1), code: true });
    } else {
      tokens.push({ text: marker.slice(1, -1), italics: true });
    }
    lastIndex = index + marker.length;
  }
  if (lastIndex < value.length) tokens.push({ text: value.slice(lastIndex) });
  return tokens.filter((token) => token.text.length > 0);
}

function docxRuns(
  tokens: InlineToken[],
  TextRun: typeof DocxTextRun,
): ParagraphChild[] {
  return tokens.map(
    (token) =>
      new TextRun({
        text: token.text,
        bold: token.bold,
        italics: token.italics,
        font: token.code ? "Courier New" : "Georgia",
      }),
  );
}

function epubBlocks(blocks: RichBlock[], mode: Mode) {
  let firstParagraph = true;
  return blocks
    .map((block) => {
      if (block.type === "scene-break") {
        firstParagraph = true;
        return '<p class="scene-break" role="separator">* * *</p>';
      }
      if (block.type === "heading") {
        firstParagraph = true;
        return `<h${block.level}>${epubInlines(block.inlines)}</h${block.level}>`;
      }
      if (block.type === "list") {
        firstParagraph = true;
        const tag = block.ordered ? "ol" : "ul";
        return `<${tag}>${block.items.map((item) => `<li>${epubInlines(item)}</li>`).join("")}</${tag}>`;
      }
      const className = mode === "fiction" ? ` class="fiction${firstParagraph ? " first" : ""}"` : "";
      firstParagraph = false;
      return `<p${className}>${epubInlines(block.inlines)}</p>`;
    })
    .join("");
}

function epubInlines(tokens: InlineToken[]) {
  return tokens
    .map((token) => {
      const text = escapeXml(token.text);
      if (token.bold) return `<strong>${text}</strong>`;
      if (token.italics) return `<em>${text}</em>`;
      if (token.code) return `<code>${text}</code>`;
      return text;
    })
    .join("");
}

function blockPlainText(block: RichBlock) {
  if (block.type === "scene-break") return "* * *";
  if (block.type === "list") {
    return block.items
      .map((item, index) => `${block.ordered ? `${index + 1}.` : "•"} ${item.map((token) => token.text).join("")}`)
      .join("\n");
  }
  return block.inlines.map((token) => token.text).join("");
}

function removeLeadingDuplicateHeading(content: string, title: string, label: string) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length) {
    const first = lines[0].trim();
    const heading = first.replace(/^#{1,6}\s*/, "").replace(/^[*_]+|[*_]+$/g, "").trim();
    const normalized = normalizeHeading(heading);
    if (normalized === normalizeHeading(title) || normalized === normalizeHeading(label)) {
      lines.shift();
      while (lines.length && !lines[0].trim()) lines.shift();
      continue;
    }
    break;
  }
  return lines.join("\n");
}

function sectionRole(section: NormalizedSection, mode: Mode) {
  if (section.kind === "introduction") return mode === "fiction" ? "Prologue" : "Introduction";
  if (section.kind === "conclusion") return mode === "fiction" ? "Epilogue" : "Conclusion";
  return `Chapter ${section.number}`;
}

function sectionTocLabel(section: NormalizedSection, mode: Mode) {
  const role = sectionRole(section, mode);
  const descriptiveTitle = sectionDescriptiveTitle(section, mode);
  return normalizeHeading(descriptiveTitle) === normalizeHeading(role)
    ? role
    : `${role}: ${descriptiveTitle}`;
}

function sectionDescriptiveTitle(section: NormalizedSection, mode: Mode) {
  const role = sectionRole(section, mode);
  if (normalizeHeading(section.title) === normalizeHeading(role)) return role;
  const rolePrefix = new RegExp(
    `^${escapeRegExp(role)}\\s*[:.\\-–—]\\s*`,
    "i",
  );
  let descriptiveTitle = section.title.trim();
  while (rolePrefix.test(descriptiveTitle)) {
    descriptiveTitle = descriptiveTitle.replace(rolePrefix, "").trim();
  }
  return descriptiveTitle || role;
}

function sectionEpubType(section: NormalizedSection, mode: Mode) {
  if (section.kind === "introduction") return mode === "fiction" ? "prologue" : "introduction";
  if (section.kind === "conclusion") return mode === "fiction" ? "epilogue" : "conclusion";
  return "chapter";
}

function sectionBookmark(index: number) {
  return `chapter-${index + 1}-${index + 1}`;
}

function normalizeHeading(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(value: unknown) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeFilename(value: unknown) {
  return cleanText(value).normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 90) || "eb-studio-pro-book";
}

function downloadBlob(blob: Blob, filename: string) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The generated file was empty.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function normalizeExportBook(book: Manuscript): NormalizedBook {
  const rawSections = Array.isArray(book?.sections) ? book.sections : [];
  const sections = rawSections.map((section, index) => {
    const kind: SectionKind = section?.kind === "introduction" || section?.kind === "conclusion" ? section.kind : "chapter";
    const parsedNumber = Number(section?.number);
    const number = Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : index + 1;
    const fallbackTitle = kind === "introduction" ? (book.mode === "fiction" ? "Prologue" : "Introduction") : kind === "conclusion" ? (book.mode === "fiction" ? "Epilogue" : "Conclusion") : `Chapter ${number}`;
    return {
      sourceIndex: index,
      kind,
      number,
      title: cleanText(section?.title).trim() || fallbackTitle,
      content: cleanText(section?.content),
    };
  });
  return {
    id: cleanText(book?.id).trim() || `eb-studio-pro-${Date.now()}`,
    mode: book?.mode === "nonfiction" ? "nonfiction" : "fiction",
    title: cleanText(book?.title).trim() || "Untitled Book",
    subtitle: cleanText(book?.subtitle).trim(),
    author: cleanText(book?.author).trim() || "Unknown Author",
    createdAt: cleanText(book?.createdAt).trim() || new Date().toISOString(),
    coverImage: typeof book?.cover?.imageData === "string" ? book.cover.imageData : "",
    sections,
  };
}

function copyrightYear(value: string) {
  const year = new Date(value).getUTCFullYear();
  return Number.isFinite(year) ? year : new Date().getUTCFullYear();
}

function dataUriToBase64(dataUri: string) {
  return dataUri.includes(",") ? dataUri.split(",")[1] : dataUri;
}

function dataUriToBytes(dataUri: string) {
  const base64 = dataUriToBase64(dataUri);
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

/**
 * The writer is told never to use an em dash and still produces them, most
 * often to cut a speaker off mid line. Rather than trust the instruction, every
 * export is normalised here: an interrupted line becomes an ellipsis, and any
 * other dash becomes ordinary punctuation.
 */
export function normalizeDashes(value: string) {
  return value
    .replace(/\s*[\u2014\u2013]\s*(?=["'\u201d\u2019]|\n|$)/g, "...")
    .replace(/(\d)\s*\u2013\s*(?=\d)/g, "$1 to ")
    .replace(/\s+[\u2014\u2013]\s+/g, ", ")
    .replace(/[\u2014\u2013]/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\.\.\.\s*\.\.\./g, "...");
}

function cleanText(value: unknown) {
  const input = normalizeDashes(String(value ?? "")).replace(/\r\n?/g, "\n");
  let output = "";
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += input[index] + input[index + 1];
        index += 1;
      } else output += "\uFFFD";
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "\uFFFD";
      continue;
    }
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0xfffe || code === 0xffff) output += " ";
    else output += input[index];
  }
  return output;
}
