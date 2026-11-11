import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { POST } from "../app/api/generate/route";
import type { Manuscript } from "../app/book-types";
import { exportBundle, exportFilenameStem } from "../app/exporters";
import {
  createPaperbackCoverPdf,
  defaultPaperType,
  frontCoverPixels,
  getPaperbackCoverReadiness,
  jpegSize,
  paperbackCoverFilename,
  paperbackCoverGeometry,
  removeDashes,
} from "../app/paperback-cover";
import type { PrintFontLoader } from "../app/print-exporters";
import { createLongFictionManuscript, createLongNonfictionManuscript } from "./fixtures/publishing-manuscripts";

const fontLoader: PrintFontLoader = async (fileName) =>
  new Uint8Array(await readFile(join(process.cwd(), "public", "fonts", "eb-garamond", fileName)));

/** A tiny baseline JPEG header with the given pixel size. jsPDF only reads the frame header. */
function fakeJpeg(width: number, height: number) {
  const bytes = [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    height >> 8, height & 255, width >> 8, width & 255,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ];
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

const BLURB =
  "Some houses keep their secrets. This one keeps its promises.\n\nWhen Elena returns to the house on the hill, she expects dust and silence. Instead she finds a ledger of every promise her family ever broke, written in a hand she does not recognize. Each night, one more page fills itself in.\n\nWith the last train out of the city about to stop running, Elena has until the ledger is full to decide which promises are worth keeping, and which were never hers to make.";

function readyBook(base: Manuscript, repeat = 3): Manuscript {
  return {
    ...base,
    backCover: { blurb: BLURB },
    sections: base.sections.map((section) => ({
      ...section,
      content: Array.from({ length: repeat }, () => section.content).join("\n\n"),
    })),
  };
}

function pageSize(source: string) {
  const match = /\/MediaBox \[([^\]]+)\]/.exec(source);
  return match ? match[1].trim().split(/\s+/).map(Number) : [];
}

test("full-wrap geometry follows KDP's cover formula", () => {
  const white = paperbackCoverGeometry("6x9", 200, "white");
  assert.ok(Math.abs(white.spineWidth - 0.4504) < 1e-9);
  assert.ok(Math.abs(white.fullWidth - 12.7004) < 1e-9);
  assert.equal(white.fullHeight, 9.25);
  assert.equal(white.spineLeft, 6.125);
  assert.ok(Math.abs(white.frontLeft - 6.5754) < 1e-9);
  assert.equal(white.spineText, true);
  assert.deepEqual(white.frontPixels, { width: 1838, height: 2775 });

  const cream = paperbackCoverGeometry("5x8", 300, "cream");
  assert.equal(cream.spineWidth, 0.75);
  assert.equal(cream.fullHeight, 8.25);

  assert.equal(paperbackCoverGeometry("6x9", 79, "white").spineText, false);
  assert.equal(paperbackCoverGeometry("6x9", 80, "white").spineText, true);
});

test("the barcode area sits bottom right of the back, clear of the spine and trim", () => {
  const geometry = paperbackCoverGeometry("6x9", 200, "white");
  const { barcode } = geometry;
  assert.equal(barcode.width, 2);
  assert.equal(barcode.height, 1.2);
  assert.ok(Math.abs(geometry.spineLeft - (barcode.left + barcode.width) - 0.25) < 1e-9);
  assert.ok(Math.abs(0.125 + 9 - (barcode.top + barcode.height) - 0.25) < 1e-9);
});

test("front panel pixels are 300 DPI for each trim", () => {
  assert.deepEqual(frontCoverPixels("6x9"), { width: 1838, height: 2775 });
  assert.deepEqual(frontCoverPixels("5.5x8.5"), { width: 1688, height: 2625 });
  assert.deepEqual(frontCoverPixels("5x8"), { width: 1538, height: 2475 });
});

test("paper defaults to cream for fiction and white for non-fiction", () => {
  assert.equal(defaultPaperType("fiction"), "cream");
  assert.equal(defaultPaperType("nonfiction"), "white");
});

test("dashes are removed from back cover copy", () => {
  assert.equal(removeDashes("She waited \u2014 then left."), "She waited, then left.");
  assert.equal(removeDashes("Pages 10\u201312"), "Pages 10 to 12");
  assert.doesNotMatch(removeDashes("A \u2013 B \u2014 C"), /[\u2013\u2014]/);
});

test("cover readiness requires a blurb of a sensible length", () => {
  const book = readyBook(createLongFictionManuscript());
  assert.ok(getPaperbackCoverReadiness(book).ready);
  assert.match(getPaperbackCoverReadiness({ ...book, backCover: { blurb: "" } }).errors[0], /blurb/);
  assert.match(getPaperbackCoverReadiness({ ...book, backCover: { blurb: "Too short." } }).errors[0], /at least/);
});

test("full-wrap cover PDF matches the interior page count at 300 DPI", async () => {
  const book = readyBook(createLongFictionManuscript(), 6);
  const front = fakeJpeg(1838, 2775);
  assert.deepEqual(jpegSize(new Uint8Array(Buffer.from(front.split(",")[1], "base64"))), { width: 1838, height: 2775 });
  const report = await createPaperbackCoverPdf(book, { trim: "6x9", frontImage: front, fontLoader });
  const source = new TextDecoder("latin1").decode(new Uint8Array(await report.blob.arrayBuffer()));
  const [, , width, height] = pageSize(source);
  assert.ok(Math.abs(width - report.geometry.fullWidth * 72) < 0.01);
  assert.ok(Math.abs(height - 9.25 * 72) < 0.01);
  assert.equal(report.geometry.paper, "cream");
  assert.ok(report.geometry.pageCount >= 80, "this sample is thick enough for spine text");
  assert.equal(report.geometry.spineText, true);
  assert.match(source, /FontFile2/);
  assert.doesNotMatch(source, /\/BaseFont \/(?:Helvetica|Times|Courier)/);
});

test("a front image below 300 DPI is refused", async () => {
  const book = readyBook(createLongFictionManuscript());
  await assert.rejects(
    createPaperbackCoverPdf(book, { trim: "6x9", frontImage: fakeJpeg(1600, 2560), fontLoader }),
    /needs 1838 × 2775 px for 300 DPI/,
  );
});

test("KDP package includes the full-wrap cover when the front art is supplied", async () => {
  const book = readyBook(createLongNonfictionManuscript());
  const filename = exportFilenameStem(book);
  const blob = await exportBundle(book, false, {
    paperbackTrim: "6x9",
    fontLoader,
    paperbackCover: { frontImage: fakeJpeg(1838, 2775), backColor: "#22333b" },
  });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const cover = await zip.file(paperbackCoverFilename(book, "6x9"))?.async("uint8array");
  assert.ok(cover);
  assert.equal(new TextDecoder().decode(cover.slice(0, 5)), "%PDF-");
  const guide = (await zip.file("KDP-UPLOAD-GUIDE.txt")?.async("string")) ?? "";
  assert.match(guide, new RegExp(`${filename}-Paperback-Cover-6x9\\.pdf`));
  assert.match(guide, /white paper/);
});

test("KDP package explains a missing cover when there is no blurb", async () => {
  const book = { ...readyBook(createLongNonfictionManuscript()), backCover: undefined };
  const zip = await JSZip.loadAsync(await (await exportBundle(book, false, { fontLoader })).arrayBuffer());
  const guide = (await zip.file("KDP-UPLOAD-GUIDE.txt")?.async("string")) ?? "";
  assert.match(guide, /Paperback cover not included/);
});

test("back_cover_blurb returns dash-free copy from the writer", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  let prompt = "";
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    prompt = String(init?.body ?? "");
    const blurb = BLURB.replace("Each night,", "Each night \u2014");
    return new Response(JSON.stringify({ output_text: JSON.stringify({ blurb }) }), { status: 200 });
  }) as typeof fetch;
  try {
    const book = createLongFictionManuscript();
    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          action: "back_cover_blurb",
          mode: book.mode,
          brief: { ...book.brief, title: book.title, author: book.author },
          manuscript: { sections: book.sections.map((s) => ({ title: s.title, summary: s.summary })) },
          provider: "openai",
        }),
      }),
    );
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.doesNotMatch(data.blurb, /[\u2013\u2014]/);
    assert.match(prompt, /Do not reveal the ending/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
