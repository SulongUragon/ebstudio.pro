import { NextResponse } from "next/server";

type Provider = "openai" | "anthropic";
type Mode = "fiction" | "nonfiction";

type Brief = {
  title: string;
  author: string;
  mode: Mode;
  topic?: string;
  audience?: string;
  pointA?: string;
  pointB?: string;
  tone?: string;
  language?: string;
  chapterCount?: number;
  genre?: string;
  characters?: string;
  premise?: string;
};

type BlueprintChapter = {
  id: string;
  number: number;
  title: string;
  objective: string;
  subsections: string[];
  keyTakeaway: string;
};

type Blueprint = {
  title: string;
  subtitle: string;
  promise: string;
  readerAvatar: string;
  bigIdea: string;
  corePhilosophy: string;
  transformation: string;
  introduction: string;
  chapters: BlueprintChapter[];
  conclusion: string;
  bonusChapters: string[];
  appendixIdeas: string[];
};

type RequestBody =
  | { action: "generate"; brief: Brief; preferredProvider?: Provider }
  | {
      action: "write_section";
      brief: Brief;
      blueprint: Blueprint;
      section: { kind: "introduction" | "chapter" | "conclusion"; title: string; chapter?: BlueprintChapter };
      previousSummaries?: string[];
      preferredProvider?: Provider;
    };

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    if (!body.brief?.title?.trim() || !body.brief?.author?.trim()) {
      return NextResponse.json({ error: "Title and author are required." }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "AI generation is not configured." }, { status: 503 });
    }

    if (body.action === "generate") {
      const result = await generateBlueprint(body.brief, body.preferredProvider);
      return NextResponse.json(result);
    }

    const result = await writeSection(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Blueprint Engine failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blueprint generation failed." },
      { status: 500 },
    );
  }
}

async function generateBlueprint(brief: Brief, preferred?: Provider) {
  const count = Math.min(20, Math.max(3, Number(brief.chapterCount) || 8));
  const context = brief.mode === "fiction"
    ? `Genre: ${brief.genre || "Not specified"}\nCharacters: ${brief.characters || "Not specified"}\nPremise: ${brief.premise || "Not specified"}`
    : `Topic: ${brief.topic || "Not specified"}\nAudience: ${brief.audience || "Not specified"}\nPoint A: ${brief.pointA || "Not specified"}\nPoint B: ${brief.pointB || "Not specified"}`;

  const prompt = `Create a professional ${brief.mode === "fiction" ? "fiction story" : "non-fiction book"} blueprint.

Title: ${brief.title}
Author: ${brief.author}
Language: ${brief.language || "English"}
Tone: ${brief.tone || "Clear, encouraging, professional"}
${context}
Chapter count: exactly ${count}

Return valid JSON only with this shape:
{
  "title": string,
  "subtitle": string,
  "promise": string,
  "readerAvatar": string,
  "bigIdea": string,
  "corePhilosophy": string,
  "transformation": string,
  "introduction": string,
  "chapters": [{"id": string, "number": number, "title": string, "objective": string, "subsections": string[], "keyTakeaway": string}],
  "conclusion": string,
  "bonusChapters": string[],
  "appendixIdeas": string[]
}

Rules:
- Create exactly ${count} chapters.
- Each chapter must have 3 to 5 specific subsections.
- Build a logical progression with no duplicated chapters.
- For non-fiction, move the reader clearly from Point A to Point B.
- For fiction, create escalating conflict, turning points, climax, and resolution.
- Do not use the em dash character.
- Do not mention AI or prompts.`;

  const generated = await generateJson(prompt, preferred);
  const raw = generated.data as Partial<Blueprint>;
  const chapters = Array.isArray(raw.chapters) ? raw.chapters.slice(0, count) : [];
  if (chapters.length !== count) throw new Error("The AI returned an incomplete chapter blueprint. Please try again.");

  const blueprint: Blueprint = {
    title: String(raw.title || brief.title),
    subtitle: String(raw.subtitle || ""),
    promise: String(raw.promise || ""),
    readerAvatar: String(raw.readerAvatar || brief.audience || ""),
    bigIdea: String(raw.bigIdea || ""),
    corePhilosophy: String(raw.corePhilosophy || ""),
    transformation: String(raw.transformation || ""),
    introduction: String(raw.introduction || ""),
    chapters: chapters.map((chapter, index) => ({
      id: String(chapter.id || `chapter-${index + 1}`),
      number: index + 1,
      title: String(chapter.title || `Chapter ${index + 1}`),
      objective: String(chapter.objective || ""),
      subsections: Array.isArray(chapter.subsections) ? chapter.subsections.map(String).slice(0, 5) : [],
      keyTakeaway: String(chapter.keyTakeaway || ""),
    })),
    conclusion: String(raw.conclusion || ""),
    bonusChapters: Array.isArray(raw.bonusChapters) ? raw.bonusChapters.map(String).slice(0, 3) : [],
    appendixIdeas: Array.isArray(raw.appendixIdeas) ? raw.appendixIdeas.map(String).slice(0, 5) : [],
  };

  return { blueprint, provider: generated.provider };
}

async function writeSection(body: Extract<RequestBody, { action: "write_section" }>) {
  const { brief, blueprint, section, previousSummaries = [] } = body;
  const chapterDetails = section.chapter
    ? `Objective: ${section.chapter.objective}\nSubsections:\n${section.chapter.subsections.map((item) => `- ${item}`).join("\n")}\nKey takeaway: ${section.chapter.keyTakeaway}`
    : section.kind === "introduction"
      ? blueprint.introduction
      : blueprint.conclusion;

  const prompt = `Write one publication-ready section of a ${brief.mode === "fiction" ? "fiction" : "non-fiction"} book.

Book title: ${blueprint.title}
Subtitle: ${blueprint.subtitle}
Promise: ${blueprint.promise}
Big idea: ${blueprint.bigIdea}
Transformation: ${blueprint.transformation}
Language: ${brief.language || "English"}
Tone: ${brief.tone || "Clear, encouraging, professional"}

Current section: ${section.title}
Section type: ${section.kind}
${chapterDetails}

Previous continuity summaries:
${previousSummaries.join("\n") || "None"}

Return valid JSON only:
{"content": string, "summary": string}

Rules:
- Write substantial, polished long-form prose.
- Follow the approved blueprint exactly.
- Do not repeat the section title inside content.
- Avoid filler, duplicated introductions, and generic conclusions.
- Do not invent statistics, studies, citations, or personal claims.
- Do not use the em dash character.
- Do not mention AI, prompts, or the blueprint.`;

  const generated = await generateJson(prompt, body.preferredProvider);
  return {
    content: String(generated.data.content || ""),
    summary: String(generated.data.summary || ""),
    provider: generated.provider,
  };
}

async function generateJson(prompt: string, preferred?: Provider): Promise<{ data: Record<string, unknown>; provider: Provider }> {
  const order: Provider[] = preferred === "anthropic" ? ["anthropic", "openai"] : ["openai", "anthropic"];
  const failures: string[] = [];
  for (const provider of order) {
    try {
      if (provider === "openai" && process.env.OPENAI_API_KEY) {
        return { data: await callOpenAI(prompt), provider };
      }
      if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
        return { data: await callAnthropic(prompt), provider };
      }
    } catch (error) {
      failures.push(`${provider}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  throw new Error(`Both AI providers failed. ${failures.join(" | ")}`);
}

async function callOpenAI(prompt: string): Promise<Record<string, unknown>> {
  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5-mini", input: prompt, max_output_tokens: 12000 }),
  });
  const payload = await response.json() as { output_text?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI returned ${response.status}`);
  return parseJson(payload.output_text || "");
}

async function callAnthropic(prompt: string): Promise<Record<string, unknown>> {
  const response = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": String(process.env.ANTHROPIC_API_KEY),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514", max_tokens: 12000, messages: [{ role: "user", content: prompt }] }),
  });
  const payload = await response.json() as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `Anthropic returned ${response.status}`);
  const text = payload.content?.find((item) => item.type === "text")?.text || "";
  return parseJson(text);
}

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI returned invalid JSON.");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}
