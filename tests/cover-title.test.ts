import assert from "node:assert/strict";
import test from "node:test";
import type { Manuscript } from "../app/book-types";
import {
  contrastingTextStroke,
  getCoverTypographyPreset,
  normalizeCoverTypographyPreset,
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

test("every visual direction rotates through premium title designs", () => {
  for (const style of [
    "cinematic",
    "minimalist",
    "illustrated",
    "photoreal-title",
    "minimal-real-title",
    "fully-loaded-title",
    "eb-signature",
  ]) {
    const designs = new Set(
      Array.from({ length: 24 }, (_, index) =>
        selectCoverTypographyPreset(style, `artwork-${index}`),
      ),
    );
    assert.ok(designs.size >= 3, `${style} should rotate title designs`);
    assert.equal(usesAutomaticTitleVariety(style), true);
  }
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

test("real-person covers reject generic condensed and sans title presets", () => {
  assert.equal(
    normalizeCoverTypographyPreset("photoreal-title", "dramatic-stacked"),
    "classic-gold",
  );
  assert.equal(
    normalizeCoverTypographyPreset("photoreal-title", "modern-clean"),
    "classic-gold",
  );
  assert.equal(
    normalizeCoverTypographyPreset("photoreal-title", "quiet-editorial"),
    "quiet-editorial",
  );
});

test("real-person covers use the exact EB Signature title engine", () => {
  for (const seed of ["cover-a", "cover-b", "cover-c", "cover-d"]) {
    assert.equal(
      selectCoverTypographyPreset("photoreal-title", seed),
      selectCoverTypographyPreset("eb-signature", seed),
    );
  }
});

test("every premium title design uses a distinct embedded font", () => {
  const fonts = [
    getCoverTypographyPreset("classic-gold").fontName,
    getCoverTypographyPreset("cinematic-ivory").fontName,
    getCoverTypographyPreset("modern-clean").fontName,
    getCoverTypographyPreset("dramatic-stacked").fontName,
    getCoverTypographyPreset("quiet-editorial").fontName,
  ];
  assert.deepEqual(fonts, [
    "Cinzel",
    "Playfair Display",
    "Montserrat",
    "Bebas Neue",
    "Cormorant Garamond",
  ]);
  assert.equal(new Set(fonts).size, 5);
});
