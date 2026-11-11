import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import JSZip from "jszip";
import type { Manuscript } from "../app/book-types";
import { exportBundle, exportFilenameStem } from "../app/exporters";
import {
  buildNarrationScript,
  createPaperbackPdf,
  exportNarrationScript,
  formatRuntime,
  getPaperbackReadiness,
  kdpMinimumGutterInches,
  narrationFilename,
  paperbackFilename,
  splitSentences,
  type PrintFontLoader,
} from "../app/print-exporters";
import {
  createLongFictionManuscript,
  createLongNonfictionManuscript,
} from "./fixtures/publishing-manuscripts";

const fontLoader: PrintFontLoader = async (fileName) =>
  new Uint8Array(await readFile(join(process.cwd(), "public", "fonts", "eb-garamond", fileName)));

function pdfText(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes);
}

function mediaBoxes(source: string) {
  return [...source.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((match) =>
    match[1].trim().split(/\s+/).map(Number),
  );
}

function stretchedBook(base: Manuscript, repeat: number): Manuscript {
  return {
    ...base,
    sections: base.sections.map((section) => ({
      ...section,
      content: Array.from({ length: repeat }, () => section.content).join("\n\n"),
    })),
  };
}

test("KDP gutter follows the page count bands", () => {
  assert.equal(kdpMinimumGutterInches(24), 0.375);
  assert.equal(kdpMinimumGutterInches(150), 0.375);
  assert.equal(kdpMinimumGutterInches(151), 0.5);
  assert.equal(kdpMinimumGutterInches(300), 0.5);
  assert.equal(kdpMinimumGutterInches(301), 0.625);
  assert.equal(kdpMinimumGutterInches(501), 0.75);
  assert.equal(kdpMinimumGutterInches(701), 0.875);
});

for (const create of [createLongFictionManuscript, createLongNonfictionManuscript]) {
  test(`${create.name} lays out as a 6 x 9 KDP paperback interior`, async () => {
    const book = stretchedBook(create(), 3);
    assert.ok(getPaperbackReadiness(book).ready);
    const report = await createPaperbackPdf(book, { trim: "6x9", fontLoader });
    const bytes = new Uint8Array(await report.blob.arrayBuffer());
    const source = pdfText(bytes);

    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    assert.ok(report.pageCount >= 24, `expected at least 24 pages, got ${report.pageCount}`);
    const boxes = mediaBoxes(source);
    assert.equal(boxes.length, report.pageCount);
    for (const box of boxes) assert.deepEqual(box, [0, 0, 432, 648]);

    assert.equal(report.gutterInches, kdpMinimumGutterInches(report.pageCount));
    assert.equal(report.insideMarginInches, report.gutterInches + 0.125);

    // Every section opens on a right-hand (odd) page, and in order.
    assert.equal(report.sectionStartPages.length, book.sections.length);
    for (const page of report.sectionStartPages) assert.equal(page % 2, 1);
    assert.deepEqual([...report.sectionStartPages].sort((a, b) => a - b), report.sectionStartPages);

    // Only the embedded EB Garamond faces are referenced. No unembedded base fonts.
    assert.match(source, /FontFile2/);
    assert.doesNotMatch(source, /\/BaseFont \/(?:Helvetica|Times|Courier)/);
  });
}

test("paperback trims change the page size", async () => {
  const book = stretchedBook(createLongFictionManuscript(), 3);
  const report = await createPaperbackPdf(book, { trim: "5x8", fontLoader });
  const boxes = mediaBoxes(pdfText(new Uint8Array(await report.blob.arrayBuffer())));
  assert.deepEqual(boxes[0], [0, 0, 360, 576]);
  assert.equal(paperbackFilename(book, "5x8"), `${exportFilenameStem(book)}-Paperback-5x8.pdf`);
});

test("a book too short for KDP print is refused with a clear reason", async () => {
  const base = createLongFictionManuscript();
  const book: Manuscript = {
    ...base,
    plan: base.plan.slice(0, 1),
    sections: base.sections.slice(0, 1),
  };
  await assert.rejects(createPaperbackPdf(book, { fontLoader }), /at least 24/);
});

test("paperback readiness does not require the ebook cover", () => {
  const book = { ...createLongFictionManuscript(), cover: undefined };
  assert.ok(getPaperbackReadiness(book).ready);
});

test("sentences split one per prompter line", () => {
  assert.deepEqual(
    splitSentences('She stopped. "Who is there?" Nobody answered... The door held.'),
    ["She stopped.", '"Who is there?"', "Nobody answered...", "The door held."],
  );
  assert.equal(formatRuntime(45), "45 min");
  assert.equal(formatRuntime(150), "2 hr 30 min");
});

test("narration script is a dash-free DOCX with cues and runtime", async () => {
  const book = createLongFictionManuscript();
  book.sections[0].content = `${book.sections[0].content}\n\nHe waited \u2014 then spoke \u2013 softly.`;
  const script = buildNarrationScript(book);
  assert.ok(script.totalWords > 0);
  assert.equal(script.sectionRuntimes.length, book.sections.length);

  const blob = await exportNarrationScript(book, false);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  assert.match(xml, /NARRATION SCRIPT/);
  assert.match(xml, /OPENING CREDITS/);
  assert.match(xml, /PAUSE 2 SECONDS/);
  assert.match(xml, /CLOSING CREDITS/);
  assert.match(xml, /Estimated runtime/);
  assert.doesNotMatch(xml, /[\u2014\u2013]/);
  assert.equal(narrationFilename(book), `${exportFilenameStem(book)}-Narration-Script.docx`);
});

test("KDP package includes the paperback interior and narration script", async () => {
  const book = stretchedBook(createLongNonfictionManuscript(), 3);
  const filename = exportFilenameStem(book);
  const blob = await exportBundle(book, false, { paperbackTrim: "6x9", fontLoader });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const paperback = await zip.file(`${filename}-Paperback-6x9.pdf`)?.async("uint8array");
  const narration = await zip.file(`${filename}-Narration-Script.docx`)?.async("uint8array");
  const guide = (await zip.file("KDP-UPLOAD-GUIDE.txt")?.async("string")) ?? "";
  assert.ok(paperback && narration);
  assert.equal(new TextDecoder().decode(paperback.slice(0, 5)), "%PDF-");
  assert.deepEqual([...narration.slice(0, 2)], [0x50, 0x4b]);
  assert.match(guide, /PAPERBACK/);
  assert.match(guide, /6 × 9 in/);
  assert.match(guide, /Paperback-6x9\.pdf/);
  assert.match(guide, /Narration-Script\.docx/);
});

test("KDP package still exports when the book is too short for print", async () => {
  const base = createLongFictionManuscript();
  const book: Manuscript = { ...base, plan: base.plan.slice(0, 1), sections: base.sections.slice(0, 1) };
  const filename = exportFilenameStem(book);
  const zip = await JSZip.loadAsync(await (await exportBundle(book, false, { fontLoader })).arrayBuffer());
  assert.ok(zip.file(`${filename}-Kindle-Create.docx`));
  assert.equal(zip.file(`${filename}-Paperback-6x9.pdf`), null);
  const guide = (await zip.file("KDP-UPLOAD-GUIDE.txt")?.async("string")) ?? "";
  assert.match(guide, /paperback interior was not included/);
});
