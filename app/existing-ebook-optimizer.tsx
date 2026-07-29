"use client";

import JSZip from "jszip";
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { ChangeEvent, useState } from "react";
import type {
  ActiveAIProvider,
  AIProvider,
  BookBrief,
  Manuscript,
  Mode,
  SectionContent,
  SectionPlan,
} from "./book-types";

type OptimizationMode = "packaging" | "polish" | "viral" | "relaunch";
type Audit = {
  score: number;
  positioning: string;
  strengths: string[];
  weaknesses: string[];
  title: string;
  subtitle: string;
  audience: string;
  recommendations: string[];
};

type Props = {
  provider: AIProvider;
  onComplete: (book: Manuscript, provider: ActiveAIProvider) => void;
};

const modes: Array<{ id: OptimizationMode; title: string; copy: string }> = [
  { id: "packaging", title: "Packaging Only", copy: "Title, subtitle, positioning, description, and keywords." },
  { id: "polish", title: "Content Polish", copy: "Clarity, pacing, repetition, structure, and stronger prose." },
  { id: "viral", title: "Viral Optimization", copy: "Stronger hooks, emotional payoff, and shareable ideas." },
  { id: "relaunch", title: "Full Relaunch", copy: "Content optimization plus complete commercial packaging." },
];

export default function ExistingEbookOptimizer({ provider, onComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("Sulong");
  const [bookMode, setBookMode] = useState<Mode>("nonfiction");
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>("relaunch");
  const [originalText, setOriginalText] = useState("");
  const [sections, setSections] = useState<Array<{ title: string; content: string }>>([]);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [stage, setStage] = useState<"idle" | "reading" | "auditing" | "optimizing" | "complete">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setStage("reading");
    setError("");
    setAudit(null);
    try {
      const text = await extractEbookText(selected);
      if (text.trim().length < 300) throw new Error("The file does not contain enough readable manuscript text.");
      const parsed = splitIntoSections(text);
      setFile(selected);
      setOriginalText(text);
      setSections(parsed);
      setTitle(inferTitle(text, selected.name));
      setStage("idle");
    } catch (cause) {
      setFile(null);
      setOriginalText("");
      setSections([]);
      setStage("idle");
      setError(cause instanceof Error ? cause.message : "This ebook could not be read.");
    }
  }

  async function analyze() {
    if (!file || !title.trim() || !author.trim()) {
      setError("Upload an ebook and confirm its title and author.");
      return;
    }
    setError("");
    setAudit(null);
    setStage("auditing");
    setProgress(5);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ebook_audit",
          mode: bookMode,
          provider,
          brief: makeBrief(title, author, bookMode, sections.length),
          existingBook: {
            optimizationMode,
            text: originalText.slice(0, 90000),
            sectionMap: sections.map((item, index) => `${index + 1}. ${item.title}`).join("\n"),
          },
        }),
      });
      const data = await readResponse(response);
      setAudit(data.audit as Audit);
      setProgress(100);
      setStage("idle");
    } catch (cause) {
      setStage("idle");
      setError(cause instanceof Error ? cause.message : "The ebook audit could not be completed.");
    }
  }

  async function optimize() {
    if (!audit) return;
    setError("");
    setStage("optimizing");
    setProgress(0);
    try {
      const optimized: SectionContent[] = [];
      const plan: SectionPlan[] = sections.map((section, index) => ({
        kind: sectionKind(section.title, index, sections.length),
        number: sectionKind(section.title, index, sections.length) === "chapter" ? index + 1 : undefined,
        title: section.title,
        purpose: audit.recommendations.join(" "),
      }));

      for (let index = 0; index < sections.length; index += 1) {
        const source = sections[index];
        let content = source.content;
        let summary = source.content.slice(0, 280);
        if (optimizationMode !== "packaging") {
          const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "optimize_ebook_section",
              mode: bookMode,
              provider,
              brief: makeBrief(audit.title || title, author, bookMode, sections.length),
              existingBook: {
                optimizationMode,
                audit,
                sectionTitle: source.title,
                sectionText: source.content.slice(0, 45000),
                sectionIndex: index,
                sectionCount: sections.length,
              },
            }),
          });
          const data = await readResponse(response);
          content = String(data.content || source.content);
          summary = String(data.summary || content.slice(0, 280));
        }
        optimized.push({ ...plan[index], content, summary });
        setProgress(Math.round(((index + 1) / sections.length) * 100));
      }

      const activeProvider = "openai" as ActiveAIProvider;
      const brief = makeBrief(audit.title || title, author, bookMode, sections.length);
      const book: Manuscript = {
        id: crypto.randomUUID(),
        mode: bookMode,
        title: audit.title || title,
        subtitle: audit.subtitle || "",
        author,
        createdAt: new Date().toISOString(),
        brief,
        plan,
        sections: optimized,
        providersUsed: [activeProvider],
        optimization: {
          sourceFileName: file?.name || "uploaded ebook",
          mode: optimizationMode,
          originalTitle: title,
          originalText,
          audit,
        },
      };
      setStage("complete");
      onComplete(book, activeProvider);
    } catch (cause) {
      setStage("idle");
      setError(cause instanceof Error ? cause.message : "The optimized ebook could not be completed.");
    }
  }

  const busy = stage === "reading" || stage === "auditing" || stage === "optimizing";

  return (
    <div className="optimizer">
      <div className="optimizer-hero">
        <span><Sparkles size={16} /> Existing ebook optimizer</span>
        <h2>Strengthen a book you already wrote</h2>
        <p>Upload the manuscript, review the commercial audit, approve the direction, then create a separate optimized edition.</p>
      </div>

      <label className={file ? "ebook-dropzone has-file" : "ebook-dropzone"}>
        <input type="file" accept=".docx,.epub,.txt,.md" onChange={chooseFile} disabled={busy} />
        {stage === "reading" ? <LoaderCircle className="spin" size={28} /> : file ? <CheckCircle2 size={28} /> : <Upload size={28} />}
        <strong>{file ? file.name : "Upload DOCX, EPUB, TXT, or Markdown"}</strong>
        <small>{file ? `${sections.length} readable sections detected` : "Your original file is never overwritten."}</small>
      </label>

      {file ? (
        <>
          <div className="optimizer-fields">
            <label><span>Book title</span><input value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></label>
            <label><span>Author</span><input value={author} onChange={(event) => setAuthor(event.target.value)} disabled={busy} /></label>
          </div>
          <div className="optimizer-type">
            <button className={bookMode === "fiction" ? "selected" : ""} onClick={() => setBookMode("fiction")} disabled={busy}>Fiction</button>
            <button className={bookMode === "nonfiction" ? "selected" : ""} onClick={() => setBookMode("nonfiction")} disabled={busy}>Non-Fiction</button>
          </div>
          <div className="optimization-modes">
            {modes.map((item) => (
              <button key={item.id} className={optimizationMode === item.id ? "selected" : ""} onClick={() => setOptimizationMode(item.id)} disabled={busy}>
                <strong>{item.title}</strong><small>{item.copy}</small>
              </button>
            ))}
          </div>
          <div className="original-safe"><ShieldCheck size={17} /><span>Original preserved. Changes are written into a new edition only.</span></div>
          <button className="optimizer-primary" onClick={analyze} disabled={busy}>
            {stage === "auditing" ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={19} />}
            {stage === "auditing" ? "Auditing ebook..." : "Analyze Ebook"}
          </button>
        </>
      ) : null}

      {error ? <p className="form-error optimizer-error">{error}</p> : null}

      {audit ? (
        <section className="audit-panel">
          <div className="audit-score"><strong>{audit.score}</strong><span>Market-readiness score</span></div>
          <div className="audit-copy">
            <span>Recommended positioning</span>
            <h3>{audit.title}</h3>
            <p>{audit.subtitle}</p>
            <p>{audit.positioning}</p>
          </div>
          <div className="audit-columns">
            <div><strong>What already works</strong><ul>{audit.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><strong>Priority improvements</strong><ul>{audit.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
          {stage === "optimizing" ? (
            <div className="optimizer-progress"><span style={{ width: `${progress}%` }} /><small>{progress}% complete</small></div>
          ) : (
            <button className="optimizer-primary" onClick={optimize}>
              <Sparkles size={19} /> Approve and Create Optimized Edition
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}

function makeBrief(title: string, author: string, mode: Mode, count: number): BookBrief {
  return {
    title: title.trim(), author: author.trim(),
    genre: mode === "fiction" ? "Imported fiction manuscript" : "",
    characters: mode === "fiction" ? "Preserve the characters in the uploaded manuscript." : "",
    premise: mode === "fiction" ? "Preserve the plot and intent of the uploaded manuscript." : "",
    topic: mode === "nonfiction" ? title.trim() : "",
    audience: mode === "nonfiction" ? "Readers identified by the manuscript audit." : "",
    keyPoints: mode === "nonfiction" ? "Preserve and strengthen the uploaded manuscript's core ideas." : "",
    chapterCount: Math.max(1, count),
  };
}

async function extractEbookText(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "txt" || extension === "md") return file.text();
  if (extension === "docx") {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file("word/document.xml")?.async("text");
    if (!xml) throw new Error("The DOCX manuscript could not be read.");
    return xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  }
  if (extension === "epub") {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const names = Object.keys(zip.files).filter((name) => /\.(xhtml|html|htm)$/i.test(name) && !/nav|toc/i.test(name));
    const pages = await Promise.all(names.map(async (name) => {
      const html = await zip.file(name)?.async("text");
      return (html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    }));
    return pages.join("\n\n");
  }
  throw new Error("PDF import is coming next. For now, use DOCX, EPUB, TXT, or Markdown.");
}

function splitIntoSections(text: string) {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const heading = /^(introduction|prologue|chapter\s+(?:\d+|[ivxlcdm]+)(?:\s*[:.-]\s*|\s+).*|conclusion|epilogue)$/gim;
  const matches = Array.from(clean.matchAll(heading));
  if (!matches.length) {
    const chunks = clean.match(/[\s\S]{1,18000}(?:\n\n|$)/g) || [clean];
    return chunks.map((content, index) => ({ title: index === 0 ? "Manuscript" : `Section ${index + 1}`, content: content.trim() }));
  }
  const result: Array<{ title: string; content: string }> = [];
  if ((matches[0].index || 0) > 200) result.push({ title: "Opening", content: clean.slice(0, matches[0].index).trim() });
  matches.forEach((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index || clean.length : clean.length;
    result.push({ title: match[0].trim(), content: clean.slice(start, end).trim() });
  });
  return result.filter((item) => item.content.length > 40);
}

function inferTitle(text: string, name: string) {
  const first = text.split("\n").map((line) => line.trim()).find((line) => line.length >= 3 && line.length <= 120);
  return first || name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

function sectionKind(title: string, index: number, total: number): "introduction" | "chapter" | "conclusion" {
  if (/introduction|prologue|opening/i.test(title) || index === 0) return "introduction";
  if (/conclusion|epilogue/i.test(title) || index === total - 1) return "conclusion";
  return "chapter";
}

async function readResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error || "The writing service could not complete this request."));
  return data;
}
