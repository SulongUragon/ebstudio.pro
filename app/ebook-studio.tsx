"use client";

import {
  BookMarked,
  BookOpen,
  Check,
  CircleStop,
  Download,
  FileText,
  LibraryBig,
  LoaderCircle,
  PenLine,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import type {
  ActiveAIProvider,
  AIProvider,
  BookBrief,
  Manuscript,
  Mode,
  SectionContent,
  SectionPlan,
} from "./book-types";
import {
  exportBundle,
  exportCover,
  exportDocx,
  exportEpub,
  exportPdf,
  getCoverReadiness,
  getKdpReadiness,
} from "./exporters";
import CreativeAssistant from "./creative-assistant";
import CoverStudio from "./cover-studio";
import ExistingEbookOptimizer from "./existing-ebook-optimizer";
import {
  loadStoredLibrary,
  persistStoredLibrary,
} from "./library-storage";

type View = "create" | "library";
type GenerationStatus =
  | "idle"
  | "outlining"
  | "writing"
  | "complete"
  | "cancelled"
  | "error";

const chapterPresets = [3, 5, 8, 10, 12, 15, 20];
const blankBrief: BookBrief = {
  title: "",
  author: "Sulong",
  genre: "",
  characters: "",
  premise: "",
  topic: "",
  audience: "",
  keyPoints: "",
  chapterCount: 8,
};

export default function EbookStudio() {
  const [view, setView] = useState<View>("create");
  const [creatorMode, setCreatorMode] = useState<"new" | "optimize">("new");
  const [mode, setMode] = useState<Mode>("fiction");
  const [provider, setProvider] = useState<AIProvider>("auto");
  const [activeProvider, setActiveProvider] = useState<ActiveAIProvider | null>(null);
  const [brief, setBrief] = useState<BookBrief>(blankBrief);
  const [customChapters, setCustomChapters] = useState("");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [activeSection, setActiveSection] = useState(0);
  const [library, setLibrary] = useState<Manuscript[]>([]);
  const [error, setError] = useState("");
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillMessage, setAutoFillMessage] = useState("");
  const [isImprovingTitle, setIsImprovingTitle] = useState(false);
  const [titleImproveError, setTitleImproveError] = useState("");
  const [titlePromptDismissed, setTitlePromptDismissed] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [exporting, setExporting] = useState("");
  const [repairingSection, setRepairingSection] = useState<number | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadStoredLibrary()
        .then((savedLibrary) => {
          if (!cancelled) setLibrary(savedLibrary);
        })
        .catch(() => {
          if (!cancelled) {
            setError("Your saved books could not be loaded from this browser.");
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const isGenerating = status === "outlining" || status === "writing";
  const fieldsLocked = isGenerating || isAutoFilling || isImprovingTitle;
  const completedSectionCount =
    manuscript?.sections.filter((section) => section.content?.trim()).length ?? 0;
  const progress =
    manuscript?.plan.length && status !== "outlining"
      ? Math.round((completedSectionCount / manuscript.plan.length) * 100)
      : status === "outlining"
        ? 4
        : 0;

  function updateBrief(field: keyof BookBrief, value: string | number) {
    setBrief((current) => ({ ...current, [field]: value }));
  }

  function updateTitle(value: string) {
    updateBrief("title", value);
    setTitlePromptDismissed(false);
    setTitleSuggestions([]);
    setTitleImproveError("");
    setAutoFillMessage("");
  }

  function chooseMode(nextMode: Mode) {
    if (fieldsLocked) return;
    setMode(nextMode);
    setStatus("idle");
    setManuscript(null);
    setError("");
    setAutoFillMessage("");
    setTitlePromptDismissed(false);
    setTitleSuggestions([]);
    setTitleImproveError("");
    setActiveProvider(null);
  }

  function chooseChapterCount(value: number) {
    updateBrief("chapterCount", value);
    setCustomChapters("");
  }

  function validateBrief() {
    const commonMissing = !brief.title.trim() || !brief.author.trim();
    const modeMissing =
      mode === "fiction"
        ? !brief.genre.trim() || !brief.characters.trim() || !brief.premise.trim()
        : !brief.topic.trim() || !brief.audience.trim() || !brief.keyPoints.trim();
    return commonMissing || modeMissing;
  }

  async function autoFillBrief() {
    if (!brief.title.trim()) {
      setError("Enter a book title first, then let AI fill the details.");
      return;
    }

    setIsAutoFilling(true);
    setError("");
    setAutoFillMessage("");
    setActiveProvider(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "brief", mode, brief, provider }),
      });
      const data = await readResponse(response);
      const chapterCount = Math.min(
        20,
        Math.max(3, Number(data.chapter_count) || brief.chapterCount),
      );

      setBrief((current) =>
        mode === "fiction"
          ? {
              ...current,
              genre: String(data.genre ?? ""),
              characters: String(data.characters ?? ""),
              premise: String(data.premise ?? ""),
              chapterCount,
            }
          : {
              ...current,
              topic: String(data.topic ?? ""),
              audience: String(data.audience ?? ""),
              keyPoints: String(data.key_points ?? ""),
              chapterCount,
            },
      );
      setCustomChapters("");
      setActiveProvider(data.provider as ActiveAIProvider);
      setAutoFillMessage(
        "AI suggestions added. Review and edit any field before generating your book.",
      );
    } catch (autoFillError) {
      setError(
        autoFillError instanceof Error
          ? autoFillError.message
          : "EB Studio Pro could not create suggestions for this title.",
      );
    } finally {
      setIsAutoFilling(false);
    }
  }

  async function improveTitle() {
    if (!brief.title.trim()) return;

    setIsImprovingTitle(true);
    setError("");
    setTitleImproveError("");
    setTitleSuggestions([]);
    setActiveProvider(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "title", mode, brief, provider }),
      });
      const data = await readResponse(response);
      const suggestions = Array.isArray(data.suggestions)
        ? data.suggestions.map((item: unknown) => String(item)).slice(0, 3)
        : [];

      if (!suggestions.length) {
        throw new Error("AI could not create title options. Please try again.");
      }

      setTitleSuggestions(suggestions);
      setActiveProvider(data.provider as ActiveAIProvider);
    } catch (titleError) {
      setTitleImproveError(
        titleError instanceof Error
          ? titleError.message
          : "EB Studio Pro could not improve this title.",
      );
    } finally {
      setIsImprovingTitle(false);
    }
  }

  function selectTitle(title: string) {
    setBrief((current) => ({ ...current, title }));
    setTitleSuggestions([]);
    setTitleImproveError("");
    setTitlePromptDismissed(true);
    setAutoFillMessage("New title selected. You can still edit it before generating.");
  }

  function applyAssistantTitle(title: string) {
    const cleaned = title.trim().replace(/^["“]|["”]$/g, "");
    if (!cleaned) return;
    setBrief((current) => ({ ...current, title: cleaned }));
    setManuscript((current) =>
      current
        ? {
            ...current,
            title: cleaned,
            brief: { ...current.brief, title: cleaned },
          }
        : current,
    );
  }

  function completeOptimization(book: Manuscript, usedProvider: ActiveAIProvider) {
    setManuscript(book);
    setBrief(book.brief);
    setMode(book.mode);
    setActiveProvider(usedProvider);
    setStatus("complete");
    setActiveSection(0);
    saveBook(book);
  }

  function saveCover(cover: NonNullable<Manuscript["cover"]>) {
    if (!manuscript) return;
    const updated: Manuscript = { ...manuscript, cover };
    setManuscript(updated);
    saveBook(updated);
  }

  function applyAssistantSection(content: string) {
    if (!manuscript?.sections[activeSection] || !content.trim()) return;
    const updated: Manuscript = {
      ...manuscript,
      sections: manuscript.sections.map((section, index) =>
        index === activeSection ? { ...section, content: content.trim() } : section,
      ),
    };
    setManuscript(updated);
    saveBook(updated);
  }

  async function generateBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAutoFilling) return;
    if (validateBrief()) {
      setError("Complete every book detail before generating.");
      return;
    }

    cancelRef.current = false;
    setError("");
    setStatus("outlining");
    setManuscript(null);
    setActiveSection(0);
    setActiveProvider(null);

    try {
      const outlineResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "outline", mode, brief, provider }),
      });
      const outlineData = await readResponse(outlineResponse);
      const plan = outlineData.plan as SectionPlan[];
      let workingProvider = outlineData.provider as ActiveAIProvider;
      setActiveProvider(workingProvider);

      let working: Manuscript = {
        id: crypto.randomUUID(),
        mode,
        title: brief.title.trim(),
        subtitle: String(outlineData.subtitle ?? ""),
        author: brief.author.trim(),
        createdAt: new Date().toISOString(),
        brief,
        plan,
        sections: [],
        providersUsed: [workingProvider],
      };
      setManuscript(working);
      setStatus("writing");

      const summaries: string[] = [];
      for (let index = 0; index < plan.length; index += 1) {
        if (cancelRef.current) {
          setStatus("cancelled");
          return;
        }

        setActiveSection(index);
        const sectionResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "section",
            mode,
            brief,
            plan,
            section: plan[index],
            sectionIndex: index,
            previousSummaries: summaries.slice(-10),
            provider,
            preferredProvider: provider === "auto" ? workingProvider : undefined,
          }),
        });
        const sectionData = await readResponse(sectionResponse);
        workingProvider = sectionData.provider as ActiveAIProvider;
        setActiveProvider(workingProvider);
        const finishedContent = String(sectionData.content ?? "").trim();
        const finishedSummary = String(sectionData.summary ?? "").trim();
        if (!finishedContent || !finishedSummary) {
          throw new Error(
            `The writer did not finish \"${plan[index].title}\". This section was not counted or saved. Generate the book again to retry it.`,
          );
        }
        const completeSection: SectionContent = {
          ...plan[index],
          content: finishedContent,
          summary: finishedSummary,
        };

        summaries.push(completeSection.summary);
        working = {
          ...working,
          sections: [...working.sections, completeSection],
          providersUsed: Array.from(
            new Set([...(working.providersUsed ?? []), workingProvider]),
          ),
        };
        setManuscript(working);
      }

      setStatus("complete");
      setActiveSection(0);
      saveBook(working);
    } catch (generationError) {
      setStatus("error");
      setError(
        generationError instanceof Error
          ? generationError.message
          : "EB Studio Pro could not finish this manuscript.",
      );
    }
  }

  function cancelGeneration() {
    cancelRef.current = true;
  }

  function saveBook(book: Manuscript) {
    setLibrary((current) => {
      const next = [book, ...current.filter((item) => item.id !== book.id)].slice(0, 8);
      void persistStoredLibrary(next).catch(() => {
        setError(
          "The book is open, but this browser could not permanently save its latest cover.",
        );
      });
      return next;
    });
  }

  function openBook(book: Manuscript) {
    setManuscript(book);
    setBrief(book.brief);
    setMode(book.mode);
    setActiveProvider(book.providersUsed?.at(-1) ?? null);
    setStatus("complete");
    setActiveSection(0);
    setView("create");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeBook(id: string) {
    const next = library.filter((book) => book.id !== id);
    setLibrary(next);
    void persistStoredLibrary(next).catch(() => {
      setError("This browser could not finish removing the saved book.");
    });
  }

  function startFresh() {
    cancelRef.current = true;
    setBrief(blankBrief);
    setCustomChapters("");
    setManuscript(null);
    setStatus("idle");
    setError("");
    setAutoFillMessage("");
    setIsAutoFilling(false);
    setIsImprovingTitle(false);
    setTitlePromptDismissed(false);
    setTitleSuggestions([]);
    setActiveSection(0);
    setActiveProvider(null);
  }

  async function runExport(format: "bundle" | "cover" | "docx" | "pdf" | "epub") {
    if (!manuscript || manuscript.sections.length === 0) return;
    setExporting(format);
    setError("");
    try {
      if (format === "bundle") await exportBundle(manuscript);
      if (format === "docx") await exportDocx(manuscript);
      if (format === "pdf") await exportPdf(manuscript);
      if (format === "epub") await exportEpub(manuscript);
      if (format === "cover") await exportCover(manuscript);
    } catch (exportError) {
      const detail =
        exportError instanceof Error && exportError.message
          ? ` ${exportError.message.slice(0, 180)}`
          : "";
      console.error(`EB Studio Pro ${format.toUpperCase()} export failed`, exportError);
      setError(
        `The ${format.toUpperCase()} export could not be created.${detail} Your book is still safe.`,
      );
    } finally {
      setExporting("");
    }
  }

  async function repairSection(index: number) {
    if (!manuscript || repairingSection !== null || !manuscript.plan[index]) return;

    const section = manuscript.plan[index];
    setRepairingSection(index);
    setActiveSection(index);
    setError("");

    try {
      const previousSummaries = manuscript.sections
        .slice(0, index)
        .map((item) => item.summary?.trim())
        .filter((summary): summary is string => Boolean(summary));
      const preferredProvider =
        provider === "auto"
          ? manuscript.providersUsed?.at(-1) ?? activeProvider ?? undefined
          : undefined;
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "section",
          mode: manuscript.mode,
          brief: manuscript.brief,
          plan: manuscript.plan,
          section,
          sectionIndex: index,
          previousSummaries: previousSummaries.slice(-10),
          provider,
          preferredProvider,
        }),
      });
      const sectionData = await readResponse(response);
      const content = String(sectionData.content ?? "").trim();
      const summary = String(sectionData.summary ?? "").trim();
      if (!content || !summary) {
        throw new Error(`The writer could not finish \"${section.title}\". Try this chapter again.`);
      }

      const usedProvider = sectionData.provider as ActiveAIProvider;
      const sections = [...manuscript.sections];
      sections[index] = { ...section, content, summary };
      const updated: Manuscript = {
        ...manuscript,
        sections,
        providersUsed: Array.from(
          new Set([...(manuscript.providersUsed ?? []), usedProvider]),
        ),
      };
      setManuscript(updated);
      setActiveProvider(usedProvider);
      setStatus("complete");
      saveBook(updated);
    } catch (repairError) {
      setError(
        repairError instanceof Error
          ? repairError.message
          : `EB Studio Pro could not repair \"${section.title}\".`,
      );
    } finally {
      setRepairingSection(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("create")} aria-label="Go to creator">
          <span className="brand-lockup" aria-hidden="true">
            <span className="brand-mark">
              <i className="brand-book brand-book-green" />
              <i className="brand-book brand-book-copper" />
              <span className="brand-monogram">
                <b className="brand-e">E</b>
                <b className="brand-b">B</b>
                <i className="brand-leaf" />
              </span>
            </span>
            <span className="brand-word-group">
              <span className="brand-wordmark">
                <b className="brand-e">E</b>
                <b className="brand-b">B</b>
                <span>Studio</span>
                <em>.Pro</em>
              </span>
              <span className="brand-signature-rule" />
              <small>
                <b>CREATE</b><i>•</i><b>DESIGN</b><i>•</i><b>PUBLISH</b>
              </small>
            </span>
          </span>
          <img
            className="brand-logo brand-logo-mobile"
            src="/brand/ebstudio-pro-app-icon-192.png"
            alt="EB Studio Pro"
            width="192"
            height="192"
          />
        </button>

        <nav className="topnav" aria-label="Primary navigation">
          <button
            className={view === "create" ? "nav-button active" : "nav-button"}
            onClick={() => setView("create")}
          >
            <PenLine size={18} />
            Create
          </button>
          <button
            className={view === "library" ? "nav-button active" : "nav-button"}
            onClick={() => setView("library")}
          >
            <LibraryBig size={18} />
            Library
            {library.length ? <span className="library-count">{library.length}</span> : null}
          </button>
        </nav>
      </header>

      {view === "create" ? (
        <section className="studio-grid">
          <div className="form-column">
            <div className="creator-workspace-tabs" role="tablist" aria-label="Creator workspace">
              <button role="tab" aria-selected={creatorMode === "new"} className={creatorMode === "new" ? "selected" : ""} onClick={() => setCreatorMode("new")}>
                <Plus size={17} /> Create New Book
              </button>
              <button role="tab" aria-selected={creatorMode === "optimize"} className={creatorMode === "optimize" ? "selected" : ""} onClick={() => setCreatorMode("optimize")}>
                <Sparkles size={17} /> Optimize Existing Ebook
              </button>
            </div>
            {creatorMode === "optimize" ? (
              <ExistingEbookOptimizer provider={provider} onComplete={completeOptimization} />
            ) : (
              <>
            <div className="form-heading-row">
              <div>
                <div className="eyebrow">
                  <PenLine size={18} />
                  New book
                </div>
                <h1>Describe your book</h1>
              </div>
              {manuscript ? (
                <button className="fresh-button" onClick={startFresh}>
                  <RotateCcw size={15} />
                  New
                </button>
              ) : null}
            </div>
            <p className="intro-copy">
              Set the direction. EB Studio Pro will shape the structure and write every
              chapter.
            </p>

            <div className="mode-switch" role="tablist" aria-label="Book type">
              <button
                role="tab"
                aria-selected={mode === "fiction"}
                className={mode === "fiction" ? "selected" : ""}
                onClick={() => chooseMode("fiction")}
                disabled={fieldsLocked}
              >
                Fiction
              </button>
              <button
                role="tab"
                aria-selected={mode === "nonfiction"}
                className={mode === "nonfiction" ? "selected" : ""}
                onClick={() => chooseMode("nonfiction")}
                disabled={fieldsLocked}
              >
                Non-Fiction
              </button>
            </div>

            <div className="provider-setting">
              <div className="provider-setting-heading">
                <span>AI writer</span>
                <small>
                  {provider === "auto"
                    ? "Automatic backup enabled"
                    : provider === "openai"
                      ? "OpenAI only"
                      : "Anthropic Claude only"}
                </small>
              </div>
              <div className="provider-switch" role="radiogroup" aria-label="AI writer">
                {(["auto", "openai", "anthropic"] as AIProvider[]).map((option) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={provider === option}
                    className={provider === option ? "selected" : ""}
                    key={option}
                    disabled={fieldsLocked}
                    onClick={() => {
                      setProvider(option);
                      setActiveProvider(null);
                      setError("");
                      setAutoFillMessage("");
                    }}
                  >
                    {option === "auto"
                      ? "Auto"
                      : option === "openai"
                        ? "OpenAI"
                        : "Claude"}
                  </button>
                ))}
              </div>
              <p>
                Auto starts with OpenAI, switches to Claude when needed, and continues
                from the current section.
              </p>
            </div>

            <form onSubmit={generateBook}>
              <Field
                label="Book title"
                value={brief.title}
                onChange={updateTitle}
                placeholder="e.g. The Lanternkeeper’s Daughter"
                disabled={fieldsLocked}
              />
              {brief.title.trim() && !titlePromptDismissed ? (
                <div className="title-optimizer">
                  <div className="title-optimizer-copy">
                    <span>Want a stronger title?</span>
                    <p>
                      AI can sharpen it for stronger click and search appeal without
                      changing your book’s core idea.
                    </p>
                  </div>
                  <div className="title-optimizer-actions">
                    <button
                      type="button"
                      className="title-improve-button"
                      onClick={improveTitle}
                      disabled={fieldsLocked}
                    >
                      {isImprovingTitle ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      {isImprovingTitle ? "Creating options…" : "Get 3 title options"}
                    </button>
                    <button
                      type="button"
                      className="title-keep-button"
                      onClick={() => {
                        setTitlePromptDismissed(true);
                        setTitleSuggestions([]);
                      }}
                      disabled={fieldsLocked}
                    >
                      Keep my title
                    </button>
                  </div>
                  {titleSuggestions.length ? (
                    <div
                      className="title-suggestions"
                      aria-label="AI title suggestions"
                      aria-live="polite"
                    >
                      <span>Choose one to replace your current title</span>
                      {titleSuggestions.map((title) => (
                        <button
                          type="button"
                          key={title}
                          onClick={() => selectTitle(title)}
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {titleImproveError ? (
                    <p className="title-improve-error" role="alert">
                      {titleImproveError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="ai-brief-helper">
                <div className="ai-brief-helper-copy">
                  <span>Only have a title?</span>
                  <p>
                    Let AI draft the rest of your {mode === "fiction" ? "Fiction" : "Non-Fiction"} brief.
                    Every suggestion stays editable.
                  </p>
                </div>
                <button
                  className="ai-brief-button"
                  type="button"
                  onClick={autoFillBrief}
                  disabled={!brief.title.trim() || fieldsLocked}
                >
                  {isAutoFilling ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}
                  {isAutoFilling
                    ? "Creating suggestions"
                    : `Fill ${mode === "fiction" ? "Fiction" : "Non-Fiction"} details`}
                </button>
              </div>
              {autoFillMessage ? (
                <p className="ai-brief-note" role="status">
                  <Check size={15} />
                  {autoFillMessage}
                </p>
              ) : null}
              <Field
                label="Author name"
                value={brief.author}
                onChange={(value) => updateBrief("author", value)}
                placeholder="Your name"
                disabled={fieldsLocked}
              />

              {mode === "fiction" ? (
                <>
                  <Field
                    label="Genre"
                    value={brief.genre}
                    onChange={(value) => updateBrief("genre", value)}
                    placeholder="e.g. Literary fantasy, mystery, romance"
                    disabled={fieldsLocked}
                  />
                  <Field
                    textarea
                    label="Main characters"
                    value={brief.characters}
                    onChange={(value) => updateBrief("characters", value)}
                    placeholder="Name and describe your key characters"
                    disabled={fieldsLocked}
                  />
                  <Field
                    textarea
                    label="Plot premise"
                    value={brief.premise}
                    onChange={(value) => updateBrief("premise", value)}
                    placeholder="What is the story about? What is the central conflict?"
                    disabled={fieldsLocked}
                  />
                </>
              ) : (
                <>
                  <Field
                    label="Topic"
                    value={brief.topic}
                    onChange={(value) => updateBrief("topic", value)}
                    placeholder="e.g. Productivity for creatives"
                    disabled={fieldsLocked}
                  />
                  <Field
                    label="Target audience"
                    value={brief.audience}
                    onChange={(value) => updateBrief("audience", value)}
                    placeholder="Who is this book for?"
                    disabled={fieldsLocked}
                  />
                  <Field
                    textarea
                    label="Key points to cover"
                    value={brief.keyPoints}
                    onChange={(value) => updateBrief("keyPoints", value)}
                    placeholder="List the main ideas, arguments, or lessons to include"
                    disabled={fieldsLocked}
                  />
                </>
              )}

              <fieldset className="chapter-fieldset" disabled={fieldsLocked}>
                <legend>Number of chapters</legend>
                <div className="chapter-options">
                  {chapterPresets.map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={brief.chapterCount === value && !customChapters ? "selected" : ""}
                      onClick={() => chooseChapterCount(value)}
                    >
                      {value}
                    </button>
                  ))}
                  <label className={customChapters ? "custom-count selected" : "custom-count"}>
                    <Plus size={16} />
                    <input
                      aria-label="Custom chapter count"
                      type="number"
                      min={1}
                      max={40}
                      value={customChapters}
                      placeholder="Custom"
                      onChange={(event) => {
                        const raw = event.target.value;
                        setCustomChapters(raw);
                        updateBrief(
                          "chapterCount",
                          Math.min(40, Math.max(1, Number(raw) || 1)),
                        );
                      }}
                    />
                  </label>
                </div>
                <p>Choose up to 40 chapters for longer projects.</p>
              </fieldset>

              {error ? <p className="form-error">{error}</p> : null}

              {isGenerating ? (
                <button className="cancel-button" type="button" onClick={cancelGeneration}>
                  <CircleStop size={19} />
                  Stop generation
                </button>
              ) : (
                <button className="generate-button" type="submit" disabled={isAutoFilling}>
                  <Sparkles size={20} />
                  {status === "complete" ? "Generate another version" : "Generate book"}
                </button>
              )}
            </form>
              </>
            )}
          </div>

          <BookPreview
            manuscript={manuscript}
            status={status}
            progress={progress}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            exporting={exporting}
            onExport={runExport}
            activeProvider={activeProvider}
            onSaveCover={saveCover}
            repairingSection={repairingSection}
            onRepairSection={repairSection}
          />
        </section>
      ) : (
        <LibraryView
          books={library}
          onOpen={openBook}
          onRemove={removeBook}
          onCreate={() => setView("create")}
        />
      )}
      <CreativeAssistant
        mode={mode}
        brief={brief}
        manuscript={manuscript}
        activeSection={activeSection}
        provider={provider}
        onApplyTitle={applyAssistantTitle}
        onApplySection={applyAssistantSection}
      />
    </main>
  );
}

function BookPreview({
  manuscript,
  status,
  progress,
  activeSection,
  setActiveSection,
  exporting,
  onExport,
  activeProvider,
  onSaveCover,
  repairingSection,
  onRepairSection,
}: {
  manuscript: Manuscript | null;
  status: GenerationStatus;
  progress: number;
  activeSection: number;
  setActiveSection: (index: number) => void;
  exporting: string;
  onExport: (format: "bundle" | "cover" | "docx" | "pdf" | "epub") => void;
  activeProvider: ActiveAIProvider | null;
  onSaveCover: (cover: NonNullable<Manuscript["cover"]>) => void;
  repairingSection: number | null;
  onRepairSection: (index: number) => void;
}) {
  if (!manuscript && status !== "outlining") {
    return (
      <aside className="preview-panel" aria-live="polite">
        <div className="empty-state">
          <div className="book-illustration" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h2>Your book will appear here</h2>
          <p>
            Fill in the details on the left and select Generate. You’ll watch each chapter
            come to life in real time.
          </p>
        </div>
      </aside>
    );
  }

  if (status === "outlining" || !manuscript) {
    return (
      <aside className="preview-panel" aria-live="polite">
        <div className="generation-empty">
          <LoaderCircle className="spin" size={34} />
          <p className="preview-kicker">Designing the structure</p>
          <h2>Building your book’s spine</h2>
          <p>
            EB Studio Pro is mapping the opening, chapter arc, and final conclusion.
            {activeProvider ? ` ${providerLabel(activeProvider)} is active.` : ""}
          </p>
        </div>
      </aside>
    );
  }

  const isComplete = status === "complete";
  const selected =
    manuscript.sections[activeSection] ??
    (!isComplete ? manuscript.sections[manuscript.sections.length - 1] : null) ??
    null;
  const selectedPlan = manuscript.plan[activeSection] ?? null;
  const completedCount = manuscript.plan.filter(
    (_, index) => Boolean(manuscript.sections[index]?.content?.trim()),
  ).length;
  const incompleteSectionIndex = manuscript.plan.findIndex(
    (_, index) => !manuscript.sections[index]?.content?.trim(),
  );
  const kdpReadiness = getKdpReadiness(manuscript);
  const coverReadiness = getCoverReadiness(manuscript);

  return (
    <aside className="preview-panel manuscript-panel" aria-live="polite">
      <div className="manuscript-toolbar">
        <div>
          <span className="preview-kicker">
            {isComplete && incompleteSectionIndex < 0
              ? "Manuscript complete"
              : isComplete
                ? "Manuscript needs repair"
                : "Writing in progress"}
          </span>
          <strong>{completedCount} of {manuscript.plan.length} sections</strong>
          <div className="provider-badges" aria-label="AI writers used">
            {(manuscript.providersUsed ?? (activeProvider ? [activeProvider] : [])).map(
              (usedProvider) => (
                <span key={usedProvider}>{providerLabel(usedProvider)}</span>
              ),
            )}
          </div>
        </div>
        {isComplete ? (
          <div className="export-actions" aria-label="Export formats">
            <button
              className="bundle-export"
              onClick={() => onExport("bundle")}
              disabled={Boolean(exporting) || !kdpReadiness.ready}
            >
              <Download size={16} />
              {exporting === "bundle" ? "Packaging all formats" : "KDP Package"}
            </button>
            <button onClick={() => onExport("docx")} disabled={Boolean(exporting)}>
              <FileText size={16} />
              {exporting === "docx" ? "Preparing" : "DOCX"}
            </button>
            <button onClick={() => onExport("pdf")} disabled={Boolean(exporting)}>
              <FileText size={16} />
              {exporting === "pdf" ? "Preparing" : "PDF"}
            </button>
            <button
              onClick={() => onExport("epub")}
              disabled={Boolean(exporting) || !kdpReadiness.ready}
            >
              <Download size={16} />
              {exporting === "epub" ? "Preparing" : "EPUB"}
            </button>
            <button
              onClick={() => onExport("cover")}
              disabled={Boolean(exporting) || !coverReadiness.ready}
            >
              <Download size={16} />
              {exporting === "cover" ? "Preparing" : "Cover JPG"}
            </button>
          </div>
        ) : null}
      </div>

      {isComplete ? (
        <div className={`kdp-readiness ${kdpReadiness.ready ? "ready" : "blocked"}`} role="status">
          <strong>{kdpReadiness.ready ? "KDP package ready" : "KDP preflight"}</strong>
          <span>
            {kdpReadiness.ready
              ? "DOCX, EPUB, and the separate 1600 × 2560 cover can now be exported."
              : kdpReadiness.errors[0]}
          </span>
          {incompleteSectionIndex >= 0 ? (
            <button
              className="chapter-repair-button"
              onClick={() => onRepairSection(incompleteSectionIndex)}
              disabled={repairingSection !== null}
            >
              {repairingSection === incompleteSectionIndex ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <RotateCcw size={14} />
              )}
              {repairingSection === incompleteSectionIndex
                ? "Repairing chapter"
                : "Retry incomplete chapter"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="progress-track" aria-label={`${progress}% complete`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      {isComplete ? (
        <CoverStudio
          key={manuscript.id}
          manuscript={manuscript}
          onSave={onSaveCover}
        />
      ) : null}

      <div className="manuscript-workspace">
        <nav className="contents-rail" aria-label="Book contents">
          <div className="mini-cover">
            <BookMarked size={22} />
            <span>{manuscript.title}</span>
            <small>{manuscript.author}</small>
          </div>
          <p>Contents</p>
          {manuscript.plan.map((section, index) => {
            const finished = Boolean(manuscript.sections[index]?.content?.trim());
            const repairable = isComplete && !finished;
            const current = !isComplete && index === manuscript.sections.length;
            return (
              <button
                key={`${section.kind}-${index}`}
                disabled={!finished && !repairable}
                className={`${activeSection === index ? "active" : ""}${repairable ? " incomplete" : ""}`}
                onClick={() => setActiveSection(index)}
              >
                <span>
                  {finished ? <Check size={13} /> : repairable ? <RotateCcw size={13} /> : current ? <LoaderCircle className="spin" size={13} /> : index + 1}
                </span>
                <em>{section.title}</em>
              </button>
            );
          })}
        </nav>

        <article className="book-page">
          {selected?.content?.trim() ? (
            <>
              <div className="section-meta">{sectionLabel(selected)}</div>
              {shouldShowSectionTitle(selected) ? <h2>{selected.title}</h2> : null}
              <MarkdownContent
                content={selected.content}
                sectionTitle={selected.title}
                sectionLabel={sectionLabel(selected)}
              />
            </>
          ) : isComplete && selectedPlan ? (
            <div className="section-repair-state">
              <RotateCcw size={30} />
              <div className="section-meta">Incomplete chapter</div>
              <h2>{selectedPlan.title}</h2>
              <p>Only this section will be written again. The rest of your book stays unchanged.</p>
              <button
                className="chapter-repair-button"
                onClick={() => onRepairSection(activeSection)}
                disabled={repairingSection !== null}
              >
                {repairingSection === activeSection ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <RotateCcw size={15} />
                )}
                {repairingSection === activeSection ? "Repairing chapter" : "Retry this chapter"}
              </button>
            </div>
          ) : (
            <div className="section-loading">
              <LoaderCircle className="spin" size={28} />
              <h2>Writing {manuscript.plan[0]?.title}</h2>
              <p>The first section will appear here as soon as it is ready.</p>
            </div>
          )}
        </article>
      </div>
    </aside>
  );
}

function MarkdownContent({
  content,
  sectionTitle,
  sectionLabel: label,
}: {
  content: string;
  sectionTitle: string;
  sectionLabel: string;
}) {
  const blocks = removeLeadingDuplicateHeading(content, sectionTitle, label)
    .split(/\n{2,}/)
    .filter(Boolean);
  return (
    <div className="manuscript-copy">
      {blocks.map((block, index) => {
        const cleaned = block.trim();
        if (cleaned.startsWith("### ")) return <h4 key={index}>{cleaned.slice(4)}</h4>;
        if (cleaned.startsWith("## ")) return <h3 key={index}>{cleaned.slice(3)}</h3>;
        if (cleaned.split("\n").every((line) => /^[-*]\s/.test(line))) {
          return (
            <ul key={index}>
              {cleaned.split("\n").map((line, itemIndex) => (
                <li key={itemIndex}>{stripInlineMarkdown(line.replace(/^[-*]\s/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{stripInlineMarkdown(cleaned)}</p>;
      })}
    </div>
  );
}

function sectionLabel(section: SectionContent) {
  return section.kind === "chapter"
    ? `Chapter ${section.number}`
    : section.kind === "introduction"
      ? "Introduction"
      : "Conclusion";
}

function shouldShowSectionTitle(section: SectionContent) {
  return normalizeHeading(section.title) !== normalizeHeading(sectionLabel(section));
}

function removeLeadingDuplicateHeading(content: string, title: string, label: string) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length) {
    const first = lines[0].trim();
    const heading = first.replace(/^#{1,6}\s*/, "").replace(/^[*_]+|[*_]+$/g, "").trim();
    const normalized = normalizeHeading(heading);
    if (
      normalized === normalizeHeading(title) ||
      normalized === normalizeHeading(label)
    ) {
      lines.shift();
      while (lines.length && !lines[0].trim()) lines.shift();
      continue;
    }
    break;
  }
  return lines.join("\n");
}

function normalizeHeading(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function LibraryView({
  books,
  onOpen,
  onRemove,
  onCreate,
}: {
  books: Manuscript[];
  onOpen: (book: Manuscript) => void;
  onRemove: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <section className="library-view">
      <div>
        <span className="eyebrow"><LibraryBig size={18} /> Your library</span>
        <h1>Every manuscript, in one place.</h1>
        <p>Completed books are saved privately on this device for quick preview and export.</p>
      </div>

      {books.length ? (
        <div className="book-grid">
          {books.map((book) => (
            <article className="book-card" key={book.id}>
              <button
                className={`book-card-cover${book.cover ? " has-generated-cover" : ""}`}
                style={book.cover ? { backgroundImage: `linear-gradient(rgba(10,14,12,.24), rgba(10,14,12,.72)), url(${book.cover.imageData})` } : undefined}
                onClick={() => onOpen(book)}
              >
                <span>{book.mode === "fiction" ? "Fiction" : "Non-Fiction"}</span>
                <h2>{book.title}</h2>
                {book.subtitle ? <p>{book.subtitle}</p> : null}
                <small>{book.author}</small>
              </button>
              <div className="book-card-footer">
                <span>{book.brief.chapterCount} chapters</span>
                <button
                  aria-label={`Delete ${book.title}`}
                  onClick={() => onRemove(book.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <BookOpen size={36} />
          <h2>Your shelf is waiting</h2>
          <p>Generate your first book to start your private library.</p>
          <button onClick={onCreate}>Create a book</button>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  textarea?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          disabled={disabled}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    </label>
  );
}

async function readResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      String(
        data.error ??
          "The writing service could not be reached. Your book details are safe, so please try again.",
      ),
    );
  }
  return data;
}

function stripInlineMarkdown(text: string): ReactNode {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`(.*?)`/g, "$1");
}

function providerLabel(provider: ActiveAIProvider) {
  return provider === "openai" ? "OpenAI" : "Claude";
}
