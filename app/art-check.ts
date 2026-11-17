/**
 * Looks at a finished page illustration before it is saved and reports
 * problems a reader would notice: writing drawn into the art, broken
 * anatomy, or a scene that is missing its main subject.
 */
export type ArtCheck = {
  /** True when the art looked clean, or when the check could not run. */
  passed: boolean;
  /** True when no check ran (no Anthropic key, or the check request failed). */
  skipped: boolean;
  problems: string[];
};

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

export function artCheckConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function checkVisualArt(
  imageData: string,
  context: { scene: string; characterBible: string },
  fetcher: typeof fetch = fetch,
): Promise<ArtCheck> {
  const skipped: ArtCheck = { passed: true, skipped: true, problems: [] };
  if (!artCheckConfigured()) return skipped;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(imageData);
  if (!match) return skipped;
  try {
    const response = await fetcher(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": String(process.env.ANTHROPIC_API_KEY),
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } },
              { type: "text", text: artCheckInstructions(context) },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return skipped;
    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).map(part => part.text ?? "").join("\n");
    return parseArtCheck(text) ?? skipped;
  } catch {
    return skipped;
  }
}

export function artCheckInstructions(context: { scene: string; characterBible: string }) {
  return `You check one illustration for a premium picture book before the author sees it.
Intended scene: ${clip(context.scene, 500) || "not given"}
Cast description: ${clip(context.characterBible, 500) || "not given"}

Fail the image only for problems a reader would notice:
1. Any visible writing: letters, words, numbers, captions, signatures, or text-like scribbles anywhere, including on books, papers, signs, or screens.
2. Broken anatomy: a head turned in a way a body cannot turn, a body facing one way with the face another, extra or missing limbs, fused or extra fingers, melted or doubled faces.
3. The main subject of the intended scene is missing, or a large part of the image is blank or a flat box.
Style, color, and composition choices are not problems.

Reply with JSON only: {"passed": true or false, "problems": ["short plain description of each problem"]}`;
}

export function parseArtCheck(text: string): ArtCheck | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as { passed?: unknown; problems?: unknown };
    if (typeof parsed.passed !== "boolean") return null;
    const problems = Array.isArray(parsed.problems)
      ? parsed.problems.map(item => String(item).trim()).filter(Boolean).slice(0, 4)
      : [];
    return { passed: parsed.passed && problems.length === 0 ? true : parsed.passed, skipped: false, problems: parsed.passed ? [] : problems };
  } catch {
    return null;
  }
}

/** Puts the checker's findings at the top of the prompt, where the image model will not cut them off. */
export function promptWithCorrections(prompt: string, problems: string[]) {
  if (!problems.length) return prompt;
  const fix = clip(`The last attempt was rejected. Avoid: ${problems.join("; ")}.`, 260);
  const [first, ...rest] = prompt.split("\n");
  return [first, fix, ...rest].join("\n");
}

function clip(value: string, limit: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return text.slice(0, text.lastIndexOf(" ", limit)).replace(/[,;:]$/, "");
}
