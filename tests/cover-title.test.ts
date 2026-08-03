import assert from "node:assert/strict";
import test from "node:test";
import type { Manuscript } from "../app/book-types";
import {
  contrastingTextStroke,
  getCoverTypographyPreset,
  resolveExactCoverTitle,
  selectCoverTypographyPreset,
  usesAutomaticTitleVariety,
} from "../app/cover-utils";

const manuscript = {
  id: "cover-title-fixture",
  mode: "fiction",
  title: "The Night I Was Left Alone",
  subtitle: "",
  author: "Sulong",
  createdAt: "2026-08-03T00:00:00.000Z",
  brief: {
    title: "The Night I Was Left Alone",
    author: "Sulong",
    genre: "Literary fiction",
    characters: "A grieving man",
    premise: "One night changes everything.",
    topic: "",
    audience: "Adult readers",
    keyPoints: "",
    chapterCount: 8,
  },
  plan: [],
  sections: [],
} satisfies Manuscript;

test("cover title falls back to the exact manuscript title", () => {
  assert.equal(
    resolveExactCoverTitle(manuscript, "   "),
    "The Night I Was Left Alone",
  );
});

test("cover title preserves the user's exact non-empty wording", () => {
  assert.equal(
    resolveExactCoverTitle(manuscript, "The Night I Was Left Alone"),
    "The Night I Was Left Alone",
  );
});

test("title outline contrasts with both light and dark text", () => {
  assert.match(contrastingTextStroke("#fffdf7"), /0,0,0/);
  assert.match(contrastingTextStroke("#101418"), /255,255,255/);
});

test("exact-title directions rotate through multiple premium title designs", () => {
  const designs = new Set(
    Array.from({ length: 24 }, (_, index) =>
      selectCoverTypographyPreset("minimal-real-title", `artwork-${index}`),
    ),
  );
  assert.ok(designs.size >= 3);
  assert.equal(usesAutomaticTitleVariety("minimal-real-title"), true);
  assert.equal(usesAutomaticTitleVariety("cinematic"), false);
});

test("selected title designs are stable for the same generated artwork", () => {
  const selected = selectCoverTypographyPreset(
    "photoreal-title",
    "generated-artwork-data",
  );
  assert.equal(
    selectCoverTypographyPreset("photoreal-title", "generated-artwork-data"),
    selected,
  );
  assert.equal(getCoverTypographyPreset(selected).id, selected);
});
