import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAskEBCreativeGuidance,
  buildCopywritingGuidance,
  buildCoverPrompt,
  buildVisualArtworkDirection,
  describeVisualDirection,
  inferCreativeGenre,
  resolveVisualBookKindId,
  resolveVisualStyleId,
} from "../app/creative-direction";

const houseContext = {
  mode: "fiction" as const,
  title: "The House That Remembered Rain",
  subtitle: "A quiet novel about memory, grief, and the rooms that keep what people leave behind",
  genre: "Literary Gothic Mystery",
  premise: "After her mother's death, a woman returns to the old family house and discovers that every room remembers a different storm.",
  audience: "Adult readers of literary mystery and atmospheric family drama",
};

test("every existing visual direction expands into a complete creative brief", () => {
  for (const style of [
    "cinematic-editorial",
    "warm-storybook",
    "dark-luxury",
    "clean-modern",
    "bold-color",
    "ink-noir",
    "notebook-reflection",
    "photoreal-title",
    "minimal-real-title",
    "fully-loaded-title",
    "eb-signature",
  ]) {
    const direction = describeVisualDirection(style);
    assert.match(direction, /Mood:/);
    assert.match(direction, /Lighting:/);
    assert.match(direction, /Composition:/);
    assert.match(direction, /Subject treatment:/);
    assert.match(direction, /Background treatment:/);
    assert.match(direction, /Color palette:/);
    assert.match(direction, /Typography direction:/);
    assert.match(direction, /Avoid:/);
    assert.match(direction, /Best use:/);
    assert.ok(direction.length > 450, `${style} should provide production-ready detail`);
  }
});

test("gothic literary inference recognizes the rain and old-house concept", () => {
  assert.equal(inferCreativeGenre(houseContext), "gothic-mystery");
});

test("gothic literary cover direction turns the title into a cinematic composition", () => {
  const prompt = buildCoverPrompt({
    ...houseContext,
    style: "cinematic",
    finishDirection: "premium satin finish with restrained dimensional sheen",
  });

  assert.match(prompt, /gothic mystery/i);
  assert.match(prompt, /visible rain/i);
  assert.match(prompt, /old house/i);
  assert.match(prompt, /solitary believable woman/i);
  assert.match(prompt, /warm glowing window/i);
  assert.match(prompt, /navy and teal/i);
  assert.match(prompt, /burgundy/i);
  assert.match(prompt, /cream or muted gold/i);
  assert.match(prompt, /Foreground:/);
  assert.match(prompt, /Midground:/);
  assert.match(prompt, /Background:/);
});

test("customer-facing cover prompts reject internal labels and title artifacts", () => {
  const prompt = buildCoverPrompt({
    ...houseContext,
    style: "eb-signature",
    finishDirection: "matte printed finish",
  });

  assert.equal(prompt.split(houseContext.title).length - 1, 1);
  assert.doesNotMatch(prompt, /EB Studio Pro/i);
  assert.doesNotMatch(prompt, /KDP Edition/i);
  assert.match(prompt, /exact title once and only once/i);
  assert.match(prompt, /ghost title/i);
  assert.match(prompt, /background lettering/i);
  assert.match(prompt, /internal product or edition labels/i);
  assert.match(prompt, /random cropped title bands/i);
  assert.match(prompt, /watermarks/i);
  assert.match(prompt, /Subtitle and author will be added separately/i);
});

test("custom cover direction remains highest priority without weakening safety", () => {
  const prompt = buildCoverPrompt({
    ...houseContext,
    style: "minimalist",
    finishDirection: "controlled matte finish",
    customDirection: "Place the woman under a red umbrella beside the garden gate.",
  });

  assert.match(prompt, /highest priority/i);
  assert.match(prompt, /woman under a red umbrella beside the garden gate/i);
  assert.match(prompt, /author request wins/i);
  assert.match(prompt, /Do not add a second title/i);
});

test("genre-aware copy frameworks separate fiction atmosphere from nonfiction outcomes", () => {
  const fiction = buildCopywritingGuidance(houseContext);
  const nonfiction = buildCopywritingGuidance({
    mode: "nonfiction",
    title: "The Operating System for Focused Founders",
    topic: "A practical business productivity system",
    audience: "Solo founders managing small teams",
    keyPoints: "Priorities, delegation, weekly review, and decision systems",
  });

  assert.match(fiction, /return or confinement/i);
  assert.match(fiction, /buried family conflict/i);
  assert.match(fiction, /psychologically specific/i);
  assert.match(nonfiction, /business audience/i);
  assert.match(nonfiction, /operational result/i);
  assert.match(nonfiction, /costly problem/i);
  assert.match(nonfiction, /Avoid generic filler/i);
});

test("Ask EB guidance demands immediately usable subtitles, blurbs, and cover directions", () => {
  const guidance = buildAskEBCreativeGuidance(houseContext);
  assert.match(guidance, /most precise genre or subgenre/i);
  assert.match(guidance, /fiction subtitles/i);
  assert.match(guidance, /non-fiction subtitles/i);
  assert.match(guidance, /follow the genre framework/i);
  assert.match(guidance, /foreground, midground, background/i);
  assert.match(guidance, /negative constraints/i);
  assert.match(guidance, /existing mini-book type/i);
  assert.match(guidance, /existing visual direction/i);
});

test("premium recommendations map back to backward-compatible visual style IDs", () => {
  assert.equal(resolveVisualStyleId("Gothic Literary"), "cinematic-editorial");
  assert.equal(resolveVisualStyleId("Cinematic Mystery"), "cinematic-editorial");
  assert.equal(resolveVisualStyleId("Premium Nonfiction"), "clean-modern");
  assert.equal(resolveVisualStyleId("Founder/Business Authority"), "clean-modern");
  assert.equal(resolveVisualStyleId("Notebook Reflection"), "notebook-reflection");
  assert.equal(resolveVisualStyleId("Unrelated style"), null);
});

test("Ask EB mini-book recommendations map to existing project contracts", () => {
  assert.equal(resolveVisualBookKindId("Illustrated Story"), "illustrated-story");
  assert.equal(resolveVisualBookKindId("Children's Story"), "children-story");
  assert.equal(resolveVisualBookKindId("Visual How-To"), "visual-guide");
  assert.equal(resolveVisualBookKindId("Lead Magnet"), "lead-magnet");
  assert.equal(resolveVisualBookKindId("Unknown format"), null);
});

test("Notebook Reflection keeps its tactile identity while gaining genre-aware direction", () => {
  const direction = buildVisualArtworkDirection(
    {
      mode: "nonfiction",
      title: "What I Learned After the Last Train",
      topic: "A reflective workbook about grief and rebuilding daily life",
      audience: "Adults processing loss",
      kind: "visual-guide",
    },
    "notebook-reflection",
  );
  assert.match(direction, /Notebook Reflection/);
  assert.match(direction, /warm cream lined paper/i);
  assert.match(direction, /deep forest green/i);
  assert.match(direction, /navy blue/i);
  assert.match(direction, /premium rather than childish/i);
});

test("creative prompt helpers never introduce visible ellipsis fallbacks", () => {
  const outputs = [
    buildCoverPrompt({
      ...houseContext,
      style: "cinematic",
      finishDirection: "satin finish",
    }),
    buildCopywritingGuidance(houseContext),
    buildAskEBCreativeGuidance(houseContext),
    buildVisualArtworkDirection(houseContext, "cinematic-editorial"),
  ];
  for (const output of outputs) {
    assert.doesNotMatch(output, /\.\.\.|…/);
  }
});
