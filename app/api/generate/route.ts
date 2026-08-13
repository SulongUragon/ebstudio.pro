import { NextResponse } from "next/server";
import type {
  ActiveAIProvider,
  AIProvider,
  BookBrief,
  Mode,
  SectionPlan,
} from "../../book-types";
import type { VisualBookBrief, VisualBookPage } from "../../visual-book-types";

type RequestBody = {
  action: "title" | "brief" | "companion" | "dual_seed" | "dual_brief" | "outline" | "section" | "assistant" | "ebook_audit" | "optimize_ebook_section" | "visual_storyboard" | "visual_page";
  mode: Mode;
  sourceMode?: Mode;
  brief: BookBrief;
  provider?: AIProvider;
  preferredProvider?: ActiveAIProvider;
  plan?: SectionPlan[];
  section?: SectionPlan;
  sectionIndex?: number;
  previousSummaries?: string[];
  assistantPrompt?: string;
  assistantHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  manuscript?: {
    title?: string;
    subtitle?: string;
    sections?: Array<{ title?: string; content?: string; summary?: string }>;
  } | null;
  activeSection?: number;
  bookLength?: BookLength;
  avoidNames?: string[];
  creationMode?: "single" | "dual";
  dualContext?: {
    title?: string;
    concept?: string;
    audience?: string;
    fictionSubtitle?: string;
    nonfictionSubtitle?: string;
    fictionTitle?: string;
    nonfictionTitle?: string;
  } | null;
  dualPair?: {
    concept?: string;
    audience?: string;
    fictionSubtitle?: string;
    nonfictionSubtitle?: string;
  };
  existingBook?: {
    optimizationMode?: "packaging" | "polish" | "viral" | "relaunch";
    text?: string;
    sectionMap?: string;
    audit?: Record<string, unknown>;
    sectionTitle?: string;
    sectionText?: string;
    sectionIndex?: number;
    sectionCount?: number;
  };
  visualProject?: VisualBookBrief & { pages?: VisualBookPage[]; page?: VisualBookPage };
};

type JsonObject = Record<string, unknown>;

type JsonRequest = {
  name: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: string;
  maxOutputTokens: number;
};

type JsonGeneration = {
  output: JsonObject;
  provider: ActiveAIProvider;
};

type OpenAIErrorPayload = {
  error?: {
    code?: string;
    type?: string;
    message?: string;
  };
};

type AnthropicErrorPayload = {
  type?: string;
  error?: {
    type?: string;
    message?: string;
  };
};

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

const visualPageSchema = {
  type: "object", additionalProperties: false,
  properties: {
    page_number: { type: "integer" }, title: { type: "string" }, body: { type: "string" }, image_prompt: { type: "string" },
    layout: { type: "string", enum: ["full-bleed", "image-top", "image-left", "image-right", "quote"] }, panel_count: { type: "integer" },
    panels: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      scene: { type: "string" }, camera: { type: "string" },
      dialogue: { type: "array", items: { type: "object", additionalProperties: false, properties: { speaker: { type: "string" }, text: { type: "string" } }, required: ["speaker", "text"] } },
      caption: { type: "string" }, sound_effect: { type: "string" },
    }, required: ["scene", "camera", "dialogue", "caption", "sound_effect"] } },
  },
  required: ["page_number", "title", "body", "image_prompt", "layout", "panel_count", "panels"],
} as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI generation is not configured yet." },
        { status: 503 },
      );
    }
    if (!body.brief?.title || !body.mode) {
      return NextResponse.json({ error: "The book brief is incomplete." }, { status: 400 });
    }

    if (body.action === "title") {
      const result = await createTitleSuggestions(
        body.mode,
        body.brief.title,
        body.provider ?? "auto",
      );
      return NextResponse.json(result);
    }
    if (body.action === "brief") {
      const result = await createBookBrief(
        body.mode,
        body.brief,
        body.provider ?? "auto",
        body.avoidNames,
      );
      return NextResponse.json(result);
    }
    if (body.action === "dual_seed") {
      const result = await createDualBookSeed(body);
      return NextResponse.json(result);
    }
    if (body.action === "companion" && body.manuscript) {
      const result = await createCompanionBrief(body);
      return NextResponse.json(result);
    }
    if (body.action === "dual_brief" && body.dualPair) {
      const result = await createDualBookBrief(body);
      return NextResponse.json(result);
    }
    if (body.action === "assistant" && body.assistantPrompt?.trim()) {
      const result = await createAssistantResponse(body);
      return NextResponse.json(result);
    }
    if (body.action === "ebook_audit" && body.existingBook?.text?.trim()) {
      const result = await createExistingEbookAudit(body);
      return NextResponse.json(result);
    }
    if (body.action === "optimize_ebook_section" && body.existingBook?.sectionText?.trim()) {
      const result = await optimizeExistingEbookSection(body);
      return NextResponse.json(result);
    }
    if (body.action === "visual_storyboard" && body.visualProject) {
      return NextResponse.json(await createVisualStoryboard(body));
    }
    if (body.action === "visual_page" && body.visualProject?.page) {
      return NextResponse.json(await rewriteVisualPage(body));
    }
    if (!body.brief.author) {
      return NextResponse.json({ error: "The book brief is incomplete." }, { status: 400 });
    }
    if (body.action === "outline") {
      const result = await createOutline(
        body.mode,
        body.brief,
        body.provider ?? "auto",
        body.preferredProvider,
        body.avoidNames,
      );
      return NextResponse.json(result);
    }
    if (body.action === "section" && body.plan && body.section) {
      const result = await createSection(body);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown generation action." }, { status: 400 });
  } catch (error) {
    console.error(
      "EB Studio Pro generation failed",
      error instanceof Error ? error.message : error,
    );
    if (error instanceof MultiProviderRequestError) {
      const detail = error.failures
        .map(
          (failure) =>
            `${failure.provider === "openai" ? "OpenAI" : "Anthropic"}: ${failure.code}`,
        )
        .join(", ");
      return NextResponse.json(
        {
          error: `Both AI writing services are unavailable (${detail}). Check the OpenAI and Anthropic credits or access, then try again. Your book details are safe.`,
          code: "all_providers_unavailable",
          retryable: error.failures.some((failure) => isRetryable(failure)),
        },
        { status: 503 },
      );
    }
    if (error instanceof ProviderRequestError) {
      const mapped = mapProviderError(error);
      return NextResponse.json(
        { error: mapped.message, code: mapped.code, retryable: mapped.retryable },
        { status: mapped.status },
      );
    }
    return NextResponse.json(
      {
        error:
          "EB Studio Pro received an incomplete writing response. Your book details are still safe, so please try Generate again.",
        code: "incomplete_response",
        retryable: true,
      },
      { status: 500 },
    );
  }
}

async function createAssistantResponse(body: RequestBody) {
  const {
    brief,
    mode,
    assistantPrompt = "",
    assistantHistory = [],
    manuscript,
    activeSection = 0,
    creationMode = "single",
    dualContext = null,
  } = body;
  const isDual = creationMode === "dual";
  const romance = isRomanceBrief(mode, brief);
  const selected = manuscript?.sections?.[activeSection];
  const modeContext = isDual
    ? `This is a DUAL BOOK PROJECT: one shared concept becomes two connected books, a fiction novel and a non-fiction guide.
Shared project title: ${dualContext?.title || brief.title || "Not set"}
Shared concept: ${dualContext?.concept || "Not set"}
Shared audience: ${dualContext?.audience || "Not set"}
Fiction subtitle: ${dualContext?.fictionSubtitle || "Not set"}
Non-fiction subtitle: ${dualContext?.nonfictionSubtitle || "Not set"}
Generated fiction title: ${dualContext?.fictionTitle || "Not generated yet"}
Generated non-fiction title: ${dualContext?.nonfictionTitle || "Not generated yet"}`
    : mode === "fiction"
      ? `Genre: ${brief.genre || "Not set"}
Characters: ${brief.characters || "Not set"}
Premise: ${brief.premise || "Not set"}`
      : `Topic: ${brief.topic || "Not set"}
Audience: ${brief.audience || "Not set"}
Key points: ${brief.keyPoints || "Not set"}`;
  const history = assistantHistory
    .slice(-6)
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n");
  const sectionContext = selected
    ? `Selected section: ${selected.title ?? "Untitled"}
Selected section content:
${String(selected.content ?? "").slice(0, 14000)}`
    : "No manuscript section is currently selected.";
  const bookSections = manuscript?.sections
    ?.slice(0, 40)
    .map((section, index) => `${index + 1}. ${section.title}: ${section.summary ?? ""}`)
    .join("\n");

  const generated = await generateJson(
    {
      name: "eb_creative_assistant",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          comments: { type: "string" },
          verdict: { type: "string" },
          answer: { type: "string" },
          draft: { type: "string" },
          fieldSuggestions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                field: { type: "string" },
                value: { type: "string" },
              },
              required: ["field", "value"],
            },
          },
          target: {
            type: "string",
            enum: ["none", "title", "section", "article"],
          },
        },
        required: [
          "comments",
          "verdict",
          "answer",
          "draft",
          "fieldSuggestions",
          "target",
        ],
      },
      instructions:
        "You are EB Creative Assistant, a senior ebook editor, fiction and non-fiction book developer, article strategist, and repurposing specialist. Preserve this response order: first comments, then verdict, then the direct help. Comments must briefly assess what is strong, weak, missing, or unclear in the user's current idea. Verdict must be one decisive sentence stating whether the concept works and what direction to take. Answer must be a short transition or recommendation that follows the verdict. When the user asks for help creating, strengthening, filling in, or completing a book concept or brief, organize every ready-to-paste suggestion in fieldSuggestions instead of blending fields into one paragraph. For fiction use the exact field names Genre, Main Characters, and Plot Premise. When the genre names romance, apply the romance brief rules supplied in the input: the love story must be the main plot, subgenre labels must match what the premise actually contains, both leads need a wound and a blocking belief, and the ending must put the couple together on the page. If the premise the user gives you is not actually romance, say that directly in the verdict instead of accepting it. Any time you touch a romance brief, include Genre in fieldSuggestions alongside whatever else you changed, written as a specific subgenre rather than the bare word Romance. For non-fiction use the exact field names Topic, Target Audience, and Key Points. For a dual book project use the exact field names Shared Concept, Shared Audience, Fiction Subtitle, and Non-Fiction Subtitle, and make sure the fiction and non-fiction sides express the same core theme through different framing: the novel delivers the emotional experience through story, the guide delivers the practical transformation through instruction. When advising on a dual project, always consider both books together and flag any drift between them. Include only the fields relevant to the request; include all of them when the user asks for broad concept help. Each value must stand alone and be ready to paste into its matching form field. Use Book Title only when the user asks for title help. For section editing, manuscript analysis, and article requests, return an empty fieldSuggestions array. When the user asks for cover art help, ideas, or direction, return the art direction in fieldSuggestions using the exact field name Cover Direction, or for a dual book project use the two exact field names Fiction Cover Direction and Non-Fiction Cover Direction. Each cover value must be one paste-ready paragraph written as a literal scene description: the setting, the single focal subject, the lighting and mood, the color feel, and an explicit list of what to avoid. Prefer a photographic scene over graphic symbols. Never suggest hearts, broken hearts, wedding rings, roses, or other worn relationship cliches. Keep the composition simple enough to stay readable at thumbnail size, which means one clear focal point and no crowded scenes. Do not describe the title text, typography, or author name, because those are added separately by the app. For a dual project, the two cover directions must share the same photographic treatment, lighting, and palette so the pair is visually recognizable as one series, and differ only in the subject of the scene. When the user asks for a deliverable, provide publication-ready copy in draft. Never claim guaranteed virality, invent research, imitate a living author, or use the em dash character. Keep every response concise. Use target title only when draft is a replacement title, section only when draft is a full replacement for the selected manuscript section, article for a standalone article, and none otherwise. If target is none, draft may contain other ready-to-use copy or be empty.",
      input: `Current book context:
Mode: ${isDual ? "dual book project (fiction + non-fiction together)" : mode}
Title: ${brief.title || "Not set"}
Author: ${brief.author || "Not set"}
${modeContext}
Subtitle: ${manuscript?.subtitle ?? "Not generated"}

Book section map:
${bookSections || "No generated sections yet."}

${sectionContext}

Recent conversation:
${history || "No earlier messages."}

User request:
${assistantPrompt.trim()}

${romance ? `${ROMANCE_BRIEF_RULES}\n\n` : ""}Response pattern for this ${isDual ? "dual book project" : mode === "fiction" ? "fiction" : "non-fiction"} book:${
  isDual
    ? "Shared Concept, Shared Audience, Fiction Subtitle, Non-Fiction Subtitle"
    : mode === "fiction"
      ? "Genre, Main Characters, Plot Premise"
      : "Topic, Target Audience, Key Points"
}

Return a brief editorial assessment in comments, followed by one decisive sentence in verdict. Then respond with one concise framing sentence in answer. Put concept and brief suggestions into separate fieldSuggestions entries using the exact matching field names above. Put any ready-to-use rewritten title, full replacement section, or standalone article in draft. Do not put explanations inside draft.`,
      maxOutputTokens: selected ? 5000 : 3000,
    },
    body.provider ?? "auto",
  );

  return {
    comments: String(generated.output.comments ?? ""),
    verdict: String(generated.output.verdict ?? ""),
    answer: String(generated.output.answer ?? ""),
    draft: String(generated.output.draft ?? ""),
    fieldSuggestions: Array.isArray(generated.output.fieldSuggestions)
      ? generated.output.fieldSuggestions
      : [],
    target: String(generated.output.target ?? "none"),
    provider: generated.provider,
  };
}

async function createExistingEbookAudit(body: RequestBody) {
  const source = body.existingBook;
  if (!source?.text) throw new Error("Missing ebook text.");
  const generated = await generateJson(
    {
      name: "existing_ebook_audit",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          audit: {
            type: "object",
            additionalProperties: false,
            properties: {
              score: { type: "integer" },
              positioning: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              weaknesses: { type: "array", items: { type: "string" } },
              title: { type: "string" },
              subtitle: { type: "string" },
              audience: { type: "string" },
              recommendations: { type: "array", items: { type: "string" } },
            },
            required: ["score", "positioning", "strengths", "weaknesses", "title", "subtitle", "audience", "recommendations"],
          },
        },
        required: ["audit"],
      },
      instructions:
        "You are the senior acquisition editor and commercial book strategist inside EB Studio Pro. Audit the uploaded manuscript honestly. Improve market positioning without misleading clickbait, invented claims, or guaranteed virality. Preserve the author's core intent and voice. Never use the em dash character.",
      input: `Audit this existing ${body.mode === "fiction" ? "fiction" : "non-fiction"} ebook for a ${source.optimizationMode ?? "relaunch"} optimization.

Current title: ${body.brief.title}
Author: ${body.brief.author}
Detected section map:
${source.sectionMap ?? "Not available"}

Manuscript:
${source.text.slice(0, 90000)}

Return:
1. A market-readiness score from 0 to 100.
2. Specific positioning.
3. Exactly 3 strengths and 3 weaknesses.
4. One commercially stronger but accurate title and subtitle.
5. A precise target audience.
6. Exactly 5 prioritized recommendations.
Do not rewrite the manuscript yet.`,
      maxOutputTokens: 3000,
    },
    body.provider ?? "auto",
    body.preferredProvider,
  );
  return { audit: generated.output.audit, provider: generated.provider };
}

async function optimizeExistingEbookSection(body: RequestBody) {
  const source = body.existingBook;
  if (!source?.sectionText) throw new Error("Missing ebook section.");
  const mode = source.optimizationMode ?? "polish";
  const instruction =
    mode === "viral"
      ? "Strengthen the opening hook, emotional or practical payoff, memorable phrasing, and quotable ideas while preserving truth and substance."
      : mode === "relaunch"
        ? "Perform a premium developmental and line edit: strengthen structure, hook, clarity, pacing, payoff, and commercial reader appeal."
        : "Polish clarity, pacing, repetition, transitions, and prose while preserving the author's voice and meaning.";

  const generated = await generateJson(
    {
      name: "optimized_existing_ebook_section",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          content: { type: "string" },
          summary: { type: "string" },
        },
        required: ["content", "summary"],
      },
      instructions:
        "You are the senior developmental editor inside EB Studio Pro. Edit publication-ready long-form prose without changing facts, fabricating evidence, or erasing the author's voice. Preserve the original language unless clarity requires otherwise. Never use the em dash character. Return only the revised section and a compact continuity summary.",
      input: `Optimize section ${(source.sectionIndex ?? 0) + 1} of ${source.sectionCount ?? 1} from an existing ${body.mode === "fiction" ? "fiction" : "non-fiction"} ebook.

Book title: ${body.brief.title}
Section title: ${source.sectionTitle ?? "Untitled"}
Approved audit:
${JSON.stringify(source.audit ?? {})}

Editing direction:
${instruction}

Original section:
${source.sectionText.slice(0, 45000)}

Preserve all essential information, scenes, arguments, examples, and meaning. Remove accidental repetition. Do not repeat the section title inside content. Do not mention AI, prompts, editing, or the audit.`,
      maxOutputTokens: 7500,
    },
    body.provider ?? "auto",
    body.preferredProvider,
  );
  return { ...generated.output, provider: generated.provider };
}

async function createVisualStoryboard(body: RequestBody) {
  const project = body.visualProject;
  if (!project) throw new Error("Missing visual book details.");
  const pageCount = [5, 7, 10].includes(Number(project.pageCount)) ? Number(project.pageCount) : 7;
  const comic = project.mode === "comic";
  const generated = await generateJson({
    name: comic ? "comic_short_storyboard" : "visual_mini_ebook_storyboard",
    schema: { type: "object", additionalProperties: false, properties: { refined_subtitle: { type: "string" }, character_bible: { type: "string" }, palette: { type: "string" }, pages: { type: "array", items: visualPageSchema } }, required: ["refined_subtitle", "character_bible", "palette", "pages"] },
    instructions: comic
      ? "You are the graphic-story director inside EB Studio Pro. Create concise, visually clear, original comic storyboards with consistent characters, deliberate panel rhythm, readable dialogue, and a complete emotional arc. Never imitate a living artist or copyrighted franchise. Never use the em dash character."
      : "You are the visual publishing director inside EB Studio Pro. Create concise, premium mini ebooks where every page has one clear job, short publication-ready copy, and art direction that materially supports the text. Never invent factual claims, research, credentials, or statistics. Never use the em dash character.",
    input: `${visualProjectContext(project)}

Create exactly ${pageCount} total pages, including the cover. Page 1 is the cover. The final page must provide a satisfying resolution for a story, or a focused takeaway and call to action for a guide, teaser, lead magnet, or product book.

${comic
  ? `This is a comic. Every non-cover page must contain 1 to 4 panels. Use the selected ${project.comicFormat} format. Put all spoken words in dialogue, narration in caption, and optional short impact lettering in sound_effect. Keep every dialogue line concise enough to fit in a speech bubble. The page body may contain a one-sentence page note but must not repeat the dialogue. For the cover return one panel. Each panel scene must describe only the visible art, without speech bubbles, captions, lettering, written signs, watermarks, or logos.`
  : `This is an image-rich mini ebook, not a chapter book. Keep cover body to one short hook. Keep every other body between 25 and 90 words, using fewer words when the image carries the moment. Return an empty panels array and panel_count 0 on every page. Rotate layouts so consecutive pages do not all look identical. Every image_prompt must describe only visible artwork and must explicitly exclude words, letters, captions, typography, logos, and watermarks.`}

Maintain a single narrative or instructional progression with no repeated page purpose. The title supplied by the author is authoritative and must not be changed. If the subtitle is blank, create one in refined_subtitle. If the author supplied one, return it exactly. Strengthen the character bible and palette only when their fields are blank. Return exactly ${pageCount} page objects numbered 1 through ${pageCount}.`,
    maxOutputTokens: comic ? 9000 : 6500,
  }, body.provider ?? "auto", body.preferredProvider);
  const pages = Array.isArray(generated.output.pages) ? generated.output.pages : [];
  if (pages.length !== pageCount) throw new ProviderRequestError(generated.provider, 502, "invalid_response", `The visual storyboard did not contain exactly ${pageCount} pages.`);
  return { ...generated.output, provider: generated.provider };
}

async function rewriteVisualPage(body: RequestBody) {
  const project = body.visualProject;
  const page = project?.page;
  if (!project || !page) throw new Error("Missing visual page details.");
  const comic = project.mode === "comic";
  const pageMap = (project.pages ?? []).map((item) => `${item.pageNumber}. ${item.title}: ${item.body}`).join("\n");
  const generated = await generateJson({
    name: comic ? "rewrite_comic_page" : "rewrite_visual_ebook_page",
    schema: { type: "object", additionalProperties: false, properties: { page: visualPageSchema }, required: ["page"] },
    instructions: comic
      ? "You are the graphic-story editor inside EB Studio Pro. Rewrite one comic page while preserving continuity, character identity, reading order, and the story's ending. Keep dialogue short and natural. Never use the em dash character."
      : "You are the visual mini-book editor inside EB Studio Pro. Rewrite one page for clarity, emotional force, and visual rhythm without changing the book's central promise. Never invent factual claims. Never use the em dash character.",
    input: `${visualProjectContext(project)}

Full page map:
${pageMap || "Only one page is available."}

Rewrite page ${page.pageNumber} only.
Current title: ${page.title}
Current body: ${page.body}
Current art direction: ${page.imagePrompt}

Preserve its role in the complete book and return the same page_number. ${comic
  ? "Return 1 to 4 panels. Put spoken words only in dialogue, narration only in caption, and visible impact lettering only in sound_effect. Panel scene art directions must exclude all written words, speech bubbles, signs, logos, and watermarks."
  : "Return no panels, panel_count 0, and 25 to 90 words of body copy unless this is the cover. The image_prompt must exclude all words, lettering, typography, logos, and watermarks."}`,
    maxOutputTokens: comic ? 3400 : 1800,
  }, body.provider ?? "auto", body.preferredProvider);
  return { ...generated.output, provider: generated.provider };
}

function visualProjectContext(project: VisualBookBrief) {
  return `Visual project mode: ${project.mode === "comic" ? "comic and graphic story" : "visual mini ebook"}
Title: ${project.title}
Subtitle: ${project.subtitle || "Create one if useful"}
Author: ${project.author}
Content type: ${project.mode === "comic" ? project.comicFormat : project.kind}
Premise or core promise: ${project.premise}
Target reader: ${project.audience || "General readers"}
Visual style: ${project.visualStyle}
Character consistency bible: ${project.characterBible || "Create a concise locked visual description for every recurring character"}
Color and lighting palette: ${project.palette || "Create one coherent palette and lighting direction"}`;
}

async function createTitleSuggestions(
  mode: Mode,
  title: string,
  provider: AIProvider,
) {
  const generated = await generateJson(
    {
      name: "ebook_title_suggestions",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          suggestions: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["suggestions"],
      },
      instructions:
        "You are the senior book title strategist inside EB Studio Pro. Create commercially strong, original titles with clear reader appeal. Never promise virality, use misleading clickbait, copy a famous title, invent claims, or use the em dash character.",
      input:
        mode === "fiction"
          ? `Improve this fiction book title:

Original title: ${title.trim()}

Return exactly three concise alternatives. Preserve the core story idea while making each option more memorable, emotionally intriguing, genre-aware, and easy to recognize on a book cover. Return title text only, without subtitles, quotation marks, numbering, or commentary.`
          : `Improve this non-fiction book title:

Original title: ${title.trim()}

Return exactly three concise alternatives. Preserve the core topic while making each option more specific, benefit-led, searchable, credible, and easy to recognize on a book cover. Do not make unverifiable promises. Return title text only, without subtitles, quotation marks, numbering, or commentary.`,
      maxOutputTokens: 500,
    },
    provider,
  );

  const suggestions = Array.isArray(generated.output.suggestions)
    ? generated.output.suggestions
        .map((item) => String(item).trim())
        .filter(
          (item, index, items) =>
            item.length > 0 &&
            item.toLocaleLowerCase() !== title.trim().toLocaleLowerCase() &&
            items.indexOf(item) === index,
        )
        .slice(0, 3)
    : [];

  if (suggestions.length === 0) {
    throw new ProviderRequestError(
      generated.provider,
      502,
      "invalid_response",
      "The AI provider did not return a usable title suggestion.",
    );
  }

  return { suggestions, provider: generated.provider };
}

async function createBookBrief(
  mode: Mode,
  brief: BookBrief,
  provider: AIProvider,
  avoidNames?: string[],
) {
  const title = brief.title;
  /**
   * Guessing the genre from the title alone is how a forced proximity romance
   * came back as literary suspense. When the author has already named the
   * genre, that choice wins and the rest of the brief is built to serve it.
   */
  const requestedGenre = mode === "fiction" ? String(brief.genre ?? "").trim() : "";
  const romance = requestedGenre.length > 0 && /romance|romantic|romantasy/i.test(requestedGenre);
  const genreDirection = requestedGenre
    ? `The author has already chosen the genre: ${requestedGenre}
Return that genre, or a more precise subgenre of it if one fits the title better. Never return a different genre. Build the characters and the premise to deliver what a reader of this genre is buying, and do not drift into a neighbouring category.`
    : "Choose a precise genre or genre blend.";
  const fictionProperties = {
    genre: { type: "string" },
    characters: { type: "string" },
    premise: { type: "string" },
    chapter_count: {
      type: "integer",
      description: "Recommended main chapter count, ideally between 8 and 12.",
    },
  };
  const nonfictionProperties = {
    topic: { type: "string" },
    audience: { type: "string" },
    key_points: { type: "string" },
    chapter_count: {
      type: "integer",
      description: "Recommended main chapter count, ideally between 8 and 12.",
    },
  };
  const properties = mode === "fiction" ? fictionProperties : nonfictionProperties;
  const required =
    mode === "fiction"
      ? ["genre", "characters", "premise", "chapter_count"]
      : ["topic", "audience", "key_points", "chapter_count"];

  /**
   * The exclusion list keeps a new book from reusing names and settings from the
   * author's earlier books, but it is a long block of prompt and it must never be
   * the reason a book cannot be started. If the model comes back with nothing,
   * the same request runs once more without it.
   */
  const briefRequest = (avoid?: string[]) => ({
      name: mode === "fiction" ? "fiction_book_brief" : "nonfiction_book_brief",
      schema: {
        type: "object",
        additionalProperties: false,
        properties,
        required,
      },
      instructions:
        "You are the senior book development editor inside EB Studio Pro. Turn a title into a specific, commercially promising, original book brief. Make every field immediately useful to a long-form writer. Never use the em dash character. Do not change or repeat the supplied title.",
      input:
        mode === "fiction"
          ? `Create an editable fiction book brief for this title:

Title: ${title.trim()}

${genreDirection} Describe 2 to 4 main characters with names, motivations, conflicts, and relevant relationships. Write a focused plot premise with the central conflict, stakes, story engine, and a clear sense of progression. Recommend 8 to 12 main chapters.${romance ? `\n\n${ROMANCE_BRIEF_RULES}` : ""}${avoidanceRules(avoid)}`
          : `Create an editable non-fiction book brief from this title only:

Title: ${title.trim()}

Define a focused topic, a specific target audience including their needs or level, and a practical list of 6 to 10 key points that form a logical learning journey. Recommend 8 to 12 main chapters. Do not invent unverifiable credentials, statistics, or claims.`,
      maxOutputTokens: 4000,
  });

  let generated;
  try {
    generated = await generateJson(briefRequest(avoidNames), provider);
  } catch (error) {
    const empty =
      error instanceof ProviderRequestError && error.code === "empty_response";
    const emptyForAll =
      error instanceof MultiProviderRequestError &&
      error.failures.every((failure) => failure.code === "empty_response");
    if (!avoidNames?.length || !(empty || emptyForAll)) throw error;
    console.warn("Brief returned empty, retrying without the exclusion list");
    generated = await generateJson(briefRequest(), provider);
  }

  return {
    ...generated.output,
    chapter_count: Math.min(
      20,
      Math.max(3, Number(generated.output.chapter_count) || 8),
    ),
    provider: generated.provider,
  };
}

async function createDualBookSeed(body: RequestBody) {
  const generated = await generateJson(
    {
      name: "dual_book_seed",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          concept: { type: "string" },
          audience: { type: "string" },
          fiction_subtitle: { type: "string" },
          nonfiction_subtitle: { type: "string" },
          chapter_count: { type: "integer" },
        },
        required: [
          "concept",
          "audience",
          "fiction_subtitle",
          "nonfiction_subtitle",
          "chapter_count",
        ],
      },
      instructions:
        "You are the dual-book strategist inside EB Studio Pro. Turn one title into a commercially coherent fiction and non-fiction companion-pair direction. Both books must share a central theme, audience connection, and transformation while remaining original and standalone. Write distinct subtitles that clearly identify the fiction experience and practical non-fiction promise. Never use the em dash character. Never invent research, statistics, credentials, or clinical claims.",
      input: `Create editable starting details for a fiction and non-fiction companion pair.

Shared main title: ${body.brief.title.trim()}
Author: ${body.brief.author || "Sulong"}

Return a specific shared central concept, a focused shared target audience, one fiction subtitle, one non-fiction subtitle, and a recommended main chapter count between 8 and 12.`,
      maxOutputTokens: 1600,
    },
    body.provider ?? "auto",
    body.preferredProvider,
  );

  return {
    ...generated.output,
    chapter_count: Math.min(
      20,
      Math.max(3, Number(generated.output.chapter_count) || 8),
    ),
    provider: generated.provider,
  };
}

async function createCompanionBrief(body: RequestBody) {
  const sourceMode = body.sourceMode ?? (body.mode === "fiction" ? "nonfiction" : "fiction");
  if (sourceMode === body.mode) {
    throw new Error("A companion book must use the opposite book type.");
  }

  const fictionProperties = {
    genre: { type: "string" },
    characters: { type: "string" },
    premise: { type: "string" },
    chapter_count: { type: "integer" },
  };
  const nonfictionProperties = {
    topic: { type: "string" },
    audience: { type: "string" },
    key_points: { type: "string" },
    chapter_count: { type: "integer" },
  };
  const sectionMap = body.manuscript?.sections
    ?.slice(0, 40)
    .map((section, index) => `${index + 1}. ${section.title ?? "Untitled"}: ${section.summary ?? ""}`)
    .join("\n");
  const sourceContext =
    sourceMode === "fiction"
      ? `Genre: ${body.brief.genre}\nCharacters: ${body.brief.characters}\nPlot premise: ${body.brief.premise}`
      : `Topic: ${body.brief.topic}\nAudience: ${body.brief.audience}\nKey points: ${body.brief.keyPoints}`;
  const targetInstruction =
    body.mode === "fiction"
      ? "Create an original fiction companion that dramatizes the source book's central principles through specific characters, conflict, stakes, and a complete story engine. It must stand alone as a novel and must not read like lessons disguised as dialogue."
      : "Create a practical non-fiction companion that transforms the source story's central emotional themes and conflicts into a clear learning journey. It must stand alone as a useful guide, must not retell the plot chapter by chapter, and must not invent research, statistics, credentials, or clinical claims.";
  const properties = body.mode === "fiction" ? fictionProperties : nonfictionProperties;
  const required =
    body.mode === "fiction"
      ? ["genre", "characters", "premise", "chapter_count"]
      : ["topic", "audience", "key_points", "chapter_count"];

  const generated = await generateJson(
    {
      name: body.mode === "fiction" ? "fiction_companion_brief" : "nonfiction_companion_brief",
      schema: {
        type: "object",
        additionalProperties: false,
        properties,
        required,
      },
      instructions:
        "You are the companion-book architect inside EB Studio Pro. Build a commercially coherent companion in the opposite format while preserving the source book's core theme, emotional promise, audience connection, and premium tone. The companion must be original, standalone, and non-duplicative. Never use the em dash character. Do not return or change the supplied title.",
      input: `Create an editable ${body.mode === "fiction" ? "fiction" : "non-fiction"} companion brief for this completed ${sourceMode === "fiction" ? "fiction" : "non-fiction"} book.

Shared main title: ${body.manuscript?.title ?? body.brief.title}
Source subtitle: ${body.manuscript?.subtitle ?? ""}
Author: ${body.brief.author}

Source brief:
${sourceContext}

Source section map:
${sectionMap || "No section summaries available."}

${targetInstruction}

Recommend 8 to 12 main chapters. Return only the target brief fields.`,
      maxOutputTokens: 2200,
    },
    body.provider ?? "auto",
    body.preferredProvider,
  );

  return {
    ...generated.output,
    chapter_count: Math.min(
      20,
      Math.max(3, Number(generated.output.chapter_count) || 8),
    ),
    provider: generated.provider,
  };
}

async function createDualBookBrief(body: RequestBody) {
  const concept = String(body.dualPair?.concept ?? "").trim();
  const audience = String(body.dualPair?.audience ?? "").trim();
  if (!concept || !audience) {
    throw new Error("Add the shared concept and target audience for the dual book pair.");
  }

  const generated = await generateJson(
    {
      name: "dual_book_pair_brief",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          fiction: {
            type: "object",
            additionalProperties: false,
            properties: {
              genre: { type: "string" },
              characters: { type: "string" },
              premise: { type: "string" },
            },
            required: ["genre", "characters", "premise"],
          },
          nonfiction: {
            type: "object",
            additionalProperties: false,
            properties: {
              topic: { type: "string" },
              audience: { type: "string" },
              key_points: { type: "string" },
            },
            required: ["topic", "audience", "key_points"],
          },
        },
        required: ["fiction", "nonfiction"],
      },
      instructions:
        "You are the dual-book architect inside EB Studio Pro. Build two original, commercially coherent books from one shared concept: one fiction and one non-fiction. They must share the same central theme, emotional promise, audience connection, and premium tone while remaining standalone and non-duplicative. The fiction must dramatize rather than teach. The non-fiction must teach rather than retell the plot. Never use the em dash character. Never invent research, statistics, credentials, or clinical claims.",
      input: `Create aligned briefs for a fiction and non-fiction companion pair.

Shared main title: ${body.brief.title}
Author: ${body.brief.author}
Shared concept: ${concept}
Target audience: ${audience}
Fiction subtitle: ${String(body.dualPair?.fictionSubtitle ?? "").trim() || "To be created during outlining"}
Non-fiction subtitle: ${String(body.dualPair?.nonfictionSubtitle ?? "").trim() || "To be created during outlining"}

For fiction, return a precise genre, 2 to 4 developed main characters, and a focused plot premise with conflict, stakes, progression, and a complete story engine.

For non-fiction, return a focused topic, a specific audience description, and 6 to 10 practical key points forming a logical transformation. The two books should feel intentionally paired without duplicating chapters or prose.`,
      maxOutputTokens: 3200,
    },
    body.provider ?? "auto",
    body.preferredProvider,
  );

  return { ...generated.output, provider: generated.provider };
}

export type { BookLength } from "@/app/book-types";
import type { BookLength } from "@/app/book-types";

const BOOK_LENGTH_TARGETS: Record<
  BookLength,
  { chapter: string; bookend: string; tokens: number }
> = {
  novella: {
    chapter: "1,000 to 1,500 words",
    bookend: "700 to 1,000 words",
    tokens: 7000,
  },
  standard: {
    chapter: "2,200 to 3,000 words",
    bookend: "1,200 to 1,800 words",
    tokens: 12000,
  },
  long: {
    chapter: "3,200 to 4,200 words",
    bookend: "1,600 to 2,400 words",
    tokens: 16000,
  },
};

const ROMANCE_BRIEF_RULES = `Romance brief rules, applied whenever the genre names romance, romantic, or romantasy:
The Plot Premise must make the love story the main plot. If the premise you are given spends most of its length on family history, illness, career, or a mystery while the couple gets one sentence, that is women's fiction or family drama with a romantic subplot, not romance. Say so plainly in the verdict and rewrite the premise so the relationship is the spine and every other thread exists to pressure it.
Subgenre labels are promises with fixed meanings. Second chance requires that the two leads were in a relationship before and it ended; strangers meeting for the first time is not second chance. Enemies to lovers requires real opposition, not mild friction. Do not attach a subgenre label the premise does not earn, and if the label and the story disagree, fix one and name which you fixed.
Main Characters must give both leads a wound, a want, and the specific belief that stops them from being together. Name the obstacle between them and make it a conviction that has to break on the page, not a circumstance that can dissolve offstage.
The premise must state the dark moment where the relationship looks lost, and the recovery must be earned by a specific choice one lead makes, never by circumstances changing on their own.
The climax must belong to the couple. If the highest emotional point of the story is a parent, a child, a secret, or a death, move it earlier and let the romantic resolution carry the ending.
The ending must be a happy or hopeful ending with the couple together, stated on the page. Never leave it ambiguous, and never resolve the story by pairing either lead with someone else.
Do not include completed on-page infidelity in a romance premise.
Whenever you touch a romance brief, always return a Genre field as well, even if the user only asked about the premise or the characters. Write it as the specific subgenre the premise actually earns, followed by any secondary element, for example "Contemporary second chance romance with intergenerational family drama". Never return a bare "Romance". If the genre the user supplied does not match the premise, return the corrected genre and state in the verdict which one you changed and why.`;

/**
 * Romance is a promise, not a flavour. Readers of the genre expect a central
 * love story, both leads on the page, and an emotionally satisfying ending.
 * Breaking that promise is the fastest route to one-star reviews, so when the
 * brief asks for romance the structure rules below are enforced everywhere.
 */
function isRomanceBrief(mode: Mode, brief: BookBrief) {
  if (mode !== "fiction") return false;
  return /romance|romantic|romantasy/i.test(String(brief.genre ?? ""));
}

const ROMANCE_STRUCTURE_RULES = `Romance genre requirements, non-negotiable:
The central plot is the love story between the two leads. Every chapter must move their relationship, not only their circumstances.
Both leads carry point-of-view chapters. Alternate between them so the reader lives inside both sides of the conflict.
Give the pair a clear reason they cannot simply be together, and resolve that reason on the page rather than dissolving it offstage.
Build toward a dark moment where the relationship looks lost, then earn the recovery through a specific choice one or both leads make.
End with a happy or hopeful ending in which the couple is together and the emotional debt to the reader is paid in full. Never end on ambiguity about whether they stay together.
Do not introduce infidelity that is completed on the page, and do not resolve the story by pairing either lead with someone else.`;

const ROMANCE_POV_RULES = `Point of view assignment, required for this outline:
Name the two point-of-view leads in pov_leads, first the lead who opens the book, then the other. Use the exact names as they appear in the character list.
Give every chapter a pov value naming exactly one of those two leads, and alternate them chapter by chapter so the reader lives inside both sides of the conflict.
Write each chapter purpose from inside its assigned point of view: the scene has to be one that lead is actually present for, and the turn in it has to be something that lead can see, feel, or decide.
Never assign a chapter to a character who is not one of the two leads, and never leave a chapter pov empty.`;

/**
 * A flat outline budget is what broke a 24 chapter book. Every chapter costs a
 * title, a purpose, and now a point of view, and on the OpenAI path reasoning
 * tokens are charged against the same ceiling. Run out and the JSON is cut off
 * mid object, which surfaces as an unexplained writing service failure. The
 * budget scales with the book and never drops below the old fixed value.
 */
/**
 * Every book in this app is generated from a blank slate, so the model reaches
 * for the same handful of names and settings each time. Book three brought back
 * a character from book one and an antagonist surname from book two without
 * either appearing in its brief. This turns the author's existing library into
 * an explicit exclusion list.
 */
function avoidanceRules(avoidNames: string[] | undefined) {
  const names = (avoidNames ?? [])
    .map((name) => String(name).trim())
    .filter(Boolean)
    .slice(0, 60);
  if (!names.length) return "";
  return `
This author already has other books in the same series, and readers see them side by side. Nothing below may be reused.

Already used, do not use any of these as the name of any character, family, business, street, building, or town, and do not use a near variant of one either, such as a different first name with the same surname or a name that differs by one or two letters:
${names.join(", ")}

Invent fresh names that share no surname and no distinctive sound with that list. Give this book its own occupation for each lead, its own kind of workplace, and its own town. Do not repeat the situation that traps the couple together in an earlier book.`;
}

function outlineTokenBudget(chapterCount: number) {
  const chapters = Math.max(1, Number(chapterCount) || 8);
  return Math.min(16000, Math.max(5000, 3000 + chapters * 320));
}

async function createOutline(
  mode: Mode,
  brief: BookBrief,
  provider: AIProvider,
  preferredProvider?: ActiveAIProvider,
  avoidNames?: string[],
) {
  const requestedSubtitle = String(brief.subtitle ?? "").trim();
  const romance = isRomanceBrief(mode, brief);
  const modeContext =
    mode === "fiction"
      ? `Genre: ${brief.genre}
Main characters: ${brief.characters}
Plot premise: ${brief.premise}`
      : `Topic: ${brief.topic}
Target audience: ${brief.audience}
Key points: ${brief.keyPoints}`;
  const openingName = mode === "fiction" ? "Prologue" : "Introduction";
  const closingName = mode === "fiction" ? "Epilogue" : "Conclusion";

  const generated = await generateJson(
    {
      name: "ebook_outline",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          subtitle: { type: "string" },
          introduction_title: { type: "string" },
          introduction_purpose: { type: "string" },
          pov_leads: {
            type: "array",
            items: { type: "string" },
            description:
              "For romance, the two point-of-view lead names in the order their chapters alternate. Empty array for every other book.",
          },
          chapters: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                number: { type: "integer" },
                title: { type: "string" },
                purpose: { type: "string" },
                pov: {
                  type: "string",
                  description:
                    "The single character whose point of view this chapter is written from. Empty string when the book is not romance.",
                },
              },
              required: ["number", "title", "purpose", "pov"],
            },
          },
          conclusion_title: { type: "string" },
          conclusion_purpose: { type: "string" },
        },
        required: [
          "subtitle",
          "introduction_title",
          "introduction_purpose",
          "pov_leads",
          "chapters",
          "conclusion_title",
          "conclusion_purpose",
        ],
      },
      instructions:
        "You are the senior book architect inside EB Studio Pro. Design commercially strong, coherent full-length ebooks. Use precise titles, avoid generic filler, and never use the em dash character.",
      input: `Create the complete structure for a ${mode === "fiction" ? "fiction" : "non-fiction"} ebook.

Title: ${brief.title}
Subtitle: ${requestedSubtitle || "Create a strong subtitle for this book."}
Author: ${brief.author}
Requested main chapters: exactly ${brief.chapterCount}
${modeContext}
${romance ? `\n${ROMANCE_STRUCTURE_RULES}\n\n${ROMANCE_POV_RULES}\n` : "\nThis book does not use assigned chapter viewpoints. Return an empty pov_leads array and an empty pov string for every chapter.\n"}

Return exactly ${brief.chapterCount} numbered chapters plus an opening called ${openingName} and a closing called ${closingName}. In every title field, return only the distinctive descriptive title. Do not include ${openingName}, ${closingName}, "Chapter", or chapter numbers because EB Studio Pro adds those labels during formatting. Build a deliberate progression with no duplicate chapter purposes. ${requestedSubtitle ? `Return the supplied subtitle exactly as written: ${requestedSubtitle}` : "Create a subtitle that makes the promise or story tension sharper."}${avoidanceRules(avoidNames)}`,
      maxOutputTokens: outlineTokenBudget(brief.chapterCount),
    },
    provider,
    preferredProvider,
  );

  const output = generated.output;
  const chapters = Array.isArray(output.chapters) ? output.chapters : [];
  if (chapters.length !== brief.chapterCount) {
    throw new ProviderRequestError(
      generated.provider,
      502,
      "invalid_response",
      "The outline did not contain the requested chapter count.",
    );
  }

  const leads = romance ? readPovLeads(output, chapters) : [];
  const chapterPovs = assignAlternatingPov(
    chapters.map((chapter) => String((chapter as { pov?: unknown }).pov ?? "").trim()),
    leads,
  );
  const lastChapterPov = chapterPovs.at(-1) ?? "";
  const closingPov =
    leads.length === 2
      ? leads.find((lead) => lead !== lastChapterPov) ?? leads[1]
      : "";

  const plan: SectionPlan[] = [
    {
      kind: "introduction",
      title: String(output.introduction_title),
      purpose: String(output.introduction_purpose),
      ...(leads[0] ? { pov: leads[0] } : {}),
    },
    ...chapters.map((chapter, index) => {
      const item = chapter as { title?: unknown; purpose?: unknown };
      const pov = chapterPovs[index] ?? "";
      return {
        kind: "chapter" as const,
        number: index + 1,
        title: String(item.title),
        purpose: String(item.purpose),
        ...(pov ? { pov } : {}),
      };
    }),
    {
      kind: "conclusion",
      title: String(output.conclusion_title),
      purpose: String(output.conclusion_purpose),
      ...(closingPov ? { pov: closingPov } : {}),
    },
  ];
  return {
    subtitle: requestedSubtitle || String(output.subtitle).trim(),
    plan,
    provider: generated.provider,
  };
}

/**
 * The outline is the only place that knows who each chapter belongs to. The two
 * lead names are taken from pov_leads first and from the chapter assignments
 * second, because without two names there is nothing to alternate between.
 */
function readPovLeads(output: JsonObject, chapters: unknown[]): string[] {
  const declared = Array.isArray(output.pov_leads)
    ? output.pov_leads.map((lead) => String(lead).trim()).filter(Boolean)
    : [];
  const assigned = chapters
    .map((chapter) => String((chapter as { pov?: unknown }).pov ?? "").trim())
    .filter(Boolean);
  const leads: string[] = [];
  for (const name of [...declared, ...assigned]) {
    const alreadyListed = leads.some(
      (lead) => lead.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!alreadyListed) leads.push(name);
  }
  return leads.slice(0, 2);
}

/**
 * A model told to alternate still drifts, usually back to whichever lead was
 * named first in the brief. That is exactly how book one ended up entirely in
 * one head. The returned assignments are kept when they already read as a real
 * alternation, and rewritten into a strict A B A B pattern when they do not.
 */
function assignAlternatingPov(povs: string[], leads: string[]): string[] {
  if (leads.length < 2) return povs.map(() => "");
  const normalized = povs.map((pov) => matchLead(pov, leads));
  const usesBothLeads = leads.every((lead) => normalized.includes(lead));
  let longestRun = 0;
  let currentRun = 0;
  normalized.forEach((pov, index) => {
    currentRun = index > 0 && pov === normalized[index - 1] ? currentRun + 1 : 1;
    if (currentRun > longestRun) longestRun = currentRun;
  });
  const alreadyAlternating =
    usesBothLeads && longestRun <= 2 && normalized.every((pov) => pov.length > 0);
  return alreadyAlternating ? normalized : povs.map((_, index) => leads[index % 2]);
}

function matchLead(pov: string, leads: string[]): string {
  const value = pov.trim().toLocaleLowerCase();
  if (!value) return "";
  const exact = leads.find((lead) => lead.toLocaleLowerCase() === value);
  if (exact) return exact;
  const partial = leads.find((lead) => {
    const name = lead.toLocaleLowerCase();
    return (
      value.includes(name) ||
      name.includes(value) ||
      name.split(/\s+/)[0] === value.split(/\s+/)[0]
    );
  });
  return partial ?? "";
}

async function createSection(body: RequestBody) {
  const {
    brief,
    mode,
    plan = [],
    section,
    sectionIndex = 0,
    previousSummaries = [],
    bookLength = "novella",
    avoidNames,
  } = body;
  const romance = isRomanceBrief(mode, brief);
  if (!section) throw new Error("Missing section.");

  const bookContext =
    mode === "fiction"
      ? `Genre: ${brief.genre}
Characters: ${brief.characters}
Premise: ${brief.premise}`
      : `Topic: ${brief.topic}
Audience: ${brief.audience}
Required points: ${brief.keyPoints}`;
  const fullOutline = plan
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}${item.pov ? ` [point of view: ${item.pov}]` : ""}: ${item.purpose}`,
    )
    .join("\n");
  const sectionPov = String(section.pov ?? "").trim();
  const continuity =
    previousSummaries.length > 0
      ? `Continuity from completed sections:
${previousSummaries.map((summary, index) => `${index + 1}. ${summary}`).join("\n")}`
      : "This is the first section.";
  const lengthBand = BOOK_LENGTH_TARGETS[bookLength] ?? BOOK_LENGTH_TARGETS.novella;
  const lengthTarget =
    section.kind === "chapter" ? lengthBand.chapter : lengthBand.bookend;

  const request: JsonRequest = {
      name: "ebook_section",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          content: { type: "string" },
          summary: { type: "string" },
        },
        required: ["content", "summary"],
      },
      instructions:
        "You are the premium long-form book writer and continuity editor inside EB Studio Pro. Write publication-ready prose. Never use the em dash character. Do not mention prompts, outlines, AI, or word counts. Avoid repetitive openings, canned transitions, fake quotations, and padded conclusions.",
      input: `Write one complete section of this ${mode === "fiction" ? "fiction" : "non-fiction"} ebook.

Book title: ${brief.title}
Author: ${brief.author}
${bookContext}

Full book structure:
${fullOutline}

Current section ${sectionIndex + 1} of ${plan.length}:
Type: ${section.kind}
Title: ${section.title}
Purpose: ${section.purpose}

${continuity}

Write ${lengthTarget}. Start directly with the section prose. Do not repeat the section title, section type, chapter number, Introduction, or Conclusion as a heading inside content. Never use a top-level # heading. Use clean Markdown with paragraphs and only useful internal subheadings that add new information.
${
  mode === "fiction"
    ? "Write in immersive scenes with specific sensory detail, emotional consequence, natural dialogue when appropriate, and forward story movement. Preserve character consistency and do not summarize scenes that should be dramatized."
    : "Teach with clarity and authority. Use concrete examples and practical steps where appropriate. Make each section useful on its own while advancing the book's central promise."
}
${romance ? `\n${ROMANCE_STRUCTURE_RULES}\n` : ""}${
  sectionPov
    ? `
Point of view for this section: ${sectionPov}. This overrides any general instruction to alternate viewpoints, because the alternation happens between sections and never inside one.
Write the whole section in close third person limited anchored to ${sectionPov}, from the first line to the last. Stay inside that character's body, senses, memory, and judgement.
Never state another character's private thoughts or feelings as fact. Everyone else is rendered only through what ${sectionPov} can see, hear, and infer, and the reading can be wrong.
Do not switch, share, or widen the point of view partway through, and do not open with a distant narrator before settling into the character.
`
    : ""
}
${
  mode === "fiction"
    ? `
Narrate this section in the past tense, the same as every other section of this book, including the opening and the closing. A book that switches tense in one chapter reads as an error. Dialogue, direct thought, and anything a character remembers are not bound by this; the narration is.
`
    : ""
}
The summary must be a compact continuity note of 2 to 4 sentences for the writer of the next section.

Any minor character you introduce must be named with a name that appears nowhere in the exclusion list below, and any business, street, or building you name is bound by the same list.${avoidanceRules(avoidNames)}`,
      maxOutputTokens: lengthBand.tokens,
    };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const generated = await generateJson(
      attempt === 0
        ? request
        : {
            ...request,
            input: `${request.input}\n\nThe previous response was incomplete. Return substantial finished prose in content and a complete continuity note in summary. Neither field may be blank.`,
          },
      body.provider ?? "auto",
      body.preferredProvider,
    );
    const content = String(generated.output.content ?? "").trim();
    const summary = String(generated.output.summary ?? "").trim();
    if (content && summary) {
      return { content, summary, provider: generated.provider };
    }
  }

  throw new Error(`The writer returned an empty response for ${section.title}.`);
}

async function generateJson(
  request: JsonRequest,
  choice: AIProvider,
  preferredProvider?: ActiveAIProvider,
): Promise<JsonGeneration> {
  const providerOrder = getProviderOrder(choice, preferredProvider);
  if (providerOrder.length === 0) {
    throw new ProviderRequestError(
      choice === "anthropic" ? "anthropic" : "openai",
      503,
      "provider_not_configured",
      "The selected AI provider is not configured.",
    );
  }

  const failures: ProviderRequestError[] = [];
  for (const provider of providerOrder) {
    try {
      const output =
        provider === "openai"
          ? await openAIJson(request)
          : await anthropicJson(request);
      return { output, provider };
    } catch (error) {
      if (!(error instanceof ProviderRequestError)) throw error;
      failures.push(error);
      const anotherProviderIsAvailable = failures.length < providerOrder.length;
      if (choice !== "auto" || !anotherProviderIsAvailable || !canFailOver(error)) {
        if (failures.length > 1) throw new MultiProviderRequestError(failures);
        throw error;
      }
    }
  }

  throw new MultiProviderRequestError(failures);
}

function getProviderOrder(
  choice: AIProvider,
  preferredProvider?: ActiveAIProvider,
): ActiveAIProvider[] {
  if (choice === "openai") return process.env.OPENAI_API_KEY ? ["openai"] : [];
  if (choice === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ? ["anthropic"] : [];
  }

  const available: ActiveAIProvider[] = [];
  const add = (provider: ActiveAIProvider) => {
    const configured =
      provider === "openai"
        ? Boolean(process.env.OPENAI_API_KEY)
        : Boolean(process.env.ANTHROPIC_API_KEY);
    if (configured && !available.includes(provider)) available.push(provider);
  };

  if (preferredProvider) add(preferredProvider);
  add("openai");
  add("anthropic");
  return available;
}

async function openAIJson({
  name,
  schema,
  instructions,
  input,
  maxOutputTokens,
}: JsonRequest): Promise<JsonObject> {
  const requestBody = JSON.stringify({
    model: resolveOpenAIModel(),
    reasoning: { effort: "low" },
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema,
      },
    },
  });

  let response: Response | null = null;
  let detail: OpenAIErrorPayload | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    if (response.ok) break;
    detail = (await response.json().catch(() => null)) as OpenAIErrorPayload | null;
    const code = detail?.error?.code ?? detail?.error?.type ?? "unknown";
    const retryable =
      response.status >= 500 ||
      (response.status === 429 && code !== "insufficient_quota");

    if (!retryable || attempt === 2) {
      console.error("OpenAI response error", response.status, code);
      throw new ProviderRequestError(
        "openai",
        response.status,
        String(code),
        detail?.error?.message ?? "OpenAI request failed.",
      );
    }

    await delay(650 * 2 ** attempt);
  }

  if (!response?.ok) {
    throw new ProviderRequestError(
      "openai",
      response?.status ?? 502,
      detail?.error?.code ?? detail?.error?.type ?? "unknown",
      detail?.error?.message ?? "OpenAI request failed.",
    );
  }

  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const outputText =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text;
  if (!outputText) {
    throw new ProviderRequestError(
      "openai",
      502,
      "empty_response",
      "OpenAI returned no text.",
    );
  }
  return parseProviderJson("openai", outputText);
}

async function anthropicJson({
  schema,
  instructions,
  input,
  maxOutputTokens,
}: JsonRequest): Promise<JsonObject> {
  const requestBody = JSON.stringify({
    model: resolveAnthropicModel(),
    max_tokens: maxOutputTokens,
    system: instructions,
    messages: [{ role: "user", content: input }],
    output_config: {
      format: {
        type: "json_schema",
        schema,
      },
    },
  });

  let response: Response | null = null;
  let detail: AnthropicErrorPayload | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": String(process.env.ANTHROPIC_API_KEY),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: requestBody,
    });

    if (response.ok) break;
    detail = (await response.json().catch(() => null)) as AnthropicErrorPayload | null;
    const code = detail?.error?.type ?? detail?.type ?? "unknown";
    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable || attempt === 2) {
      console.error("Anthropic response error", response.status, code);
      throw new ProviderRequestError(
        "anthropic",
        response.status,
        String(code),
        detail?.error?.message ?? "Anthropic request failed.",
      );
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    await delay(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 650 * 2 ** attempt,
    );
  }

  if (!response?.ok) {
    throw new ProviderRequestError(
      "anthropic",
      response?.status ?? 502,
      detail?.error?.type ?? detail?.type ?? "unknown",
      detail?.error?.message ?? "Anthropic request failed.",
    );
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const outputText = data.content?.find((item) => item.type === "text")?.text;
  if (!outputText) {
    throw new ProviderRequestError(
      "anthropic",
      502,
      "empty_response",
      "Anthropic returned no text.",
    );
  }
  return parseProviderJson("anthropic", outputText);
}

function resolveOpenAIModel() {
  const configured = process.env.OPENAI_MODEL?.trim();
  return !configured || configured === "gpt-5.6-terra"
    ? DEFAULT_OPENAI_MODEL
    : configured;
}

function resolveAnthropicModel() {
  const configured = process.env.ANTHROPIC_MODEL?.trim();
  return configured || DEFAULT_ANTHROPIC_MODEL;
}

function parseProviderJson(provider: ActiveAIProvider, outputText: string): JsonObject {
  try {
    return JSON.parse(outputText.replace(/^```json\s*|\s*```$/g, "")) as JsonObject;
  } catch {
    throw new ProviderRequestError(
      provider,
      502,
      "invalid_response",
      "The AI provider returned invalid structured output.",
    );
  }
}

class ProviderRequestError extends Error {
  constructor(
    readonly provider: ActiveAIProvider,
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

class MultiProviderRequestError extends Error {
  constructor(readonly failures: ProviderRequestError[]) {
    super("All configured AI providers failed.");
    this.name = "MultiProviderRequestError";
  }
}

function canFailOver(error: ProviderRequestError) {
  return (
    error.status === 401 ||
    error.status === 402 ||
    error.status === 403 ||
    error.status === 429 ||
    error.status >= 500 ||
    error.code === "insufficient_quota" ||
    error.code === "model_not_found" ||
    error.code === "empty_response" ||
    error.code === "invalid_response"
  );
}

function isRetryable(error: ProviderRequestError) {
  return error.status === 429 || error.status >= 500;
}

function mapProviderError(error: ProviderRequestError) {
  const providerName = error.provider === "openai" ? "OpenAI" : "Anthropic";

  if (error.code === "provider_not_configured") {
    return {
      status: 503,
      code: "provider_not_configured",
      retryable: false,
      message: `${providerName} is not connected to EB Studio Pro yet.`,
    };
  }

  if (
    error.status === 401 ||
    error.code === "invalid_api_key" ||
    error.code === "authentication_error"
  ) {
    return {
      status: 503,
      code: "ai_access",
      retryable: false,
      message: `${providerName} access needs to be reconnected. Your book details are safe.`,
    };
  }

  if (
    error.status === 402 ||
    error.code === "insufficient_quota" ||
    error.code === "billing_error"
  ) {
    return {
      status: 402,
      code: "api_credits",
      retryable: false,
      message: `The ${providerName} API account needs additional credits before this book can be generated.`,
    };
  }

  if (
    error.status === 403 ||
    error.code === "model_not_found" ||
    error.code === "permission_denied" ||
    error.code === "permission_error"
  ) {
    return {
      status: 503,
      code: "model_access",
      retryable: false,
      message: `The selected ${providerName} writing model is not available to this API project.`,
    };
  }

  if (error.status === 429) {
    return {
      status: 429,
      code: "rate_limit",
      retryable: true,
      message: `${providerName} is receiving too many requests. Wait a moment, then select Generate again.`,
    };
  }

  return {
    status: 502,
    code: "writing_service",
    retryable: true,
    message: `The writing service is temporarily unavailable (${providerName}: ${error.code}). Your book details are safe, so please try again.`,
  };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
