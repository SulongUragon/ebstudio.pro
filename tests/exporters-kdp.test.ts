import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import type { Manuscript } from "../app/book-types";
import { exportCover, exportDocx, exportEpub, exportFilenameStem, getCoverReadiness, getKdpReadiness } from "../app/exporters";

const onePixelJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";

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
        content: "# Prologue\n\n*Listen,* she told herself.\n\nThe hallway answered.",
        summary: "Mara listens.",
      },
      {
        kind: "chapter",
        number: 1,
        title: "The Door",
        purpose: "Escalate",
        content:
          "# The Door\n\nThe key **turned**.\n\n***\n\n### What She Found\n\n- A photograph\n- A sealed letter\n\n1. Breathe\n2. Open it",
        summary: "The door opens.",
      },
      {
        kind: "conclusion",
        title: "Epilogue",
        purpose: "Resolve",
        content: "# Epilogue\n\nShe finally *felt* the morning.",
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
  book.sections[0].content = "# Prologue: The Last Binding\n\nThe ink moved.";
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
