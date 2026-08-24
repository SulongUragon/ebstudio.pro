import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import type { Manuscript } from "../app/book-types";
import {
  exportBundle,
  exportCover,
  exportDocx,
  exportEpub,
  exportFilenameStem,
  exportPdf,
  getCoverReadiness,
  getKdpReadiness,
  MIN_SECTION_CHARACTERS,
} from "../app/exporters";
import {
  createLongFictionManuscript,
  createLongNonfictionManuscript,
} from "./fixtures/publishing-manuscripts";

const onePixelJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";

function completeFixtureSection(opening: string) {
  const paragraphs = Array.from({ length: 9 }, (_, index) =>
    `Mara followed the quiet evidence through the house, testing each detail before she trusted it. The ${index + 1} clue changed how she understood the door, the letter, and the choice waiting beyond the hallway. She recorded what she knew, separated it from what she feared, and continued only when the next action was clear.`,
  );
  return `${opening}\n\n${paragraphs.join("\n\n")}`;
}

function sampleBook(): Manuscript {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    mode: "fiction",
    title: "The Exact KDP Export",
    subtitle: "A structural test",
    author: "Sulong",
    createdAt: "2026-08-03T00:00:00.000Z",
    brief: {
      title: "The Exact KDP Export",
      author: "Sulong",
      genre: "Literary fiction",
      characters: "Mara",
      premise: "A quiet night changes everything.",
      topic: "",
      audience: "Adult readers",
      keyPoints: "",
      chapterCount: 1,
    },
    plan: [
      { kind: "introduction", title: "Prologue", purpose: "Open" },
      { kind: "chapter", number: 1, title: "The Door", purpose: "Escalate" },
      { kind: "conclusion", title: "Epilogue", purpose: "Resolve" },
    ],
    sections: [
      {
        kind: "introduction",
        title: "Prologue",
        purpose: "Open",
        content: completeFixtureSection(
          "# Prologue\n\n*Listen,* she told herself.\n\nThe hallway answered.",
        ),
        summary: "Mara listens.",
      },
      {
        kind: "chapter",
        number: 1,
        title: "The Door",
        purpose: "Escalate",
        content: completeFixtureSection(
          "# The Door\n\nThe key **turned**.\n\n***\n\n### What She Found\n\n- A photograph\n- A sealed letter\n\n1. Breathe\n2. Open it",
        ),
        summary: "The door opens.",
      },
      {
        kind: "conclusion",
        title: "Epilogue",
        purpose: "Resolve",
        content: completeFixtureSection(
          "# Epilogue\n\nShe finally *felt* the morning.",
        ),
        summary: "Morning arrives.",
      },
    ],
    cover: {
      imageData: onePixelJpeg,
      sourceImageData: onePixelJpeg,
      width: 1600,
      height: 2560,
      style: "cinematic",
      finish: "satin",
      displayTitle: "The Exact KDP Export",
      displaySubtitle: "A structural test",
      createdAt: "2026-08-03T00:00:00.000Z",
    },
  };
}

test("dual-book downloads include the book type in every filename stem", () => {
  const fiction = sampleBook();
  const nonfiction: Manuscript = { ...fiction, mode: "nonfiction" };
  assert.equal(
    exportFilenameStem(fiction),
    "The-Exact-KDP-Export-Fiction",
  );
  assert.equal(
    exportFilenameStem(nonfiction),
    "The-Exact-KDP-Export-Non-Fiction",
  );
});

test("KDP readiness requires the exact cover package", () => {
  const book = sampleBook();
  assert.equal(getKdpReadiness(book).ready, true);
  const withoutCover = { ...book, cover: undefined };
  const result = getKdpReadiness(withoutCover);
  assert.equal(result.ready, false);
  assert.match(result.errors.join(" "), /cover/i);
});

test("cover export stays available when manuscript text is incomplete", async () => {
  const book = sampleBook();
  const incomplete = {
    ...book,
    sections: book.sections.map((section, index) =>
      index === 1 ? { ...section, content: "" } : section,
    ),
  };
  assert.equal(getKdpReadiness(incomplete).ready, false);
  assert.equal(getCoverReadiness(incomplete).ready, true);
  const cover = await exportCover(incomplete, false);
  assert.ok(cover.size > 0);
});

test("DOCX export uses semantic headings, links, and true italics", async () => {
  const blob = await exportDocx(sampleBook(), false);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");
  const stylesXml = await zip.file("word/styles.xml")?.async("string");
  assert.ok(documentXml);
  assert.ok(stylesXml);
  assert.match(documentXml, /w:anchor="chapter-1-1"/);
  assert.match(documentXml, /w:pStyle w:val="Heading1"/);
  assert.match(documentXml, /Prologue/);
  assert.match(documentXml, /Chapter 1: The Door/);
  assert.match(documentXml, /Epilogue/);
  assert.match(documentXml, /<w:i\/?/);
  assert.doesNotMatch(documentXml, /\*Listen,\*/);
  assert.doesNotMatch(documentXml, /w:pStyle w:val="Heading3"/);
  assert.equal(Object.keys(zip.files).some((name) => name.startsWith("word/media/")), false);
  assert.match(stylesXml, /KdpFictionBody/);
});

test("PDF export produces a non-empty reference PDF", async () => {
  const blob = await exportPdf(sampleBook(), false);
  const signature = new TextDecoder().decode(
    new Uint8Array(await blob.slice(0, 5).arrayBuffer()),
  );
  assert.equal(blob.type, "application/pdf");
  assert.equal(signature, "%PDF-");
  assert.ok(blob.size > 1_000);
});

test("EPUB export includes EPUB3 navigation, NCX fallback, cover metadata, and rich text", async () => {
  const blob = await exportEpub(sampleBook(), false);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const mimetype = await zip.file("mimetype")?.async("string");
  const opf = await zip.file("OEBPS/content.opf")?.async("string");
  const nav = await zip.file("OEBPS/nav.xhtml")?.async("string");
  const copyright = await zip.file("OEBPS/copyright.xhtml")?.async("string");
  const stylesheet = await zip.file("OEBPS/style.css")?.async("string");
  const prologue = await zip.file("OEBPS/section-1.xhtml")?.async("string");
  const chapter = await zip.file("OEBPS/section-2.xhtml")?.async("string");
  const epilogue = await zip.file("OEBPS/section-3.xhtml")?.async("string");
  assert.equal(mimetype, "application/epub+zip");
  assert.ok(opf && nav && copyright && stylesheet && prologue && chapter && epilogue);
  assert.ok(zip.file("OEBPS/cover.jpg"));
  assert.ok(zip.file("OEBPS/toc.ncx"));
  assert.equal(Boolean(zip.file("OEBPS/cover.xhtml")), false);
  assert.match(opf, /properties="cover-image"/);
  assert.match(opf, /properties="nav"/);
  assert.match(opf, /spine toc="ncx"/);
  assert.match(nav, /epub:type="toc"/);
  assert.match(nav, /epub:type="landmarks"/);
  assert.match(nav, /Chapter 1: The Door/);
  assert.doesNotMatch(copyright, /<h1>Copyright<\/h1>/);
  assert.match(copyright, /class="copyright-notice"/);
  assert.match(stylesheet, /box-sizing:border-box/);
  assert.match(stylesheet, /overflow-x:hidden/);
  assert.match(prologue, /epub:type="prologue"/);
  assert.match(epilogue, /epub:type="epilogue"/);
  assert.match(chapter, /<strong>turned<\/strong>/);
  assert.match(chapter, /<h2>What She Found<\/h2>/);
  assert.doesNotMatch(chapter, /<h3>What She Found<\/h3>/);
  assert.match(chapter, /<ul><li>A photograph<\/li><li>A sealed letter<\/li><\/ul>/);
  assert.match(epilogue, /<em>felt<\/em>/);
  assert.doesNotMatch(epilogue, /\*felt\*/);
});

test("EPUB normalizes repeated structural labels in section titles", async () => {
  const book = sampleBook();
  book.sections[0].title = "Prologue: Prologue: The Last Binding";
  book.sections[0].content = completeFixtureSection(
    "# Prologue: The Last Binding\n\nThe ink moved.",
  );
  book.sections[1].title = "Chapter 1: The Door";
  book.sections[2].title = "Epilogue: Epilogue: Morning";

  const blob = await exportEpub(book, false);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const nav = await zip.file("OEBPS/nav.xhtml")?.async("string");
  const prologue = await zip.file("OEBPS/section-1.xhtml")?.async("string");
  const chapter = await zip.file("OEBPS/section-2.xhtml")?.async("string");
  const epilogue = await zip.file("OEBPS/section-3.xhtml")?.async("string");

  assert.ok(nav && prologue && chapter && epilogue);
  assert.match(prologue, /<h1 id="section-title">Prologue: The Last Binding<\/h1>/);
  assert.match(chapter, /<h1 id="section-title">Chapter 1: The Door<\/h1>/);
  assert.match(epilogue, /<h1 id="section-title">Epilogue: Morning<\/h1>/);
  assert.doesNotMatch(nav, /Prologue: Prologue:/);
  assert.doesNotMatch(nav, /Chapter 1: Chapter 1:/);
  assert.doesNotMatch(nav, /Epilogue: Epilogue:/);
});

test("KDP bundle contains every standard publishing deliverable", async () => {
  const book = sampleBook();
  const filename = exportFilenameStem(book);
  const blob = await exportBundle(book, false);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  assert.equal(blob.type, "application/zip");
  assert.ok(zip.file(`${filename}-Kindle-Create.docx`));
  assert.ok(zip.file(`${filename}.epub`));
  assert.ok(zip.file(`${filename}-KDP-Cover.jpg`));
  assert.ok(zip.file(`${filename}-Reference.pdf`));
  const guide = await zip.file("KDP-UPLOAD-GUIDE.txt")?.async("string");
  assert.match(guide ?? "", new RegExp(`${filename}-Kindle-Create\\.docx`));
  assert.match(guide ?? "", new RegExp(`${filename}\\.epub`));
});

const publishingQaBooks = [
  createLongFictionManuscript,
  createLongNonfictionManuscript,
] as const;

function xmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function blobBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

test("realistic fiction and nonfiction fixtures satisfy KDP readiness without weakening its floor", () => {
  for (const createBook of publishingQaBooks) {
    const book = createBook();
    assert.equal(book.sections.length, 10);
    assert.equal(book.plan.length, book.sections.length);
    assert.ok(book.author.trim());
    assert.ok(book.sections.every((section) => section.content.length >= MIN_SECTION_CHARACTERS));
    assert.equal(getCoverReadiness(book).ready, true);
    assert.equal(getKdpReadiness(book).ready, true);
  }

  const fiction = createLongFictionManuscript();
  assert.equal(fiction.subtitle, "");
  const truncated = {
    ...fiction,
    sections: fiction.sections.map((section, index) =>
      index === 4 ? { ...section, content: "A short fragment." } : section,
    ),
  };
  const readiness = getKdpReadiness(truncated);
  assert.equal(readiness.ready, false);
  assert.match(readiness.errors.join(" "), /stopped early/i);

  const nonfiction = createLongNonfictionManuscript();
  assert.ok(nonfiction.title.length > 180);
  assert.match(getKdpReadiness(nonfiction).warnings.join(" "), /title is unusually long/i);
});

test("long-form DOCX exports preserve every section, navigation link, and special character", async () => {
  for (const createBook of publishingQaBooks) {
    const book = createBook();
    const blob = await exportDocx(book, false);
    assert.ok(blob instanceof Blob);
    assert.ok(blob.size > 10_000);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")?.async("string");
    const stylesXml = await zip.file("word/styles.xml")?.async("string");
    const coreXml = await zip.file("docProps/core.xml")?.async("string");
    assert.ok(documentXml && stylesXml && coreXml);
    assert.match(coreXml, new RegExp(xmlText(book.title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(coreXml, new RegExp(xmlText(book.author).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(documentXml.match(/w:anchor="chapter-\d+-\d+"/g)?.length, book.sections.length);
    assert.equal(documentXml.match(/w:pStyle w:val="Heading1"/g)?.length, book.sections.length);
    assert.match(documentXml, /&lt;(?:Left Open|Unverified Claims)&gt;/);
    assert.match(documentXml, /&amp;/);
    assert.match(stylesXml, book.mode === "fiction" ? /KdpFictionBody/ : /KdpNonfictionBody/);
  }
});

test("long-form EPUB exports preserve complete navigation, safe XML, and readable section flow", async () => {
  for (const createBook of publishingQaBooks) {
    const book = createBook();
    const blob = await exportEpub(book, false);
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, "application/epub+zip");
    assert.ok(blob.size > 5_000);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const entries = Object.keys(zip.files);
    const opf = await zip.file("OEBPS/content.opf")?.async("string");
    const nav = await zip.file("OEBPS/nav.xhtml")?.async("string");
    const container = await zip.file("META-INF/container.xml")?.async("string");
    const titlePage = await zip.file("OEBPS/title.xhtml")?.async("string");
    assert.equal(await zip.file("mimetype")?.async("string"), "application/epub+zip");
    assert.ok(opf && nav && container && titlePage);
    assert.equal(entries.filter((name) => /^OEBPS\/section-\d+\.xhtml$/.test(name)).length, book.sections.length);
    assert.match(container, /full-path="OEBPS\/content\.opf"/);
    assert.match(opf, /properties="nav"/);
    assert.match(opf, /properties="cover-image"/);

    for (let index = 0; index < book.sections.length; index += 1) {
      const sectionName = `section-${index + 1}.xhtml`;
      const section = await zip.file(`OEBPS/${sectionName}`)?.async("string");
      assert.ok(section, sectionName);
      assert.match(nav, new RegExp(`${sectionName}#section-title`));
      assert.match(opf, new RegExp(`idref="section-${index + 1}"`));
      assert.ok((section.match(/<p(?:\s|>)/g) ?? []).length >= 7, `${sectionName} should keep paragraph flow`);
    }

    const specialSection = await zip.file("OEBPS/section-4.xhtml")?.async("string");
    assert.match(specialSection ?? "", /&lt;(?:Left Open|Unverified Claims)&gt;/);
    assert.match(specialSection ?? "", /&amp;/);
    assert.doesNotMatch(specialSection ?? "", /<(?:Left Open|Unverified Claims)>/);
    if (book.subtitle) assert.match(titlePage, new RegExp(xmlText(book.subtitle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    else assert.doesNotMatch(titlePage, /<em><\/em>/);
  }
});

test("long-form reference PDFs produce multipage files without title or section crashes", async () => {
  for (const createBook of publishingQaBooks) {
    const book = createBook();
    const blob = await exportPdf(book, false);
    const bytes = await blobBytes(blob);
    const source = new TextDecoder("latin1").decode(bytes);
    const pageCount = source.match(/\/Type \/Page\b/g)?.length ?? 0;
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, "application/pdf");
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    assert.ok(blob.size > 20_000);
    assert.ok(pageCount >= book.sections.length + 2, `expected at least ${book.sections.length + 2} PDF pages`);
  }
});

test("long-title KDP cover exports remain valid JPEG blobs", async () => {
  for (const createBook of publishingQaBooks) {
    const book = createBook();
    const blob = await exportCover(book, false);
    const bytes = await blobBytes(blob);
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, "image/jpeg");
    assert.ok(blob.size > 0);
    assert.deepEqual([...bytes.slice(0, 2)], [0xff, 0xd8]);
    assert.deepEqual([...bytes.slice(-2)], [0xff, 0xd9]);
  }
});

test("long-form KDP bundles contain readable standard files through the headless-safe path", async () => {
  for (const createBook of publishingQaBooks) {
    const book = createBook();
    const filename = exportFilenameStem(book);
    const blob = await exportBundle(book, false);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const docx = await zip.file(`${filename}-Kindle-Create.docx`)?.async("uint8array");
    const epub = await zip.file(`${filename}.epub`)?.async("uint8array");
    const pdf = await zip.file(`${filename}-Reference.pdf`)?.async("uint8array");
    const cover = await zip.file(`${filename}-KDP-Cover.jpg`)?.async("uint8array");
    const guide = await zip.file("KDP-UPLOAD-GUIDE.txt")?.async("string");

    assert.equal(blob.type, "application/zip");
    assert.ok(docx && epub && pdf && cover && guide);
    assert.deepEqual([...docx.slice(0, 2)], [0x50, 0x4b]);
    assert.deepEqual([...epub.slice(0, 2)], [0x50, 0x4b]);
    assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
    assert.deepEqual([...cover.slice(0, 2)], [0xff, 0xd8]);
    assert.match(guide, new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(guide, new RegExp(`BOOK TYPE: ${book.mode === "fiction" ? "Fiction" : "Non-Fiction"}`));
  }
});
