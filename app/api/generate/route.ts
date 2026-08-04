import { NextResponse } from "next/server";
import type {
  ActiveAIProvider,
  AIProvider,
  BookBrief,
  Mode,
  SectionPlan,
} from "../../book-types";

type RequestBody = {
  action: "title" | "brief" | "companion" | "outline" | "section" | "assistant" | "ebook_audit" | "optimize_ebook_section";
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
        body.brief.title,
        body.provider ?? "auto",
      );
      return NextResponse.json(result);
    }
    if (body.action === "companion" && body.manuscript) {
      const result = await createCompanionBrief(body);
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
    if (!body.brief.author) {
      return NextResponse.json({ error: "The book brief is incomplete." }, { status: 400 });
    }
    if (body.action === "outline") {
      const result = await createOutline(
        body.mode,
        body.brief,
        body.provider ?? "auto",
        body.preferredProvider,
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
      return NextResponse.json(
        {
          error:
            "Both AI writing services are unavailable. Check the OpenAI and Anthropic credits or access, then try again. Your book details are safe.",
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
  } = body;
  const selected = manuscript?.sections?.[activeSection];
  const modeContext =
    mode === "fiction"
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
        "You are EB Creative Assistant, a senior ebook editor, fiction and non-fiction book developer, article strategist, and repurposing specialist. Preserve this response order: first comments, then verdict, then the direct help. Comments must briefly assess what is strong, weak, missing, or unclear in the user's current idea. Verdict must be one decisive sentence stating whether the concept works and what direction to take. Answer must be a short transition or recommendation that follows the verdict. When the user asks for help creating, strengthening, filling in, or completing a book concept or brief, organize every ready-to-paste suggestion in fieldSuggestions instead of blending fields into one paragraph. For fiction use the exact field names Genre, Main Characters, and Plot Premise. For non-fiction use the exact field names Topic, Target Audience, and Key Points. Include only the fields relevant to the request; include all three when the user asks for broad concept help. Each value must stand alone and be ready to paste into its matching form field. Use Book Title only when the user asks for title help. For section editing, manuscript analysis, and article requests, return an empty fieldSuggestions array. When the user asks for a deliverable, provide publication-ready copy in draft. Never claim guaranteed virality, invent research, imitate a living author, or use the em dash character. Keep every response concise. Use target title only when draft is a replacement title, section only when draft is a full replacement for the selected manuscript section, article for a standalone article, and none otherwise. If target is none, draft may contain other ready-to-use copy or be empty.",
      input: `Current book context:
Mode: ${mode}
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

Response pattern for this ${mode === "fiction" ? "fiction" : "non-fiction"} book:
${
  mode === "fiction"
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
  title: string,
  provider: AIProvider,
) {
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

  const generated = await generateJson(
    {
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
          ? `Create an editable fiction book brief from this title only:

Title: ${title.trim()}

Choose a precise genre or genre blend. Describe 2 to 4 main characters with names, motivations, conflicts, and relevant relationships. Write a focused plot premise with the central conflict, stakes, story engine, and a clear sense of progression. Recommend 8 to 12 main chapters.`
          : `Create an editable non-fiction book brief from this title only:

Title: ${title.trim()}

Define a focused topic, a specific target audience including their needs or level, and a practical list of 6 to 10 key points that form a logical learning journey. Recommend 8 to 12 main chapters. Do not invent unverifiable credentials, statistics, or claims.`,
      maxOutputTokens: 1800,
    },
    provider,
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

async function createOutline(
  mode: Mode,
  brief: BookBrief,
  provider: AIProvider,
  preferredProvider?: ActiveAIProvider,
) {
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
          chapters: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                number: { type: "integer" },
                title: { type: "string" },
                purpose: { type: "string" },
              },
              required: ["number", "title", "purpose"],
            },
          },
          conclusion_title: { type: "string" },
          conclusion_purpose: { type: "string" },
        },
        required: [
          "subtitle",
          "introduction_title",
          "introduction_purpose",
          "chapters",
          "conclusion_title",
          "conclusion_purpose",
        ],
      },
      instructions:
        "You are the senior book architect inside EB Studio Pro. Design commercially strong, coherent full-length ebooks. Use precise titles, avoid generic filler, and never use the em dash character.",
      input: `Create the complete structure for a ${mode === "fiction" ? "fiction" : "non-fiction"} ebook.

Title: ${brief.title}
Author: ${brief.author}
Requested main chapters: exactly ${brief.chapterCount}
${modeContext}

Return exactly ${brief.chapterCount} numbered chapters plus an opening called ${openingName} and a closing called ${closingName}. In every title field, return only the distinctive descriptive title. Do not include ${openingName}, ${closingName}, "Chapter", or chapter numbers because EB Studio Pro adds those labels during formatting. Build a deliberate progression with no duplicate chapter purposes. The subtitle should make the promise or story tension sharper.`,
      maxOutputTokens: 5000,
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

  const plan: SectionPlan[] = [
    {
      kind: "introduction",
      title: String(output.introduction_title),
      purpose: String(output.introduction_purpose),
    },
    ...chapters.map((chapter, index) => {
      const item = chapter as { title?: unknown; purpose?: unknown };
      return {
        kind: "chapter" as const,
        number: index + 1,
        title: String(item.title),
        purpose: String(item.purpose),
      };
    }),
    {
      kind: "conclusion",
      title: String(output.conclusion_title),
      purpose: String(output.conclusion_purpose),
    },
  ];
  return {
    subtitle: String(output.subtitle),
    plan,
    provider: generated.provider,
  };
}

async function createSection(body: RequestBody) {
  const {
    brief,
    mode,
    plan = [],
    section,
    sectionIndex = 0,
    previousSummaries = [],
  } = body;
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
    .map((item, index) => `${index + 1}. ${item.title}: ${item.purpose}`)
    .join("\n");
  const continuity =
    previousSummaries.length > 0
      ? `Continuity from completed sections:
${previousSummaries.map((summary, index) => `${index + 1}. ${summary}`).join("\n")}`
      : "This is the first section.";
  const lengthTarget =
    section.kind === "chapter" ? "1,000 to 1,500 words" : "700 to 1,000 words";

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

The summary must be a compact continuity note of 2 to 4 sentences for the writer of the next section.`,
      maxOutputTokens: 7000,
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
    message:
      "The writing service is temporarily unavailable. Your book details are safe, so please try again.",
  };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
