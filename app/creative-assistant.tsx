"use client";

import {
  Check,
  Copy,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";
import type {
  AIProvider,
  BookBrief,
  Manuscript,
  Mode,
  SectionContent,
} from "./book-types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  comments?: string;
  verdict?: string;
  fieldSuggestions?: AssistantFieldSuggestion[];
};

type AssistantFieldSuggestion = {
  field: string;
  value: string;
};

type AssistantResult = {
  comments: string;
  verdict: string;
  answer: string;
  draft: string;
  fieldSuggestions: AssistantFieldSuggestion[];
  target: "none" | "title" | "section" | "article";
  provider?: string;
};

export type DualAssistantContext = {
  title: string;
  concept: string;
  audience: string;
  fictionSubtitle: string;
  nonfictionSubtitle: string;
  fictionTitle: string;
  nonfictionTitle: string;
};

export default function CreativeAssistant({
  mode,
  brief,
  manuscript,
  activeSection,
  provider,
  onApplyTitle,
  onApplySection,
  creationMode = "single",
  dualContext = null,
}: {
  mode: Mode;
  brief: BookBrief;
  manuscript: Manuscript | null;
  activeSection: number;
  provider: AIProvider;
  onApplyTitle: (title: string) => void;
  onApplySection: (content: string) => void;
  creationMode?: "single" | "dual";
  dualContext?: DualAssistantContext | null;
}) {
  const isDual = creationMode === "dual";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedSection: SectionContent | null =
    manuscript?.sections[activeSection] ?? null;

  const quickPrompts = isDual
    ? [
        "Complete my dual book brief",
        "Sharpen the shared concept",
        "Write both subtitles",
        "Suggest cover concepts for both",
        "Check if both books align",
      ]
    : selectedSection
      ? [
          "Improve the current section",
          "Check this book for repetition",
          "Turn this section into an article",
          "Suggest a cover concept",
          "Suggest stronger ideas",
        ]
      : mode === "fiction"
        ? [
            "Complete my fiction brief",
            "Suggest my genre",
            "Build my main characters",
            "Strengthen my plot premise",
            "Check my romance structure",
            "Suggest a cover concept",
          ]
        : [
            "Complete my non-fiction brief",
            "Clarify my topic",
            "Define my target audience",
            "Build my key points",
            "Suggest a cover concept",
          ];

  async function askAssistant(
    event?: FormEvent<HTMLFormElement>,
    quickPrompt?: string,
  ) {
    event?.preventDefault();
    const question = (quickPrompt ?? prompt).trim();
    if (!question || loading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user" as const, content: question },
    ].slice(-6);
    setMessages(nextMessages);
    setPrompt("");
    setResult(null);
    setError("");
    setCopied(false);
    setLoading(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assistant",
          mode,
          brief,
          provider,
          assistantPrompt: question,
          assistantHistory: nextMessages.slice(0, -1).map((message) => ({
            role: message.role,
            content: messageForHistory(message),
          })),
          manuscript: manuscript
            ? {
                title: manuscript.title,
                subtitle: manuscript.subtitle,
                sections: manuscript.sections.slice(0, 40).map((section, index) => ({
                  title: section.title,
                  summary: section.summary?.slice(0, 600),
                  content:
                    index === activeSection
                      ? section.content.slice(0, 14000)
                      : undefined,
                })),
              }
            : null,
          activeSection,
          creationMode,
          dualContext,
        }),
      });
      const data = await readAssistantResponse(response);
      const nextResult: AssistantResult = {
        comments: String(data.comments ?? "").slice(0, 3000),
        verdict: String(data.verdict ?? "").slice(0, 1500),
        answer: String(data.answer ?? "").slice(0, 6000),
        draft: String(data.draft ?? "").slice(0, 30000),
        fieldSuggestions: normalizeFieldSuggestions(data.fieldSuggestions),
        target: normalizeTarget(data.target),
        provider: data.provider ? String(data.provider) : undefined,
      };
      setResult(nextResult);
      setMessages((current) =>
        [
          ...current,
          {
            role: "assistant" as const,
            content: nextResult.answer,
            comments: nextResult.comments,
            verdict: nextResult.verdict,
            fieldSuggestions: nextResult.fieldSuggestions,
          },
        ].slice(-6),
      );
    } catch (assistantError) {
      setError(
        assistantError instanceof Error
          ? assistantError.message
          : "EB Creative Assistant could not respond.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetChat() {
    setMessages([]);
    setPrompt("");
    setResult(null);
    setError("");
    setCopied(false);
  }

  async function copyDraft() {
    if (!result?.draft) return;
    await navigator.clipboard.writeText(result.draft);
    setCopied(true);
  }

  function applyDraft() {
    if (!result?.draft) return;
    if (result.target === "title") onApplyTitle(result.draft);
    if (result.target === "section") onApplySection(result.draft);
    setResult((current) =>
      current
        ? {
            ...current,
            answer: `${current.answer}\n\nApplied to your book. You can continue editing it.`,
            target: "none",
          }
        : current,
    );
  }

  return (
    <>
      <button
        className="assistant-launcher"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open EB Creative Assistant"
        aria-expanded={open}
      >
        <Sparkles size={18} />
        <span>Ask EB</span>
      </button>

      {open ? (
        <aside className="assistant-panel" aria-label="EB Creative Assistant">
          <header className="assistant-header">
            <div>
              <span><Sparkles size={15} /> EB Creative Assistant</span>
              <small>
                {isDual
                  ? dualContext?.title
                    ? `Dual project: “${dualContext.title}”`
                    : "Dual book project (fiction + non-fiction)"
                  : selectedSection
                    ? `Working with “${selectedSection.title}”`
                    : brief.title
                      ? `Working with “${brief.title}”`
                      : "Ebook and article specialist"}
              </small>
            </div>
            <div>
              <button type="button" onClick={resetChat} aria-label="Reset conversation">
                <RotateCcw size={16} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="assistant-body">
            {!messages.length && !result ? (
              <div className="assistant-welcome">
                <MessageCircle size={25} />
                <strong>What are you creating?</strong>
                <p>
                  I organize book ideas by the exact fields you need to complete,
                  then help with sections and articles.
                </p>
              </div>
            ) : null}

            <div className="assistant-quick-actions" aria-label="Suggested prompts">
              {quickPrompts.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => askAssistant(undefined, item)}
                  disabled={loading}
                >
                  {item}
                </button>
              ))}
            </div>

            {messages.slice(-4).map((message, index) => (
              <div
                className={`assistant-message ${message.role}`}
                key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
              >
                <span>{message.role === "user" ? "You" : "EB"}</span>
                {message.role === "assistant" &&
                (message.comments || message.verdict) ? (
                  <div className="assistant-assessment">
                    {message.comments ? (
                      <section>
                        <strong>Comments</strong>
                        <p>{message.comments}</p>
                      </section>
                    ) : null}
                    {message.verdict ? (
                      <section className="assistant-verdict">
                        <strong>Verdict</strong>
                        <p>{message.verdict}</p>
                      </section>
                    ) : null}
                  </div>
                ) : null}
                <p>{message.content}</p>
                {message.fieldSuggestions?.length ? (
                  <div className="assistant-field-list">
                    {message.fieldSuggestions.map((suggestion) => (
                      <section
                        className="assistant-field-card"
                        key={`${suggestion.field}-${suggestion.value.slice(0, 24)}`}
                      >
                        <strong>{suggestion.field}</strong>
                        <p>{suggestion.value}</p>
                      </section>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {loading ? (
              <div className="assistant-thinking" role="status">
                <LoaderCircle className="spin" size={18} />
                Shaping the strongest response…
              </div>
            ) : null}

            {result?.draft ? (
              <section className="assistant-draft">
                <span>
                  {result.target === "article"
                    ? "Article draft"
                    : result.target === "section"
                      ? "Section revision"
                      : result.target === "title"
                        ? "Title suggestion"
                        : "Ready-to-use draft"}
                </span>
                <div>{result.draft}</div>
                <footer>
                  <button type="button" onClick={copyDraft}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  {result.target === "title" || result.target === "section" ? (
                    <button className="assistant-apply" type="button" onClick={applyDraft}>
                      <Check size={15} />
                      Apply to book
                    </button>
                  ) : null}
                </footer>
              </section>
            ) : null}

            {error ? <p className="assistant-error" role="alert">{error}</p> : null}
          </div>

          <form className="assistant-composer" onSubmit={askAssistant}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask about your ebook, chapter, or article…"
              rows={2}
              disabled={loading}
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!prompt.trim() || loading}
            >
              {loading ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
            </button>
          </form>
        </aside>
      ) : null}
    </>
  );
}

function normalizeTarget(value: unknown): AssistantResult["target"] {
  return value === "title" || value === "section" || value === "article"
    ? value
    : "none";
}

function normalizeFieldSuggestions(value: unknown): AssistantFieldSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const field = String((item as { field?: unknown }).field ?? "").trim();
      const suggestion = String(
        (item as { value?: unknown }).value ?? "",
      ).trim();
      return field && suggestion ? { field, value: suggestion } : null;
    })
    .filter((item): item is AssistantFieldSuggestion => Boolean(item))
    .slice(0, 6);
}

function messageForHistory(message: ChatMessage) {
  const fields = message.fieldSuggestions
    ?.map((suggestion) => `${suggestion.field}: ${suggestion.value}`)
    .join("\n");
  return [
    message.comments ? `Comments: ${message.comments}` : "",
    message.verdict ? `Verdict: ${message.verdict}` : "",
    message.content,
    fields,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function readAssistantResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      String(data.error ?? "The creative assistant is temporarily unavailable."),
    );
  }
  return data;
}
