import type { Manuscript } from "../book-types";
import {
  drawLongFormChapterOpenerPage,
  getLongFormChapterOpeners,
} from "../longform-chapter-openers";

export async function exportIllustratedPdf(book: Manuscript) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 64;
  const usableWidth = pageWidth - margin * 2;
  const expectedImages = (book.images ?? []).filter((image) => Boolean(image?.imageData)).length;
  const imageBySection = new Map((book.images ?? []).map((image) => [Number(image.sectionIndex), image]));
  const openerBySection = new Map(
    getLongFormChapterOpeners(book).map((opener) => [opener.sectionIndex, opener]),
  );
  let embeddedImages = 0;

  if (book.cover?.imageData) {
    pdf.addImage(book.cover.imageData, imageFormat(book.cover.imageData), 0, 0, pageWidth, pageHeight);
  } else {
    pdf.setFont("times", "bold");
    pdf.setFontSize(30);
    pdf.text(pdf.splitTextToSize(book.title || "Untitled Book", usableWidth), pageWidth / 2, 280, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.text(`by ${book.author || "Unknown Author"}`, pageWidth / 2, 460, { align: "center" });
  }

  pdf.addPage();
  pdf.setFont("times", "bold");
  pdf.setFontSize(24);
  pdf.text("Contents", margin, 82);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  let tocY = 118;
  book.sections.forEach((section, index) => {
    if (tocY > pageHeight - 70) { pdf.addPage(); tocY = 82; }
    pdf.text(sectionLabel(book, section, index), margin, tocY);
    tocY += 18;
  });

  for (let index = 0; index < book.sections.length; index += 1) {
    const section = book.sections[index];
    const illustration = imageBySection.get(index);
    const opener = openerBySection.get(index);
    if (opener) {
      pdf.addPage();
      const result = drawLongFormChapterOpenerPage(pdf, opener, pageWidth, pageHeight);
      if (result.usedImage) embeddedImages += 1;
    } else if (illustration?.imageData) {
      pdf.addPage();
      const format = imageFormat(illustration.imageData);
      const props = pdf.getImageProperties(illustration.imageData);
      const maxWidth = pageWidth - 72;
      const maxHeight = pageHeight - 100;
      const ratio = props.width / props.height;
      let width = maxWidth;
      let height = width / ratio;
      if (height > maxHeight) { height = maxHeight; width = height * ratio; }
      pdf.addImage(illustration.imageData, format, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
      embeddedImages += 1;
    }

    pdf.addPage();
    let y = 76;
    if (!opener) {
      pdf.setFont("times", "bold");
      pdf.setFontSize(22);
      const headingLines = pdf.splitTextToSize(sectionLabel(book, section, index), usableWidth);
      pdf.text(headingLines, margin, y);
      y += headingLines.length * 27 + 20;
    }
    pdf.setFont("times", "normal");
    pdf.setFontSize(11.5);
    const paragraphs = cleanBody(section.content).split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      const lines = pdf.splitTextToSize(paragraph, usableWidth);
      for (const line of lines) {
        if (y + 17 > pageHeight - 62) { pdf.addPage(); y = 68; pdf.setFont("times", "normal"); pdf.setFontSize(11.5); }
        pdf.text(line, margin, y);
        y += 17;
      }
      y += 10;
    }
  }

  if (expectedImages > 0 && embeddedImages !== expectedImages) throw new Error(`Illustrated PDF stopped because only ${embeddedImages} of ${expectedImages} saved images were embedded. No incomplete PDF was downloaded.`);
  const blob = pdf.output("blob");
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error("The illustrated PDF was empty.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(book.title)}-Illustrated.pdf`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function imageFormat(dataUri: string): "JPEG" | "PNG" | "WEBP" {
  const match = String(dataUri).match(/^data:image\/(jpeg|jpg|png|webp);base64,/i);
  if (!match) throw new Error("A saved book image has an unsupported format. Expected JPEG, PNG, or WebP data.");
  const mime = match[1].toLowerCase();
  return mime === "png" ? "PNG" : mime === "webp" ? "WEBP" : "JPEG";
}

function sectionLabel(book: Manuscript, section: Manuscript["sections"][number], index: number) {
  if (section.kind === "introduction") return book.mode === "fiction" ? `Prologue: ${section.title}` : `Introduction: ${section.title}`;
  if (section.kind === "conclusion") return book.mode === "fiction" ? `Epilogue: ${section.title}` : `Conclusion: ${section.title}`;
  return `Chapter ${section.number || index + 1}: ${section.title}`;
}
function cleanBody(value: string) { return String(value ?? "").replace(/^#{1,6}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\r\n?/g, "\n"); }
function safeFilename(value: string) { return String(value || "eb-studio-pro-book").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 90) || "eb-studio-pro-book"; }
