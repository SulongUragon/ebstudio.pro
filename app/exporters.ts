import type { Manuscript } from "./book-types";

export async function exportDocx(book: Manuscript, shouldDownload = true) {
  const exportBook = normalizeExportBook(book);
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    ImageRun,
    Packer,
    PageBreak,
    Paragraph,
    TextRun,
  } = await import("docx");

  const coverChildren = exportBook.coverImage
    ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: dataUriToBytes(exportBook.coverImage),
              transformation: { width: 408, height: 612 },
              type: "jpg",
            }),
          ],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ]
    : [
        new Paragraph({ spacing: { before: 2800 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: exportBook.title,
              bold: true,
              size: 52,
              font: "Georgia",
              color: "8F442B",
            }),
          ],
        }),
        ...(exportBook.subtitle
          ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 260 },
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
      ];

  const children = [
    ...coverChildren,
    new Paragraph({ text: "Contents", heading: HeadingLevel.TITLE }),
    ...exportBook.sections.map(
      (section) =>
        new Paragraph({
          text: section.kind === "chapter" ? `Chapter ${section.number}: ${section.title}` : section.title,
          spacing: { after: 120 },
        }),
    ),
    ...exportBook.sections.flatMap((section) => [
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({
        text: exportSectionLabel(section),
        heading: HeadingLevel.HEADING_2,
        spacing: { after: shouldShowExportTitle(section) ? 140 : 320 },
      }),
      ...(shouldShowExportTitle(section)
        ? [
            new Paragraph({
              text: section.title,
              heading: HeadingLevel.TITLE,
              spacing: { after: 320 },
            }),
          ]
        : []),
      ...toPlainParagraphs(section.content, section.title, exportSectionLabel(section)).map(
        (paragraph) =>
          new Paragraph({
            text: paragraph,
            spacing: { after: 180, line: 360 },
          }),
      ),
    ]),
  ];

  const document = new Document({
    creator: exportBook.author,
    title: exportBook.title,
    description: exportBook.subtitle,
    sections: [{ properties: {}, children }],
  });
  const blob = await Packer.toBlob(document);
  if (shouldDownload) {
    downloadBlob(blob, `${safeFilename(exportBook.title)}.docx`);
  }
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
    pdf.setFillColor(244, 241, 233);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  pdf.setTextColor(143, 68, 43);
  pdf.setFont("times", "bold");
  pdf.setFontSize(32);
  const titleLines = pdf.splitTextToSize(exportBook.title, usableWidth - 44);
  pdf.text(titleLines, pageWidth / 2, 285, { align: "center" });
  if (exportBook.subtitle) {
    pdf.setTextColor(94, 90, 83);
    pdf.setFont("times", "italic");
    pdf.setFontSize(15);
    const subtitleLines = pdf.splitTextToSize(exportBook.subtitle, usableWidth - 80);
    pdf.text(subtitleLines, pageWidth / 2, 365, { align: "center" });
  }
  pdf.setTextColor(25, 26, 24);
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
  let contentsY = 118;
  for (const section of exportBook.sections) {
    const label = section.kind === "chapter" ? `Chapter ${section.number}: ${section.title}` : section.title;
    const lines = pdf.splitTextToSize(label, usableWidth);
    if (contentsY + lines.length * 16 > pageHeight - margin) {
      pdf.addPage();
      contentsY = 72;
    }
    pdf.text(lines, margin, contentsY);
    contentsY += lines.length * 16 + 5;
  }

  for (const section of exportBook.sections) {
    pdf.addPage();
    let y = 76;
    pdf.setTextColor(171, 87, 56);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    const sectionLabel =
      section.kind === "chapter"
        ? `CHAPTER ${section.number}`
        : section.kind === "introduction"
          ? "INTRODUCTION"
          : "CONCLUSION";
    pdf.text(sectionLabel, margin, y);
    y += 32;
    if (shouldShowExportTitle(section)) {
      pdf.setTextColor(25, 26, 24);
      pdf.setFont("times", "bold");
      pdf.setFontSize(24);
      const headingLines = pdf.splitTextToSize(section.title, usableWidth);
      pdf.text(headingLines, margin, y);
      y += headingLines.length * 28 + 24;
    }
    pdf.setTextColor(25, 26, 24);
    pdf.setFont("times", "normal");
    pdf.setFontSize(11.5);

    for (const paragraph of toPlainParagraphs(section.content, section.title, sectionLabel)) {
      const lines = pdf.splitTextToSize(paragraph, usableWidth);
      for (const line of lines) {
        if (y + 17 > pageHeight - 62) {
          pdf.addPage();
          y = 68;
          pdf.setFont("times", "normal");
          pdf.setFontSize(11.5);
        }
        pdf.text(line, margin, y);
        y += 17;
      }
      y += 13;
    }
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 2; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setTextColor(126, 122, 115);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(String(page - 1), pageWidth / 2, pageHeight - 28, { align: "center" });
  }
  const blob = pdf.output("blob");
  if (shouldDownload) {
    downloadBlob(blob, `${safeFilename(exportBook.title)}.pdf`);
  }
  return blob;
}

export async function exportEpub(book: Manuscript, shouldDownload = true) {
  const exportBook = normalizeExportBook(book);
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const identifier = `urn:uuid:${exportBook.id}`;
  const sectionFiles = exportBook.sections.map((_, index) => `section-${index + 1}.xhtml`);

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  zip.file(
    "OEBPS/style.css",
    `body{font-family:Georgia,serif;line-height:1.65;color:#191a18;margin:7% 9%}h1,h2{line-height:1.15}h1{color:#8f442b;font-size:2.4em}.cover{text-align:center;padding-top:28%}.cover.generated{padding:0;margin:0}.cover.generated img{display:block;width:100%;height:auto}.cover p{font-style:italic;color:#5f5a53}.kicker{text-transform:uppercase;letter-spacing:.16em;color:#ab5738;font:700 .72em Arial,sans-serif}nav ol{padding-left:1.4em}li{margin:.65em 0}`,
  );
  if (exportBook.coverImage) {
    zip.file("OEBPS/cover.jpg", dataUriToBase64(exportBook.coverImage), { base64: true });
  }
  zip.file(
    "OEBPS/cover.xhtml",
    xhtmlPage(
      exportBook.title,
      exportBook.coverImage
        ? `<main class="cover generated"><img src="cover.jpg" alt="${escapeXml(exportBook.title)} cover"/></main>`
        : `<main class="cover"><h1>${escapeXml(exportBook.title)}</h1>${exportBook.subtitle ? `<p>${escapeXml(exportBook.subtitle)}</p>` : ""}<p>by ${escapeXml(exportBook.author)}</p></main>`,
    ),
  );

  exportBook.sections.forEach((section, index) => {
    const label =
      section.kind === "chapter"
        ? `Chapter ${section.number}`
        : section.kind === "introduction"
          ? "Introduction"
          : "Conclusion";
    const paragraphs = toPlainParagraphs(section.content, section.title, label)
      .map((paragraph) => `<p>${escapeXml(paragraph)}</p>`)
      .join("");
    const visibleTitle = shouldShowExportTitle(section)
      ? `<h1>${escapeXml(section.title)}</h1>`
      : "";
    zip.file(
      `OEBPS/${sectionFiles[index]}`,
      xhtmlPage(
        section.title,
        `<main><p class="kicker">${label}</p>${visibleTitle}${paragraphs}</main>`,
      ),
    );
  });

  const navItems = exportBook.sections
    .map(
      (section, index) =>
        `<li><a href="${sectionFiles[index]}">${escapeXml(section.kind === "chapter" ? `Chapter ${section.number}: ${section.title}` : section.title)}</a></li>`,
    )
    .join("");
  zip.file(
    "OEBPS/nav.xhtml",
    xhtmlPage("Contents", `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems}</ol></nav>`, true),
  );

  const manifestItems = sectionFiles
    .map((file, index) => `<item id="section-${index + 1}" href="${file}" media-type="application/xhtml+xml"/>`)
    .join("");
  const spineItems = sectionFiles
    .map((_, index) => `<itemref idref="section-${index + 1}"/>`)
    .join("");
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${identifier}</dc:identifier>
    <dc:title>${escapeXml(exportBook.title)}</dc:title>
    <dc:creator>${escapeXml(exportBook.author)}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    ${exportBook.coverImage ? '<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>' : ""}
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style.css" media-type="text/css"/>
    ${manifestItems}
  </manifest>
  <spine><itemref idref="cover"/><itemref idref="nav"/>${spineItems}</spine>
</package>`,
  );

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  if (shouldDownload) {
    downloadBlob(blob, `${safeFilename(exportBook.title)}.epub`);
  }
  return blob;
}

export async function exportBundle(book: Manuscript) {
  const exportBook = normalizeExportBook(book);
  const { default: JSZip } = await import("jszip");
  const [docxBlob, pdfBlob, epubBlob] = await Promise.all([
    exportDocx(book, false),
    exportPdf(book, false),
    exportEpub(book, false),
  ]);
  const filename = safeFilename(exportBook.title);
  const bundle = new JSZip();
  bundle.file(`${filename}.docx`, docxBlob);
  bundle.file(`${filename}.pdf`, pdfBlob);
  bundle.file(`${filename}.epub`, epubBlob);
  const zipBlob = await bundle.generateAsync({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  downloadBlob(zipBlob, `${filename}-Complete-Package.zip`);
}

function xhtmlPage(title: string, body: string, nav = false) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"${nav ? ' xmlns:epub="http://www.idpf.org/2007/ops"' : ""} lang="en">
<head><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body>
</html>`;
}

function toPlainParagraphs(content: unknown, sectionTitle = "", sectionLabel = "") {
  return removeLeadingDuplicateHeading(cleanText(content), sectionTitle, sectionLabel)
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/^#{1,4}\s+/gm, "")
        .replace(/^[-*]\s+/gm, "• ")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/`(.*?)`/g, "$1")
        .trim(),
    )
    .filter(Boolean);
}

function removeLeadingDuplicateHeading(content: string, title: string, label: string) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length) {
    const first = lines[0].trim();
    const heading = first.replace(/^#{1,6}\s*/, "").replace(/^[*_]+|[*_]+$/g, "").trim();
    const normalized = normalizeHeading(heading);
    if (
      normalized === normalizeHeading(title) ||
      normalized === normalizeHeading(label)
    ) {
      lines.shift();
      while (lines.length && !lines[0].trim()) lines.shift();
      continue;
    }
    break;
  }
  return lines.join("\n");
}

function exportSectionLabel(section: { kind: string; number: number }) {
  return section.kind === "chapter"
    ? `Chapter ${section.number}`
    : section.kind === "introduction"
      ? "Introduction"
      : "Conclusion";
}

function shouldShowExportTitle(section: { kind: string; number: number; title: string }) {
  return normalizeHeading(section.title) !== normalizeHeading(exportSectionLabel(section));
}

function normalizeHeading(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
  return (
    cleanText(value)
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 90) || "eb-studio-pro-book"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error("The generated file was empty.");
  }
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

function normalizeExportBook(book: Manuscript) {
  const rawSections = Array.isArray(book?.sections) ? book.sections : [];
  const sections = rawSections.map((section, index) => {
    const kind =
      section?.kind === "introduction" || section?.kind === "conclusion"
        ? section.kind
        : "chapter";
    const parsedNumber = Number(section?.number);
    const number = Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : index + 1;
    const fallbackTitle =
      kind === "introduction"
        ? "Introduction"
        : kind === "conclusion"
          ? "Conclusion"
          : `Chapter ${number}`;

    return {
      kind,
      number,
      title: cleanText(section?.title).trim() || fallbackTitle,
      content: cleanText(section?.content),
    };
  });

  return {
    id: cleanText(book?.id).trim() || `eb-studio-pro-${Date.now()}`,
    title: cleanText(book?.title).trim() || "Untitled Book",
    subtitle: cleanText(book?.subtitle).trim(),
    author: cleanText(book?.author).trim() || "Unknown Author",
    coverImage: typeof book?.cover?.imageData === "string" ? book.cover.imageData : "",
    sections,
  };
}

function dataUriToBase64(dataUri: string) {
  return dataUri.includes(",") ? dataUri.split(",")[1] : dataUri;
}

function dataUriToBytes(dataUri: string) {
  const binary = atob(dataUriToBase64(dataUri));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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
      } else {
        output += "\uFFFD";
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "\uFFFD";
      continue;
    }

    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0xfffe || code === 0xffff) {
      output += " ";
      continue;
    }

    output += input[index];
  }

  return output;
}
