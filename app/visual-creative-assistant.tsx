"use client";

import { Check, LoaderCircle, MessageCircle, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { AIProvider } from "./book-types";
import type { ComicPanel, VisualBookBrief, VisualBookPage, VisualBookProject } from "./visual-book-types";

type ChatMessage = { role: "user" | "assistant"; content: string };
type FieldSuggestion = { field: string; value: string };

type AssistantResult = {
  answer: string;
  comments: string;
  verdict: string;
  fieldSuggestions: FieldSuggestion[];
};

export default function VisualCreativeAssistant({
  provider,
  brief,
  project,
  page,
  onApplyBrief,
  onApplyPage,
}: {
  provider: AIProvider;
  brief: VisualBookBrief;
  project: VisualBookProject | null;
  page: VisualBookPage | null;
  onApplyBrief: (patch: Partial<VisualBookBrief>) => void;
  onApplyPage: (patch: Partial<VisualBookPage>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  const quickPrompts = useMemo(() => {
    if (!project) {
      return [
        "Fill every missing setup box for me",
        brief.mode === "comic" ? "Sharpen my comic concept and conflict" : "Sharpen my visual mini-book concept",
        "Build my character and world lock",
        "Choose a stronger audience and visual direction",
      ];
    }
    return brief.mode === "comic"
      ? [
          "Improve this page and its comic beats",
          "Make the dialogue sharper and more natural",
          "Check character consistency",
          "Find what I forgot on this page",
        ]
      : [
          "Improve this page",
          "Strengthen the page copy and art direction",
          "Check visual consistency",
          "Find what I forgot on this page",
        ];
  }, [brief.mode, project]);

  async function ask(event?: FormEvent<HTMLFormElement>, quickPrompt?: string) {
    event?.preventDefault();
    const question = (quickPrompt ?? prompt).trim();
    if (!question || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content: question }].slice(-6);
    setMessages(nextMessages);
    setPrompt("");
    setResult(null);
    setError("");
    setApplied(false);
    setLoading(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assistant",
          mode: "fiction",
          provider,
          brief: assistantBrief(brief),
          assistantPrompt: visualInstruction(question, brief, project, page),
          assistantHistory: nextMessages.slice(0, -1),
          manuscript: null,
          activeSection: 0,
          creationMode: "single",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error ?? "Ask EB could not respond."));

      const next: AssistantResult = {
        answer: String(data.answer ?? "").slice(0, 6000),
        comments: String(data.comments ?? "").slice(0, 3000),
        verdict: String(data.verdict ?? "").slice(0, 1500),
        fieldSuggestions: normalizeSuggestions(data.fieldSuggestions),
      };
      setResult(next);
      setMessages(current => [...current, { role: "assistant", content: next.answer }].slice(-6));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ask EB could not respond.");
    } finally {
      setLoading(false);
    }
  }

  function applySuggestions() {
    if (!result?.fieldSuggestions.length) return;
    const briefPatch: Partial<VisualBookBrief> = {};
    const pagePatch: Partial<VisualBookPage> = {};

    for (const suggestion of result.fieldSuggestions) {
      const key = normalizeField(suggestion.field);
      const value = suggestion.value.trim();
      if (!value) continue;

      if (["title", "booktitle"].includes(key)) briefPatch.title = value;
      else if (["subtitle", "booksubtitle"].includes(key)) briefPatch.subtitle = value;
      else if (["author", "authorname"].includes(key)) briefPatch.author = value;
      else if (["premise", "storyidea", "storyideaandconflict", "corepromise", "concept"].includes(key)) briefPatch.premise = value;
      else if (["audience", "targetreader", "targetaudience", "reader"].includes(key)) briefPatch.audience = value;
      else if (["characterbible", "characterworldlock", "characterandworldlock", "worldlock"].includes(key)) briefPatch.characterBible = value;
      else if (["palette", "paletteandlightinglock", "lightinglock"].includes(key)) briefPatch.palette = value;
      else if (["pageheading", "heading", "pagetitle"].includes(key)) pagePatch.title = value;
      else if (["pagecopy", "body", "pagenote"].includes(key)) pagePatch.body = value;
      else if (["artdirection", "imageprompt", "visualprompt"].includes(key)) pagePatch.imagePrompt = value;
    }

    if (Object.keys(briefPatch).length) onApplyBrief(briefPatch);
    if (Object.keys(pagePatch).length && page) onApplyPage(pagePatch);
    setApplied(true);
  }

  function resetChat() {
    setMessages([]);
    setPrompt("");
    setResult(null);
    setError("");
    setApplied(false);
  }

  return (
    <>
      <button className="assistant-launcher" type="button" onClick={() => setOpen(true)} aria-label="Open Ask EB for Visuals and Comics" aria-expanded={open}>
        <Sparkles size={18} />
        <span>Ask EB</span>
      </button>

      {open ? (
        <aside className="assistant-panel" aria-label="Ask EB Visual Creative Assistant">
          <header className="assistant-header">
            <div>
              <span><Sparkles size={15} /> Ask EB · Visual Director</span>
              <small>{project ? `Working on page ${page?.pageNumber ?? 1} of “${project.title}”` : brief.mode === "comic" ? "Comics & Graphic Story setup" : "Visual Mini eBook setup"}</small>
            </div>
            <div>
              <button type="button" onClick={resetChat} aria-label="Reset conversation"><RotateCcw size={16} /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={18} /></button>
            </div>
          </header>

          <div className="assistant-body">
            {!messages.length && !result ? (
              <div className="assistant-welcome">
                <MessageCircle size={25} />
                <strong>I can fill the boxes for you.</strong>
                <p>Give me the idea. I’ll sharpen the concept, spot missing pieces, and return ready-to-apply fields for this visual project.</p>
              </div>
            ) : null}

            <div className="assistant-quick-actions" aria-label="Suggested prompts">
              {quickPrompts.map(item => <button key={item} type="button" onClick={() => ask(undefined, item)} disabled={loading}>{item}</button>)}
            </div>

            {messages.slice(-4).map((message, index) => (
              <div className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === "user" ? "You" : "EB"}</span>
                <p>{message.content}</p>
              </div>
            ))}

            {loading ? <div className="assistant-thinking" role="status"><LoaderCircle className="spin" size={18} /> Reading the project and filling the gaps…</div> : null}

            {result ? (
              <section className="assistant-draft">
                <span>Ask EB assessment</span>
                {result.comments ? <div><strong>Comments</strong><p>{result.comments}</p></div> : null}
                {result.verdict ? <div><strong>Verdict</strong><p>{result.verdict}</p></div> : null}
                {result.fieldSuggestions.length ? (
                  <div className="assistant-field-list">
                    {result.fieldSuggestions.map(item => <section className="assistant-field-card" key={`${item.field}-${item.value.slice(0, 24)}`}><strong>{item.field}</strong><p>{item.value}</p></section>)}
                  </div>
                ) : null}
                {result.fieldSuggestions.length ? (
                  <footer><button className="assistant-apply" type="button" onClick={applySuggestions}><Check size={15} />{applied ? "Applied" : "Apply suggested fields"}</button></footer>
                ) : null}
              </section>
            ) : null}

            {error ? <p className="assistant-error" role="alert">{error}</p> : null}
          </div>

          <form className="assistant-composer" onSubmit={ask}>
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ask EB to fill, improve, review, or catch what’s missing…" rows={2} disabled={loading} />
            <button type="submit" aria-label="Send message" disabled={!prompt.trim() || loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>
          </form>
        </aside>
      ) : null}
    </>
  );
}

function assistantBrief(brief: VisualBookBrief) {
  return {
    title: brief.title.trim() || "Untitled visual project",
    subtitle: brief.subtitle,
    author: brief.author,
    genre: brief.mode === "comic" ? "Comics & Graphic Story" : "Visual Mini eBook",
    premise: brief.premise,
    audience: brief.audience,
    description: brief.premise,
  };
}

function visualInstruction(question: string, brief: VisualBookBrief, project: VisualBookProject | null, page: VisualBookPage | null) {
  const panelContext = page?.panels?.length ? page.panels.map((panel: ComicPanel, index) => `Panel ${index + 1}: scene=${panel.scene}; camera=${panel.camera}; caption=${panel.caption}; dialogue=${panel.dialogue.map(d => `${d.speaker}: ${d.text}`).join(" | ")}`).join("\n") : "";
  return `${question}\n\nYou are Ask EB inside EBStudio.Pro Visuals & Comics. Be a senior book editor, comic director, visual storyteller, and publishing strategist. Do not merely agree: identify omissions, weak logic, continuity issues, and stronger choices.\n\nReturn fieldSuggestions using these exact field labels whenever they should be filled or improved: Title, Subtitle, Author, Story idea and conflict, Target reader, Character & world lock, Palette and lighting lock, Page heading, Page copy, Art direction. Do not invent unrelated form fields. Prefer suggestions that can be applied directly.\n\nCURRENT VISUAL BRIEF:\n${JSON.stringify(brief)}\n\nCURRENT PROJECT:\n${project ? JSON.stringify({ title: project.title, mode: project.mode, visualStyle: project.visualStyle, pages: project.pages.map(p => ({ pageNumber: p.pageNumber, role: p.role, title: p.title })) }) : "Not created yet"}\n\nCURRENT PAGE:\n${page ? JSON.stringify({ pageNumber: page.pageNumber, role: page.role, title: page.title, body: page.body, imagePrompt: page.imagePrompt }) : "None"}\n${panelContext ? `\nPANELS:\n${panelContext}` : ""}`;
}

function normalizeSuggestions(value: unknown): FieldSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => {
    if (!item || typeof item !== "object") return null;
    const field = String((item as { field?: unknown }).field ?? "").trim();
    const suggestion = String((item as { value?: unknown }).value ?? "").trim();
    return field && suggestion ? { field, value: suggestion } : null;
  }).filter((item): item is FieldSuggestion => Boolean(item)).slice(0, 10);
}

function normalizeField(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
