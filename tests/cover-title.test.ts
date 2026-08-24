import assert from "node:assert/strict";
import test from "node:test";
import type { Manuscript } from "../app/book-types";
import {
  TITLE_PLACEMENT_OPTIONS,
  TITLE_TYPOGRAPHY_OPTIONS,
  contrastingTextStroke,
  getCoverTitlePlacementPreset,
  getCoverTypographyPreset,
  inferCoverTitlePlacement,
  inferCoverTitleTypography,
  normalizeCoverTypographyPreset,
  resolveCoverAuthorY,
  resolveExactCoverSubtitle,
  resolveExactCoverTitle,
  resolveNonCollidingCoverTextY,
  selectCoverTypographyPreset,
  usesAutomaticTitleVariety,
  wrapBalancedCoverTitle,
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

test("cover subtitle uses the canonical manuscript subtitle", () => {
  assert.equal(
    resolveExactCoverSubtitle({
      ...manuscript,
      subtitle: "The subtitle the author approved",
      brief: { ...manuscript.brief, subtitle: "An older brief subtitle" },
      cover: {
        imageData: "data:image/jpeg;base64,cover",
        style: "cinematic",
        displaySubtitle: "A stale cover subtitle",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
    }),
    "The subtitle the author approved",
  );
});

test("legacy cover subtitle is retained when the manuscript has none", () => {
  assert.equal(
    resolveExactCoverSubtitle({
      ...manuscript,
      subtitle: "",
      cover: {
        imageData: "data:image/jpeg;base64,cover",
        style: "cinematic",
        displaySubtitle: "The saved cover subtitle",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
    }),
    "The saved cover subtitle",
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
    "classic-gold",
  );
});

test("real-person covers are permanently locked to Classic Gold", () => {
  for (const seed of ["cover-a", "cover-b", "cover-c", "cover-d"]) {
    assert.equal(
      selectCoverTypographyPreset("photoreal-title", seed),
      "classic-gold",
    );
  }
  assert.equal(usesAutomaticTitleVariety("photoreal-title"), true);
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

test("author stays at the bottom when no text occupies its safe area", () => {
  assert.equal(resolveCoverAuthorY(2560, []), 2380);
});

test("author moves below a low title when the bottom safe area can fit it", () => {
  const authorY = resolveCoverAuthorY(2560, [
    { top: 1900, bottom: 2300 },
  ]);
  assert.ok(authorY > 2300);
});

test("author moves above a title that reaches the bottom trim area", () => {
  const title = { top: 2060, bottom: 2440 };
  const authorY = resolveCoverAuthorY(2560, [title]);
  assert.ok(authorY < title.top);
});

test("premium title typography and placement controls expose every supported preset", () => {
  assert.deepEqual(TITLE_TYPOGRAPHY_OPTIONS.map((option) => option.label), [
    "Auto",
    "Classic Gothic Serif",
    "Literary Tall Serif",
    "Stormglass Serif",
    "Engraved Gold",
    "Editorial Luxe",
    "Hand-Set Mystery",
    "Minimal Authority",
    "Warm Storybook Serif",
    "Bold Commercial",
    "Clean Sans Premium",
  ]);
  assert.deepEqual(TITLE_PLACEMENT_OPTIONS.map((option) => option.label), [
    "Auto",
    "Top",
    "Upper Third",
    "Center",
    "Lower Third",
    "Bottom",
    "Split Title",
    "Frame Overlay",
  ]);
});

test("genre-aware title defaults elevate gothic and real-person covers", () => {
  const context = {
    mode: "fiction" as const,
    title: "The Window That Waited for Thunder",
    genre: "Literary Gothic Mystery",
    premise: "A woman returns to a rain-darkened house.",
    creativeFinish: "rain-soaked-gothic",
    style: "photoreal-title",
  };
  assert.equal(inferCoverTitleTypography(context), "stormglass-serif");
  assert.equal(getCoverTypographyPreset("stormglass-serif").label, "Stormglass Serif");
  assert.equal(inferCoverTitlePlacement(context), "upper-third");
  assert.equal(
    getCoverTitlePlacementPreset("auto", context).label,
    "Upper Third",
  );
});

test("title wrapping keeps complete balanced lines without ellipsis or orphan words", () => {
  const context = {
    measureText(value: string) {
      return { width: value.length * 10 } as TextMetrics;
    },
  };
  const lines = wrapBalancedCoverTitle(
    context,
    "THE WINDOW THAT WAITED FOR THUNDER",
    130,
    5,
  );
  assert.deepEqual(lines, ["THE WINDOW", "THAT WAITED", "FOR THUNDER"]);
  assert.doesNotMatch(lines.join(" "), /(?:\.\.\.|…)/);
  assert.equal(lines.some((line) => line.trim().split(/\s+/).length === 1), false);
});

test("subtitle placement moves to the nearest safe zone around title bands", () => {
  const titleBand = { top: 350, bottom: 760 };
  const subtitleY = resolveNonCollidingCoverTextY(
    600,
    180,
    2560,
    [titleBand],
  );
  assert.ok(subtitleY >= titleBand.bottom);
  assert.ok(subtitleY + 180 < 2560 * 0.9);
});
