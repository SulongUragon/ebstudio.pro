import assert from "node:assert/strict";
import test from "node:test";
import {
  COVER_TEXT_MODE_OPTIONS,
  CREATIVE_COVER_FINISH_OPTIONS,
  buildAskEBCreativeGuidance,
  buildAppTypographyCoverPrompt,
  buildCopywritingGuidance,
  buildCoverPrompt,
  buildCoverTypographyLayout,
  buildIntegratedTypographyCoverPrompt,
  buildVisualArtworkDirection,
  describeVisualDirection,
  formatPremiumCoverAuthor,
  getCreativeCoverFinishPreset,
  inferCreativeCoverFinish,
  inferCreativeGenre,
  resolveCoverTextMode,
  resolveCreativeCoverFinishId,
  resolveVisualBookKindId,
  resolveVisualStyleId,
  rejectCoverPlaceholderArtifacts,
  sanitizeIntegratedTypographyPrompt,
  shouldOverlayCoverText,
  stripCoverPlaceholderText,
  validateCoverTextModePayload,
  validateCoverPromptForPlaceholders,
  validateCoverArtworkPrompt,
  validateIntegratedTypographyPrompt,
} from "../app/creative-direction";

const houseContext = {
  mode: "fiction" as const,
  title: "The House That Remembered Rain",
  subtitle: "A quiet novel about memory, grief, and the rooms that keep what people leave behind",
  genre: "Literary Gothic Mystery",
  premise: "After her mother's death, a woman returns to the old family house and discovers that every room remembers a different storm.",
  audience: "Adult readers of literary mystery and atmospheric family drama",
};

const integratedGothicContext = {
  mode: "fiction" as const,
  title: "The Window That Waited for Thunder",
  subtitle: "A gothic novel about inheritance, silence, and the storm a family refused to name.",
  author: "Sulong Uragon",
  genre: "Literary Gothic Mystery",
  premise: "A woman returns to a rain-darkened old house and its warm glowing window before a storm.",
  audience: "Adult readers of literary gothic mystery",
  style: "photoreal-title",
  finishDirection: "premium glossy cover finish",
  creativeFinish: "rain-soaked-gothic",
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

test("creative cover finish options expose every supported market preset", () => {
  const labels = CREATIVE_COVER_FINISH_OPTIONS.map((option) => option.label);
  assert.equal(new Set(labels).size, labels.length);
  for (const label of [
    "Auto", "Rain-Soaked Gothic", "Gothic Literary", "Cinematic Mystery",
    "Dark Academia", "Emotional Memoir", "Premium Nonfiction", "Founder Authority",
    "Warm Storybook", "Minimal Literary", "Luxury Thriller", "Dark Romance",
    "Epic Fantasy", "Clean How-To", "Product Guide Premium",
  ]) assert.ok(labels.includes(label as (typeof labels)[number]), `${label} should be selectable`);
});

test("cover text mode options expose Auto, App Typography, and Integrated Typography", () => {
  assert.deepEqual(COVER_TEXT_MODE_OPTIONS.map((option) => option.label), [
    "Auto",
    "App Typography",
    "Integrated Typography",
  ]);
  assert.equal(validateCoverTextModePayload("auto"), true);
  assert.equal(validateCoverTextModePayload("app-typography"), true);
  assert.equal(validateCoverTextModePayload("integrated-typography"), true);
  assert.equal(validateCoverTextModePayload("mixed-typography"), false);
});

test("App Typography mode keeps the generated artwork strictly image-only", () => {
  const prompt = buildAppTypographyCoverPrompt({
    ...integratedGothicContext,
    coverTextMode: "app-typography",
  });
  assert.match(prompt, /IMAGE-ONLY ARTWORK/i);
  assert.match(prompt, /no text/i);
  assert.match(prompt, /no letters/i);
  assert.match(prompt, /no words/i);
  assert.match(prompt, /no typography/i);
  assert.doesNotMatch(prompt, new RegExp(integratedGothicContext.title, "i"));
  assert.equal(validateCoverArtworkPrompt(prompt), true);
});

test("Integrated Typography mode requests only the supplied customer-facing cover text", () => {
  const prompt = buildIntegratedTypographyCoverPrompt({
    ...integratedGothicContext,
    coverTextMode: "integrated-typography",
  });
  assert.match(prompt, /complete customer-facing book cover/i);
  assert.match(prompt, /render only these exact words as cover text/i);
  assert.match(prompt, new RegExp(`“${integratedGothicContext.title}”`, "i"));
  assert.match(prompt, new RegExp(`“${integratedGothicContext.subtitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}”`, "i"));
  assert.match(prompt, new RegExp(`“${integratedGothicContext.author}”`, "i"));
  assert.match(prompt, /Stormglass Serif/i);
  assert.match(prompt, /Upper Third/i);
  assert.match(prompt, /no duplicate title/i);
  assert.match(prompt, /no duplicate author/i);
  assert.match(prompt, /no watermark/i);
  assert.doesNotMatch(prompt, /IMAGE-ONLY ARTWORK/i);
  assert.equal(validateIntegratedTypographyPrompt(prompt), true);
  assert.equal(validateCoverPromptForPlaceholders(prompt), true);
});

test("Integrated Typography strips template values and internal product labels", () => {
  for (const placeholder of [
    "AUTHOR NAME",
    "YOUR NAME",
    "BOOK TITLE",
    "TITLE",
    "SUBTITLE",
    "SAMPLE TEXT",
  ]) {
    const prompt = buildIntegratedTypographyCoverPrompt({
      ...integratedGothicContext,
      subtitle: placeholder,
      author: placeholder,
      coverTextMode: "integrated-typography",
    });
    assert.doesNotMatch(prompt, new RegExp(`“${placeholder}”`, "i"));
  }

  const internalLabelPrompt = buildIntegratedTypographyCoverPrompt({
    ...integratedGothicContext,
    coverTextMode: "integrated-typography",
    customDirection: "Add EB Studio Pro and KDP Edition as a badge near the house.",
  });
  assert.doesNotMatch(internalLabelPrompt, /EB Studio Pro|KDP Edition/i);
  assert.doesNotMatch(sanitizeIntegratedTypographyPrompt("Add EB Studio Pro and KDP Edition."), /EB Studio Pro|KDP Edition/i);
});

test("Integrated Typography disables the duplicate app overlay contract", () => {
  const context = {
    ...integratedGothicContext,
    coverTextMode: "integrated-typography",
  };
  assert.equal(shouldOverlayCoverText(context), false);
  assert.match(buildCoverTypographyLayout(context), /disable the app text overlay/i);
  assert.doesNotMatch(buildCoverTypographyLayout(context), /Official title:/i);
  assert.equal(shouldOverlayCoverText({ ...context, coverTextMode: "app-typography" }), true);
});

test("Auto selects integrated typography for cinematic fiction finishes", () => {
  for (const creativeFinish of [
    "rain-soaked-gothic",
    "gothic-literary",
    "cinematic-mystery",
    "dark-academia",
    "luxury-thriller",
    "dark-romance",
    "epic-fantasy",
  ]) {
    assert.equal(resolveCoverTextMode({
      ...integratedGothicContext,
      creativeFinish,
      coverTextMode: "auto",
    }), "integrated-typography");
  }
});

test("Auto selects app typography for accuracy-first nonfiction finishes", () => {
  const nonfiction = {
    mode: "nonfiction" as const,
    title: "The Focused Founder",
    genre: "Business",
    topic: "A practical operating system for founders",
    coverTextMode: "auto",
  };
  for (const creativeFinish of [
    "premium-nonfiction",
    "founder-authority",
    "clean-how-to",
    "product-guide-premium",
  ]) {
    assert.equal(resolveCoverTextMode({
      ...nonfiction,
      creativeFinish,
    }), "app-typography");
  }
});

test("Auto honors explicit text-in-image intent and defaults safely when uncertain", () => {
  assert.equal(resolveCoverTextMode({
    ...integratedGothicContext,
    coverTextMode: "auto",
    customDirection: "No text in the image; keep the artwork clean.",
  }), "app-typography");
  assert.equal(resolveCoverTextMode({
    mode: "nonfiction",
    title: "The Focused Founder",
    topic: "A practical business guide",
    creativeFinish: "premium-nonfiction",
    coverTextMode: "auto",
    customDirection: "Use integrated title typography in artwork.",
  }), "integrated-typography");
  assert.equal(resolveCoverTextMode({
    mode: "fiction",
    title: "A Quiet Afternoon",
    genre: "Literary Fiction",
    creativeFinish: "minimal-literary",
    coverTextMode: "auto",
  }), "app-typography");
});

test("rain-soaked gothic combines style, surface finish, and market finish", () => {
  const prompt = buildCoverPrompt({
    ...houseContext,
    style: "photoreal-title",
    finishDirection: "glossy premium surface finish",
    creativeFinish: "rain-soaked-gothic",
  });
  assert.match(prompt, /Real Person/i);
  assert.match(prompt, /glossy premium surface finish/i);
  assert.match(prompt, /Rain-Soaked Gothic/i);
  assert.match(prompt, /old house or window/i);
  assert.match(prompt, /warm glowing window/i);
  assert.match(prompt, /deep navy and teal/i);
  assert.match(prompt, /IMAGE-ONLY ARTWORK/i);
  assert.doesNotMatch(prompt, /premium spaced small caps/i);
});

test("creative finish auto inference and aliases remain safe", () => {
  assert.equal(inferCreativeCoverFinish(houseContext), "rain-soaked-gothic");
  assert.equal(resolveCreativeCoverFinishId("Founder/Business Authority"), "founder-authority");
  assert.equal(resolveCreativeCoverFinishId("unknown future preset"), "auto");
  assert.equal(getCreativeCoverFinishPreset("auto", houseContext).label, "Rain-Soaked Gothic");
});

test("premium author typography follows the selected market finish", () => {
  assert.equal(
    formatPremiumCoverAuthor("Sulong Uragon", "rain-soaked-gothic", houseContext),
    "S U L O N G   U R A G O N",
  );
  const founder = {
    mode: "nonfiction" as const,
    title: "The Focused Founder",
    genre: "Business",
    topic: "A practical operating system for founders",
  };
  assert.equal(formatPremiumCoverAuthor("Sulong Uragon", "founder-authority", founder), "SULONG URAGON");
  assert.equal(formatPremiumCoverAuthor("Sulong Uragon", "warm-storybook", houseContext), "SULONG URAGON");
});

test("customer-facing gothic prompt uses the actual premium author credit", () => {
  const input = {
    mode: "fiction",
    title: "The Window That Waited for Thunder",
    subtitle: "A gothic novel about inheritance, silence, and the storm a family refused to name.",
    author: "Sulong Uragon",
    genre: "Literary Gothic Mystery",
    premise: "A woman returns to a rain-darkened family house before a storm.",
    style: "photoreal-title",
    finishDirection: "premium glossy cover finish",
    creativeFinish: "rain-soaked-gothic",
  } as const;
  const artworkPrompt = buildCoverPrompt(input);
  const typographyLayout = buildCoverTypographyLayout(input);
  assert.doesNotMatch(artworkPrompt, /S U L O N G|SULONG URAGON/i);
  assert.match(typographyLayout, /S U L O N G\s{3}U R A G O N/);
  assert.match(typographyLayout, /The Window That Waited for Thunder/i);
  assert.match(typographyLayout, /gothic novel about inheritance/i);
  assert.equal(validateCoverArtworkPrompt(artworkPrompt), true);
  assert.equal(validateCoverPromptForPlaceholders(typographyLayout), true);
});

test("rain-soaked real-person covers auto-select premium title direction", () => {
  const layout = buildCoverTypographyLayout({
    mode: "fiction",
    title: "The Window That Waited for Thunder",
    subtitle: "A gothic novel about inheritance and silence.",
    author: "Sulong Uragon",
    genre: "Literary Gothic Mystery",
    premise: "A woman returns to a rain-darkened family house before a storm.",
    style: "photoreal-title",
    creativeFinish: "rain-soaked-gothic",
    titleTypography: "auto",
    titlePlacement: "auto",
  });
  assert.match(layout, /Title typography preset: Stormglass Serif/i);
  assert.match(layout, /Title placement preset: Upper Third/i);
  assert.match(layout, /balanced complete lines/i);
  assert.match(layout, /no ellipsis or cropping/i);
  assert.match(layout, /S U L O N G\s{3}U R A G O N/);
});

test("manual title typography and placement stay in app-only layout metadata", () => {
  const input = {
    ...houseContext,
    style: "photoreal-title",
    finishDirection: "premium glossy cover finish",
    creativeFinish: "rain-soaked-gothic",
    titleTypography: "editorial-luxe",
    titlePlacement: "lower-third",
  };
  const artworkPrompt = buildCoverPrompt(input);
  const typographyLayout = buildCoverTypographyLayout(input);
  assert.match(typographyLayout, /Title typography preset: Editorial Luxe/i);
  assert.match(typographyLayout, /Title placement preset: Lower Third/i);
  assert.doesNotMatch(artworkPrompt, /Editorial Luxe|Lower Third/i);
  assert.doesNotMatch(artworkPrompt, /render.*title/i);
  assert.equal(validateCoverArtworkPrompt(artworkPrompt), true);
});

test("gothic literary auto typography remains a premium serif treatment", () => {
  const layout = buildCoverTypographyLayout({
    ...houseContext,
    creativeFinish: "gothic-literary",
    titleTypography: "auto",
    titlePlacement: "center",
  });
  assert.match(layout, /Literary Tall Serif/i);
  assert.match(layout, /Title placement preset: Center/i);
  assert.doesNotMatch(layout, /(?:\.\.\.|…)/);
});

test("cover artwork prompt is image-only while preserving gothic visual direction", () => {
  const artworkPrompt = buildCoverPrompt({
    mode: "fiction",
    title: "The Window That Waited for Thunder",
    subtitle: "A gothic novel about inheritance and silence.",
    author: "Sulong Uragon",
    genre: "Literary Gothic Mystery",
    premise: "A woman returns to an old coastal house during a violent rainstorm.",
    style: "photoreal-title",
    finishDirection: "premium glossy cover finish",
    creativeFinish: "rain-soaked-gothic",
  });
  for (const constraint of [
    /no text/i, /no letters/i, /no words/i, /no typography/i,
    /no title/i, /no subtitle/i, /no author name/i, /no watermark/i,
  ]) assert.match(artworkPrompt, constraint);
  assert.doesNotMatch(artworkPrompt, /render\s+(?:the\s+)?(?:title|subtitle|author)/i);
  assert.doesNotMatch(artworkPrompt, /(?:serif|sans|display)\s+title/i);
  assert.doesNotMatch(artworkPrompt, /Sulong Uragon|S U L O N G/i);
  assert.match(artworkPrompt, /Real Person/i);
  assert.match(artworkPrompt, /rain/i);
  assert.match(artworkPrompt, /old house or window/i);
  assert.match(artworkPrompt, /warm glowing window/i);
  assert.match(artworkPrompt, /solitary believable woman/i);
  assert.match(artworkPrompt, /navy and teal/i);
});

test("cover placeholder sanitizer removes template values and preserves real names", () => {
  for (const placeholder of [
    "AUTHOR NAME", "Author Name", "author name", "YOUR NAME", "Your Name",
    "BOOK TITLE", "Book Title", "TITLE", "Title", "SUBTITLE", "Subtitle",
    "TAGLINE", "Tagline", "PLACEHOLDER", "Placeholder", "LOREM IPSUM",
    "Lorem Ipsum", "SAMPLE TEXT", "Sample Text",
  ]) {
    assert.equal(rejectCoverPlaceholderArtifacts(placeholder), true);
    assert.equal(stripCoverPlaceholderText(placeholder), "");
  }
  assert.equal(stripCoverPlaceholderText("Sulong Uragon"), "Sulong Uragon");
  assert.equal(stripCoverPlaceholderText("The Window That Waited for Thunder"), "The Window That Waited for Thunder");
});

test("missing or placeholder author is omitted without generating a template credit", () => {
  for (const author of ["", "AUTHOR NAME", "Your Name"]) {
    const input = {
      ...houseContext,
      author,
      creativeFinish: "rain-soaked-gothic",
    };
    const layout = buildCoverTypographyLayout(input);
    assert.match(layout, /omit the author line/i);
    assert.doesNotMatch(layout, /AUTHOR NAME|YOUR NAME/i);
    assert.equal(validateCoverPromptForPlaceholders(layout), true);
  }
});

test("customer-facing cover prompts reject internal labels and title artifacts", () => {
  const prompt = buildCoverPrompt({
    ...houseContext,
    style: "eb-signature",
    finishDirection: "matte printed finish",
  });

  assert.doesNotMatch(prompt, new RegExp(houseContext.title, "i"));
  assert.doesNotMatch(prompt, /EB Studio Pro/i);
  assert.doesNotMatch(prompt, /KDP Edition/i);
  assert.match(prompt, /IMAGE-ONLY ARTWORK/i);
  assert.match(prompt, /no ghost text/i);
  assert.match(prompt, /no publisher mark/i);
  assert.match(prompt, /no watermark/i);
  assert.equal(validateCoverArtworkPrompt(prompt), true);
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
  assert.match(prompt, /image-only rule always overrides/i);
  assert.match(prompt, /no text/i);
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
  assert.match(guidance, /Creative Cover Finish/i);
  assert.match(guidance, /Rain-Soaked Gothic/i);
  assert.match(guidance, /author treatment/i);
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
