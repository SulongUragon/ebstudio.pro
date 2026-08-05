import type { Manuscript, Mode, SectionKind } from "./book-types";
import type { ParagraphChild, TextRun as DocxTextRun } from "docx";

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
 */
export function shortSectionIndexes(
  sections: Array<{ content?: string } | undefined>,
) {
  const lengths = sections.map(sectionTextLength);
  const solid = lengths.filter((length) => length >= MIN_SECTION_CHARACTERS);
  if (solid.length < 3) return [];
  const sorted = [...solid].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return lengths.reduce<number[]>((found, length, index) => {
    if (length >= MIN_SECTION_CHARACTERS && length < median * 0.35) {
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

  if (title.length > 180) warnings.push("The title is unusually long; inspect its cover fit carefully.");
  return { ready: errors.length === 0, errors, warnings };
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

export async function exportPdf(book: Manuscript, shouldDownload = true) {
  const exportBook = normalizeExportBook(book);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 64;
  const usableWidth = pageWidth - margin * 2;

  if (exportBook.coverImage) {
    pdf.addImage(exportBook.coverImage, "JPEG", 0, 0, pageWidth, pageHeight);
  } else {
    pdf.setFont("times", "bold");
    pdf.setFontSize(32);
    pdf.text(pdf.splitTextToSize(exportBook.title, usableWidth), pageWidth / 2, 285, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.text(`by ${exportBook.author}`, pageWidth / 2, 470, { align: "center" });
  }

  pdf.addPage();
  pdf.setFont("times", "bold");
  pdf.setFontSize(25);
  pdf.text("Contents", margin, 82);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  exportBook.sections.forEach((section, index) => {
    pdf.text(sectionTocLabel(section, exportBook.mode), margin, 118 + index * 20);
  });

  for (const section of exportBook.sections) {
    pdf.addPage();
    let y = 82;
    pdf.setFont("times", "bold");
    pdf.setFontSize(24);
    pdf.text(pdf.splitTextToSize(sectionTocLabel(section, exportBook.mode), usableWidth), margin, y);
    y += 52;
    pdf.setFont("times", "normal");
    pdf.setFontSize(11.5);
    for (const block of parseRichBlocks(section.content, section.title, sectionTocLabel(section, exportBook.mode))) {
      const text = blockPlainText(block);
      if (!text) continue;
      const lines = pdf.splitTextToSize(text, usableWidth);
      for (const line of lines) {
        if (y + 17 > pageHeight - 62) {
          pdf.addPage();
          y = 68;
        }
        pdf.text(line, margin, y);
        y += 17;
      }
      y += 11;
    }
  }

  const blob = pdf.output("blob");
  if (shouldDownload) downloadBlob(blob, `${exportFilenameStem(exportBook)}-Reference.pdf`);
  return blob;
}

export async function exportEpub(book: Manuscript, shouldDownload = true) {
  const readiness = getKdpReadiness(book);
  if (!readiness.ready) throw new Error(readiness.errors[0]);
  const exportBook = normalizeExportBook(book);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const identifier = `urn:uuid:${exportBook.id}`;
  const sectionFiles = exportBook.sections.map((_, index) => `section-${index + 1}.xhtml`);
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
  zip.file(
    "OEBPS/style.css",
    `html{margin:0;padding:0;max-width:100%;}body{box-sizing:border-box;width:100%;max-width:100%;margin:0;padding:5%;overflow-x:hidden;font-family:serif;line-height:1.45;}main,p,h1,h2,h3,li{max-width:100%;overflow-wrap:break-word;word-wrap:break-word;-webkit-hyphens:auto;hyphens:auto;}h1{font-size:1.55em;line-height:1.18;margin:1.25em 0 .85em;}h2{font-size:1.3em;margin:1.4em 0 .7em;}h3{font-size:1.12em;margin:1.3em 0 .6em;}p{margin:.35em 0;}p.fiction{text-indent:1.2em;margin:0;}p.first,p.scene-break{text-indent:0;}p.scene-break{text-align:center;margin:1.25em 0;}nav ol{padding-left:1.4em;}li{margin:.45em 0;}.title-page{text-align:center;margin-top:25%;}.title-page h1{font-size:2.2em}.copyright{text-align:center;margin-top:16%;}.copyright-notice{margin-bottom:.55em;}code{font-family:monospace;}`,
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
    zip.file(
      `OEBPS/${sectionFiles[index]}`,
      xhtmlPage(section.title, `<main epub:type="${epubType}"><h1 id="section-title">${escapeXml(label)}</h1>${blocks}</main>`),
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
    ${manifestItems}
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

export async function exportCover(book: Manuscript, shouldDownload = true) {
  const readiness = getCoverReadiness(book);
  if (!readiness.ready) throw new Error(readiness.errors[0]);
  const bytes = dataUriToBytes(book.cover?.imageData ?? "");
  const blob = new Blob([bytes], { type: "image/jpeg" });
  if (shouldDownload) downloadBlob(blob, `${exportFilenameStem(book)}-KDP-Cover.jpg`);
  return blob;
}

export async function exportBundle(book: Manuscript) {
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
  const filename = exportFilenameStem(exportBook);
  const bundle = new JSZip();
  bundle.file(`${filename}-Kindle-Create.docx`, docxBlob);
  bundle.file(`${filename}.epub`, epubBlob);
  bundle.file(`${filename}-KDP-Cover.jpg`, coverBlob);
  bundle.file(`${filename}-Reference.pdf`, pdfBlob);
  bundle.file("KDP-UPLOAD-GUIDE.txt", kdpUploadGuide(exportBook));
  const zipBlob = await bundle.generateAsync({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  downloadBlob(zipBlob, `${filename}-KDP-Package.zip`);
}

function kdpUploadGuide(book: NormalizedBook) {
  const filename = exportFilenameStem(book);
  return `EB STUDIO PRO — KDP UPLOAD GUIDE

BOOK: ${book.title}
BOOK TYPE: ${book.mode === "fiction" ? "Fiction" : "Non-Fiction"}
AUTHOR: ${book.author}

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
The PDF is a reference copy. It is not the recommended reflowable Kindle manuscript.
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
  if (normalizeHeading(section.title) === normalizeHeading(role)) return role;
  const rolePrefix = new RegExp(
    `^${escapeRegExp(role)}\\s*[:.\\-–—]\\s*`,
    "i",
  );
  let descriptiveTitle = section.title.trim();
  while (rolePrefix.test(descriptiveTitle)) {
    descriptiveTitle = descriptiveTitle.replace(rolePrefix, "").trim();
  }
  return descriptiveTitle ? `${role}: ${descriptiveTitle}` : role;
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
    return { kind, number, title: cleanText(section?.title).trim() || fallbackTitle, content: cleanText(section?.content) };
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

function cleanText(value: unknown) {
  const input = String(value ?? "").replace(/\r\n?/g, "\n");
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
