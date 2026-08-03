import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Manuscript } from "../app/book-types";
import { exportDocx, exportEpub } from "../app/exporters";

const outputDirectory = resolve(process.argv[2] ?? "qa-kdp-fixture");
const onePixelJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";

const book: Manuscript = {
  id: "11111111-2222-4333-8444-555555555555",
  mode: "fiction",
  title: "The Exact KDP Export",
  subtitle: "A verified EB Studio Pro fixture",
  author: "Sulong",
  createdAt: "2026-08-03T00:00:00.000Z",
  brief: { title: "The Exact KDP Export", author: "Sulong", genre: "Literary fiction", characters: "Mara", premise: "A quiet night changes everything.", topic: "", audience: "Adult readers", keyPoints: "", chapterCount: 2 },
  plan: [
    { kind: "introduction", title: "Prologue", purpose: "Open" },
    { kind: "chapter", number: 1, title: "The Door", purpose: "Escalate" },
    { kind: "chapter", number: 2, title: "What Waited Inside", purpose: "Reveal" },
    { kind: "conclusion", title: "Epilogue", purpose: "Resolve" },
  ],
  sections: [
    { kind: "introduction", title: "Prologue", purpose: "Open", content: "# Prologue\n\n*Listen,* she told herself. The old hallway answered with a soft click from the farthest door.\n\nMara held the key between two fingers and waited for the house to breathe again.", summary: "Mara listens." },
    { kind: "chapter", number: 1, title: "The Door", purpose: "Escalate", content: "# The Door\n\nThe key **turned** before she meant it to.\n\nThe lock gave way with the reluctant scrape of metal that had not moved in years.\n\n***\n\n## What She Carried\n\n- A photograph with one face torn away\n- A sealed letter addressed in her mother’s hand\n- The promise that she would leave before sunrise\n\nShe stepped across the threshold. *No one knew she was here.*", summary: "The door opens." },
    { kind: "chapter", number: 2, title: "What Waited Inside", purpose: "Reveal", content: "# What Waited Inside\n\nDust softened every edge of the room except the mirror. It stood clean against the wall, catching the moonlight as if someone had polished it that evening.\n\n### The Three Instructions\n\n1. Do not cover the mirror\n2. Do not say the missing name\n3. Leave before the first bird calls\n\nMara read the list twice. Then the glass whispered her name.", summary: "The mirror speaks." },
    { kind: "conclusion", title: "Epilogue", purpose: "Resolve", content: "# Epilogue\n\nShe finally *felt* the morning. The house was quiet behind her, and the key was warm in her palm.\n\nFor the first time, leaving did not feel like running away.", summary: "Morning arrives." },
  ],
  cover: { imageData: onePixelJpeg, sourceImageData: onePixelJpeg, width: 1600, height: 2560, style: "cinematic", finish: "satin", displayTitle: "The Exact KDP Export", displaySubtitle: "A verified EB Studio Pro fixture", createdAt: "2026-08-03T00:00:00.000Z" },
};

await mkdir(outputDirectory, { recursive: true });
const [docx, epub] = await Promise.all([exportDocx(book, false), exportEpub(book, false)]);
await writeFile(resolve(outputDirectory, "KDP-Fixture-Kindle-Create.docx"), Buffer.from(await docx.arrayBuffer()));
await writeFile(resolve(outputDirectory, "KDP-Fixture.epub"), Buffer.from(await epub.arrayBuffer()));
console.log(outputDirectory);
