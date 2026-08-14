"use client";

import { NotesMarkdown } from "./notes-markdown";
import {
  BookMarked,
  BookOpen,
  Check,
  CircleStop,
  Download,
  FileText,
  LibraryBig,
  LoaderCircle,
  NotebookPen,
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
  BookLength,
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
  isSectionFinished,
  manuscriptWordCount,
  MIN_SECTION_CHARACTERS,
  sectionWordCount,
  shortSectionIndexes,
  tenseOutlierIndexes,
} from "./exporters";
import CreativeAssistant from "./creative-assistant";
import CoverStudio from "./cover-studio";
import ExistingEbookOptimizer from "./existing-ebook-optimizer";
import VisualBookStudio from "./visual-book-studio";
import {
  loadStoredLibrary,
  persistStoredLibrary,
} from "./library-storage";
import {
  deleteCloudProject,
  saveCloudProject,
  syncCloudProjects,
  type SyncState,
} from "./cloud-library-client";

type View = "create" | "library" | "notes";
const bookLengths: Array<{ id: BookLength; label: string; note: string }> = [
  { id: "novella", label: "Novella", note: "About 15,000 to 20,000 words. Fast to produce." },
  { id: "standard", label: "Standard Novel", note: "About 55,000 to 70,000 words. What most readers expect." },
  { id: "long", label: "Long Novel", note: "About 80,000 to 100,000 words. Longest to generate." },
];
const NOTES_KEY = "eb-studio-pro-notes-v1";
type GenerationStatus =
  | "idle"
  | "outlining"
  | "writing"
  | "complete"
  | "cancelled"
  | "error";
type CompanionSource = NonNullable<Manuscript["companionOf"]>;
type CreationMode = "single" | "dual";
type DualBookInput = {
  fictionSubtitle: string;
  nonfictionSubtitle: string;
  concept: string;
  audience: string;
};
type DualBookProject = {
  id: string;
  title: string;
  fiction: Manuscript;
  nonfiction: Manuscript;
};
type DualSectionResult = {
  section: SectionContent;
  provider: ActiveAIProvider;
};
type DualResumeState = {
  pairId: string;
  fiction: Manuscript;
  nonfiction: Manuscript;
  fictionSummaries: string[];
  nonfictionSummaries: string[];
  fictionProvider: ActiveAIProvider;
  nonfictionProvider: ActiveAIProvider;
  nextIndex: number;
  sectionCount: number;
};

/**
 * A single book run used to die on the first provider hiccup and take every
 * finished chapter with it. The snapshot below is written after each section so
 * a failed run can be continued from the exact chapter that stopped.
 */
type SingleResumeState = {
  book: Manuscript;
  summaries: string[];
  provider: ActiveAIProvider;
  nextIndex: number;
  sectionCount: number;
};

const chapterPresets = [3, 5, 8, 10, 12, 15, 20];

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withRetry<T>(
  task: () => Promise<T>,
  shouldStop: () => boolean,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (shouldStop()) throw new Error("Generation cancelled.");
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await sleep(1200 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("The writing service did not respond.");
}
const blankBrief: BookBrief = {
  title: "",
  subtitle: "",
  author: "Sulong",
  genre: "",
  characters: "",
  premise: "",
  topic: "",
  audience: "",
  keyPoints: "",
  chapterCount: 8,
};

/**
 * Older manuscripts predate the stored bookLength, and the form on the left
 * always resets to its default, so a rewrite on a reopened book used to target
 * novella chapters inside a standard novel. The written chapters themselves are
 * the most reliable record of what the book actually is.
 */
/**
 * The brief generator and the section writer both start from nothing and keep
 * reaching for the same names, jobs, and settings, so book three quietly reused
 * a character and an antagonist surname from books one and two. This pulls the
 * proper nouns out of every finished book so the prompts can rule them out.
 */
function collectUsedNames(books: Manuscript[]): string[] {
  const ignore = new Set([
    "The","A","An","And","But","Or","So","If","When","While","After","Before",
    "He","She","They","It","His","Her","Their","I","We","You","Chapter","Prologue",
    "Epilogue","Her","Their","One","Two","Three","Their","This","That","There",
    "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
    "January","February","March","April","May","June","July","August","September",
    "October","November","December","Wound","Want","Governing","Supporting",
  ]);
  const found = new Map<string, number>();
  for (const book of books) {
    const source = [
      book.brief.characters ?? "",
      book.brief.premise ?? "",
      book.title ?? "",
    ].join(" ");
    for (const match of source.matchAll(/\b[A-Z][a-z]{2,}\b/g)) {
      const word = match[0];
      if (ignore.has(word)) continue;
      found.set(word, (found.get(word) ?? 0) + 1);
    }
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 60);
}

function inferBookLength(book: Manuscript): BookLength {
  if (book.bookLength) return book.bookLength;
  const chapterWords = book.sections
    .filter((section) => section.kind === "chapter")
    .map((section) => section.content.trim().split(/\s+/).length)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  if (!chapterWords.length) return "novella";
  const median = chapterWords[Math.floor(chapterWords.length / 2)];
  if (median >= 3000) return "long";
  if (median >= 1800) return "standard";
  return "novella";
}

export default function EbookStudio() {
  const [view, setView] = useState<View>("create");
  const [creatorMode, setCreatorMode] = useState<"new" | "visual" | "optimize">("new");
  const [creationMode, setCreationMode] = useState<CreationMode>("single");
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
  const [companionSource, setCompanionSource] = useState<CompanionSource | null>(null);
  const [isCreatingCompanion, setIsCreatingCompanion] = useState(false);
  const [dualInput, setDualInput] = useState<DualBookInput>({
    fictionSubtitle: "",
    nonfictionSubtitle: "",
    concept: "",
    audience: "",
  });
  const [dualProject, setDualProject] = useState<DualBookProject | null>(null);
  const [dualResume, setDualResume] = useState<DualResumeState | null>(null);
  const [singleResume, setSingleResume] = useState<SingleResumeState | null>(null);
  const [bookLength, setBookLength] = useState<BookLength>("novella");
  const [notes, setNotes] = useState("");
  const [notesPreview, setNotesPreview] = useState(false);
  const [librarySyncState, setLibrarySyncState] = useState<SyncState>("syncing");
  const cancelRef = useRef(false);

  useEffect(() => {
    setDualResume(null);
    setSingleResume(null);
  }, [creationMode]);

  useEffect(() => {
    const saved = window.localStorage.getItem(NOTES_KEY);
    if (saved) setNotes(saved);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(NOTES_KEY, notes);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [notes]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadStoredLibrary()
        .then(async (savedLibrary) => {
          const synced = await syncCloudProjects("manuscript", savedLibrary);
          if (!cancelled) {
            setLibrary(synced.projects);
            setLibrarySyncState(synced.state);
            await persistStoredLibrary(synced.projects);
          }
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
  const fieldsLocked =
    isGenerating || isAutoFilling || isImprovingTitle || isCreatingCompanion;
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
    setCreationMode("single");
    setDualProject(null);
    setStatus("idle");
    setManuscript(null);
    setError("");
    setAutoFillMessage("");
    setTitlePromptDismissed(false);
    setTitleSuggestions([]);
    setTitleImproveError("");
    setActiveProvider(null);
    setCompanionSource(null);
  }

  function chooseDualMode() {
    if (fieldsLocked) return;
    setCreationMode("dual");
    setMode("fiction");
    setStatus("idle");
    setManuscript(null);
    setDualProject(null);
    setError("");
    setAutoFillMessage("");
    setTitlePromptDismissed(false);
    setTitleSuggestions([]);
    setTitleImproveError("");
    setActiveProvider(null);
    setCompanionSource(null);
  }

  function chooseChapterCount(value: number) {
    updateBrief("chapterCount", value);
    setCustomChapters("");
  }

  function validateBrief() {
    if (creationMode === "dual") {
      return (
        !brief.title.trim() ||
        !brief.author.trim() ||
        !dualInput.concept.trim() ||
        !dualInput.audience.trim()
      );
    }
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
        body: JSON.stringify({
          action: "brief",
          mode,
          brief,
          provider,
          avoidNames: collectUsedNames(library),
        }),
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

  async function autoFillDualDetails() {
    if (!brief.title.trim()) {
      setError("Enter a book title first, then let AI fill the pair details.");
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
        body: JSON.stringify({
          action: "dual_seed",
          mode: "fiction",
          brief,
          provider,
        }),
      });
      const data = await readResponse(response);
      const chapterCount = Math.min(
        20,
        Math.max(3, Number(data.chapter_count) || brief.chapterCount || 8),
      );

      setDualInput({
        concept: String(data.concept ?? ""),
        audience: String(data.audience ?? ""),
        fictionSubtitle: String(data.fiction_subtitle ?? ""),
        nonfictionSubtitle: String(data.nonfiction_subtitle ?? ""),
      });
      setBrief((current) => ({ ...current, chapterCount }));
      setCustomChapters("");
      setActiveProvider(data.provider as ActiveAIProvider);
      setAutoFillMessage(
        "Fiction and Non-Fiction pair details added. Review them before generating both books.",
      );
    } catch (autoFillError) {
      setError(
        autoFillError instanceof Error
          ? autoFillError.message
          : "EB Studio Pro could not create pair details for this title.",
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
    setBrief(normalizeBriefSubtitle(book));
    setMode(book.mode);
    setActiveProvider(usedProvider);
    setStatus("complete");
    setActiveSection(0);
    setCompanionSource(null);
    setCreationMode("single");
    setDualProject(null);
    saveBook(book);
  }

  function saveCover(cover: NonNullable<Manuscript["cover"]>) {
    if (!manuscript) return;
    const exactSubtitle = cover.displaySubtitle?.trim() ?? manuscript.subtitle;
    const updated: Manuscript = {
      ...manuscript,
      subtitle: exactSubtitle,
      brief: { ...manuscript.brief, subtitle: exactSubtitle },
      cover: { ...cover, displaySubtitle: exactSubtitle },
    };
    setManuscript(updated);
    saveBook(updated);
  }

  /**
   * The cover, the title page, and the EPUB metadata all read manuscript.author,
   * which is frozen at generation time. Editing the brief afterwards changes
   * nothing, so the name has to be editable on the finished book.
   */
  function saveAuthorName(author: string) {
    const nextAuthor = author.trim();
    if (!manuscript || !nextAuthor || nextAuthor === manuscript.author) return;
    const updated: Manuscript = {
      ...manuscript,
      author: nextAuthor,
      brief: { ...manuscript.brief, author: nextAuthor },
    };
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
    if (creationMode === "dual") {
      await generateDualBooks();
      return;
    }
    if (validateBrief()) {
      setError("Complete every book detail before generating.");
      return;
    }

    cancelRef.current = false;
    setError("");
    setStatus("outlining");
    setManuscript(null);
    setSingleResume(null);
    setActiveSection(0);
    setActiveProvider(null);

    try {
      const outlineResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "outline",
          mode,
          brief,
          provider,
          avoidNames: collectUsedNames(library),
        }),
      });
      const outlineData = await readResponse(outlineResponse);
      const plan = outlineData.plan as SectionPlan[];
      const finalSubtitle = String(outlineData.subtitle ?? "").trim();
      const finalBrief: BookBrief = { ...brief, subtitle: finalSubtitle };
      const workingProvider = outlineData.provider as ActiveAIProvider;
      setActiveProvider(workingProvider);

      const working: Manuscript = {
        id: crypto.randomUUID(),
        mode,
        title: brief.title.trim(),
        subtitle: finalSubtitle,
        author: brief.author.trim(),
        createdAt: new Date().toISOString(),
        bookLength,
        brief: finalBrief,
        plan,
        sections: [],
        providersUsed: [workingProvider],
        companionOf: companionSource ?? undefined,
      };
      setManuscript(working);
      setStatus("writing");

      await runSingleWritingLoop({
        book: working,
        summaries: [],
        provider: workingProvider,
        nextIndex: 0,
        sectionCount: plan.length,
      });
    } catch (generationError) {
      setStatus("error");
      setError(
        generationError instanceof Error
          ? generationError.message
          : "EB Studio Pro could not finish this manuscript.",
      );
    }
  }

  async function writeSingleSection(
    book: Manuscript,
    index: number,
    summaries: string[],
    preferredProvider: ActiveAIProvider,
  ): Promise<{ section: SectionContent; provider: ActiveAIProvider }> {
    return withRetry(
      async () => {
        const sectionResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "section",
            bookLength,
            avoidNames: collectUsedNames(library),
            mode: book.mode,
            brief: book.brief,
            plan: book.plan,
            section: book.plan[index],
            sectionIndex: index,
            previousSummaries: summaries.slice(-10),
            provider,
            preferredProvider: provider === "auto" ? preferredProvider : undefined,
          }),
        });
        const data = await readResponse(sectionResponse);
        const content = String(data.content ?? "").trim();
        const summary = String(data.summary ?? "").trim();
        if (!content || !summary) {
          throw new Error(`The writer did not finish "${book.plan[index].title}".`);
        }
        return {
          section: { ...book.plan[index], content, summary } as SectionContent,
          provider: data.provider as ActiveAIProvider,
        };
      },
      () => cancelRef.current,
    );
  }

  /**
   * Every finished chapter is banked before the next one is requested, so a
   * failure costs one chapter instead of the whole manuscript.
   */
  async function runSingleWritingLoop(start: SingleResumeState) {
    let working = start.book;
    const summaries = [...start.summaries];
    let workingProvider = start.provider;
    let index = start.nextIndex;
    const sectionCount = start.sectionCount;

    const snapshot = (): SingleResumeState => ({
      book: working,
      summaries: [...summaries],
      provider: workingProvider,
      nextIndex: index,
      sectionCount,
    });

    try {
      for (; index < sectionCount; index += 1) {
        if (cancelRef.current) {
          setStatus("cancelled");
          setSingleResume(snapshot());
          if (working.sections.length > 0) saveBook(working);
          return;
        }

        setActiveSection(index);
        const result = await writeSingleSection(
          working,
          index,
          summaries,
          workingProvider,
        );
        workingProvider = result.provider;
        setActiveProvider(workingProvider);

        summaries.push(result.section.summary);
        working = {
          ...working,
          sections: [...working.sections, result.section],
          providersUsed: Array.from(
            new Set([...(working.providersUsed ?? []), workingProvider]),
          ),
        };
        setManuscript(working);
      }

      setSingleResume(null);
      setStatus("complete");
      setActiveSection(0);
      saveBook(working);
    } catch (loopError) {
      setStatus("error");
      setSingleResume(snapshot());
      if (working.sections.length > 0) saveBook(working);
      setError(
        loopError instanceof Error
          ? `${loopError.message} Your finished chapters are saved. Select Continue generating to pick up from chapter ${index + 1}.`
          : "EB Studio Pro could not finish this manuscript.",
      );
    }
  }

  async function continueSingleBook() {
    if (!singleResume) return;
    cancelRef.current = false;
    setError("");
    setStatus("writing");
    await runSingleWritingLoop(singleResume);
  }

  async function generateDualBooks() {
    if (validateBrief()) {
      setError("Complete the shared title, author, concept, and target audience.");
      return;
    }

    cancelRef.current = false;
    setError("");
    setStatus("outlining");
    setManuscript(null);
    setDualProject(null);
    setDualResume(null);
    setActiveProvider(null);

    let fictionWorking: Manuscript | null = null;
    let nonfictionWorking: Manuscript | null = null;

    try {
      const briefResponse = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dual_brief",
          mode: "fiction",
          brief,
          provider,
          dualPair: dualInput,
        }),
      });
      const pairData = await readResponse(briefResponse);
      const fictionData = (pairData.fiction ?? {}) as Record<string, unknown>;
      const nonfictionData = (pairData.nonfiction ?? {}) as Record<string, unknown>;
      const pairProvider = pairData.provider as ActiveAIProvider;
      setActiveProvider(pairProvider);

      const fictionBrief: BookBrief = {
        ...blankBrief,
        title: brief.title.trim(),
        subtitle: dualInput.fictionSubtitle.trim(),
        author: brief.author.trim(),
        genre: String(fictionData.genre ?? ""),
        characters: String(fictionData.characters ?? ""),
        premise: String(fictionData.premise ?? ""),
        chapterCount: brief.chapterCount,
      };
      const nonfictionBrief: BookBrief = {
        ...blankBrief,
        title: brief.title.trim(),
        subtitle: dualInput.nonfictionSubtitle.trim(),
        author: brief.author.trim(),
        topic: String(nonfictionData.topic ?? ""),
        audience: String(nonfictionData.audience ?? dualInput.audience),
        keyPoints: String(nonfictionData.key_points ?? ""),
        chapterCount: brief.chapterCount,
      };

      const outlineRequest = (bookMode: Mode, bookBrief: BookBrief) =>
        fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "outline",
            mode: bookMode,
            brief: bookBrief,
            provider,
            preferredProvider: provider === "auto" ? pairProvider : undefined,
          }),
        }).then(readResponse);
      const [fictionOutline, nonfictionOutline] = await Promise.all([
        outlineRequest("fiction", fictionBrief),
        outlineRequest("nonfiction", nonfictionBrief),
      ]);

      const pairId = crypto.randomUUID();
      const fictionId = crypto.randomUUID();
      const nonfictionId = crypto.randomUUID();
      const fictionProvider = fictionOutline.provider as ActiveAIProvider;
      const nonfictionProvider = nonfictionOutline.provider as ActiveAIProvider;
      const finalFictionBrief: BookBrief = {
        ...fictionBrief,
        subtitle: String(fictionOutline.subtitle ?? "").trim(),
      };
      const finalNonfictionBrief: BookBrief = {
        ...nonfictionBrief,
        subtitle: String(nonfictionOutline.subtitle ?? "").trim(),
      };

      fictionWorking = {
        id: fictionId,
        mode: "fiction",
        title: finalFictionBrief.title,
        subtitle: finalFictionBrief.subtitle ?? "",
        author: finalFictionBrief.author,
        createdAt: new Date().toISOString(),
        bookLength,
        brief: finalFictionBrief,
        plan: fictionOutline.plan as SectionPlan[],
        sections: [],
        providersUsed: [fictionProvider],
        companionOf: {
          id: nonfictionId,
          title: finalNonfictionBrief.title,
          mode: "nonfiction",
        },
      };
      nonfictionWorking = {
        id: nonfictionId,
        mode: "nonfiction",
        title: finalNonfictionBrief.title,
        subtitle: finalNonfictionBrief.subtitle ?? "",
        author: finalNonfictionBrief.author,
        createdAt: new Date().toISOString(),
        bookLength,
        brief: finalNonfictionBrief,
        plan: nonfictionOutline.plan as SectionPlan[],
        sections: [],
        providersUsed: [nonfictionProvider],
        companionOf: {
          id: fictionId,
          title: finalFictionBrief.title,
          mode: "fiction",
        },
      };
      setDualProject({
        id: pairId,
        title: brief.title.trim(),
        fiction: fictionWorking,
        nonfiction: nonfictionWorking,
      });
      setStatus("writing");

      await runDualWritingLoop({
        pairId,
        fiction: fictionWorking,
        nonfiction: nonfictionWorking,
        fictionSummaries: [],
        nonfictionSummaries: [],
        fictionProvider,
        nonfictionProvider,
        nextIndex: 0,
        sectionCount: Math.max(
          fictionWorking.plan.length,
          nonfictionWorking.plan.length,
        ),
      });
    } catch (dualError) {
      setStatus("error");
      if (fictionWorking && nonfictionWorking) {
        saveBooks([fictionWorking, nonfictionWorking]);
      }
      setError(
        dualError instanceof Error
          ? dualError.message
          : "EB Studio Pro could not finish the dual book pair.",
      );
    }
  }

  async function writeDualSection(
    book: Manuscript,
    index: number,
    summaries: string[],
    preferredProvider: ActiveAIProvider,
  ): Promise<DualSectionResult> {
    return withRetry(
      async () => {
        const sectionResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "section",
            bookLength,
            avoidNames: collectUsedNames(library),
            mode: book.mode,
            brief: book.brief,
            plan: book.plan,
            section: book.plan[index],
            sectionIndex: index,
            previousSummaries: summaries.slice(-10),
            provider,
            preferredProvider: provider === "auto" ? preferredProvider : undefined,
          }),
        });
        const data = await readResponse(sectionResponse);
        const content = String(data.content ?? "").trim();
        const summary = String(data.summary ?? "").trim();
        if (!content || !summary) {
          throw new Error(`The writer did not finish "${book.plan[index].title}".`);
        }
        return {
          section: { ...book.plan[index], content, summary } as SectionContent,
          provider: data.provider as ActiveAIProvider,
        };
      },
      () => cancelRef.current,
    );
  }

  async function runDualWritingLoop(start: DualResumeState) {
    const { pairId, sectionCount } = start;
    let fictionWorking = start.fiction;
    let nonfictionWorking = start.nonfiction;
    const fictionSummaries = [...start.fictionSummaries];
    const nonfictionSummaries = [...start.nonfictionSummaries];
    let activeFictionProvider = start.fictionProvider;
    let activeNonfictionProvider = start.nonfictionProvider;
    let index = start.nextIndex;

    const snapshot = (): DualResumeState => ({
      pairId,
      fiction: fictionWorking,
      nonfiction: nonfictionWorking,
      fictionSummaries: [...fictionSummaries],
      nonfictionSummaries: [...nonfictionSummaries],
      fictionProvider: activeFictionProvider,
      nonfictionProvider: activeNonfictionProvider,
      nextIndex: index,
      sectionCount,
    });

    try {
      for (; index < sectionCount; index += 1) {
        if (cancelRef.current) {
          setStatus("cancelled");
          setDualResume(snapshot());
          saveBooks([fictionWorking, nonfictionWorking]);
          return;
        }

        const fictionTask =
          index < fictionWorking.plan.length
            ? writeDualSection(
                fictionWorking,
                index,
                fictionSummaries,
                activeFictionProvider,
              )
            : null;
        // Stagger the second request so both books do not hit the rate limit together.
        await sleep(400);
        const nonfictionTask =
          index < nonfictionWorking.plan.length
            ? writeDualSection(
                nonfictionWorking,
                index,
                nonfictionSummaries,
                activeNonfictionProvider,
              )
            : null;

        const [fictionSettled, nonfictionSettled] = await Promise.allSettled([
          fictionTask,
          nonfictionTask,
        ]);
        if (fictionSettled.status === "rejected") throw fictionSettled.reason;
        if (nonfictionSettled.status === "rejected") throw nonfictionSettled.reason;
        const fictionResult = fictionSettled.value;
        const nonfictionResult = nonfictionSettled.value;

        if (fictionResult) {
          activeFictionProvider = fictionResult.provider;
          fictionSummaries.push(fictionResult.section.summary);
          fictionWorking = {
            ...fictionWorking,
            sections: [...fictionWorking.sections, fictionResult.section],
            providersUsed: Array.from(
              new Set([...(fictionWorking.providersUsed ?? []), activeFictionProvider]),
            ),
          };
        }
        if (nonfictionResult) {
          activeNonfictionProvider = nonfictionResult.provider;
          nonfictionSummaries.push(nonfictionResult.section.summary);
          nonfictionWorking = {
            ...nonfictionWorking,
            sections: [...nonfictionWorking.sections, nonfictionResult.section],
            providersUsed: Array.from(
              new Set([
                ...(nonfictionWorking.providersUsed ?? []),
                activeNonfictionProvider,
              ]),
            ),
          };
        }

        setDualProject({
          id: pairId,
          title: brief.title.trim(),
          fiction: fictionWorking,
          nonfiction: nonfictionWorking,
        });
      }

      setDualResume(null);
      setStatus("complete");
      saveBooks([fictionWorking, nonfictionWorking]);
    } catch (loopError) {
      setStatus("error");
      setDualResume(snapshot());
      saveBooks([fictionWorking, nonfictionWorking]);
      setError(
        loopError instanceof Error
          ? `${loopError.message} Your finished chapters are saved. Select Continue generating to pick up from chapter ${index + 1}.`
          : "EB Studio Pro could not finish the dual book pair.",
      );
    }
  }

  async function continueDualBooks() {
    if (!dualResume) return;
    cancelRef.current = false;
    setError("");
    setStatus("writing");
    await runDualWritingLoop(dualResume);
  }

  function cancelGeneration() {
    cancelRef.current = true;
  }

  function saveBook(book: Manuscript) {
    saveBooks([book]);
  }

  function saveBooks(books: Manuscript[]) {
    const updatedAt = new Date().toISOString();
    const stampedBooks = books.map((book) => ({ ...book, updatedAt }));
    setLibrary((current) => {
      const savedIds = new Set(stampedBooks.map((book) => book.id));
      const next = [
        ...stampedBooks,
        ...current.filter((item) => !savedIds.has(item.id)),
      ];
      void persistStoredLibrary(next).catch(() => {
        setError(
          "The book is open, but this browser could not permanently save its latest cover.",
        );
      });
      void Promise.all(
        stampedBooks.map((book) => saveCloudProject("manuscript", book)),
      ).then(
        () => setLibrarySyncState("synced"),
        () => setLibrarySyncState("local-only"),
      );
      return next;
    });
  }

  function openBook(book: Manuscript) {
    setManuscript(book);
    setBrief(normalizeBriefSubtitle(book));
    setMode(book.mode);
    setActiveProvider(book.providersUsed?.at(-1) ?? null);
    setStatus("complete");
    setActiveSection(0);
    setCompanionSource(book.companionOf ?? null);
    setCreationMode("single");
    setDualProject(null);
    setView("create");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeBook(id: string) {
    const next = library.filter((book) => book.id !== id);
    setLibrary(next);
    void persistStoredLibrary(next).catch(() => {
      setError("This browser could not finish removing the saved book.");
    });
    void deleteCloudProject("manuscript", id).catch(() => {
      setLibrarySyncState("local-only");
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
    setCompanionSource(null);
    setIsCreatingCompanion(false);
    setCreationMode("single");
    setDualProject(null);
    setDualInput({
      fictionSubtitle: "",
      nonfictionSubtitle: "",
      concept: "",
      audience: "",
    });
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
          bookLength: inferBookLength(manuscript),
          avoidNames: collectUsedNames(library),
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
      if (!content || !summary || content.length < MIN_SECTION_CHARACTERS) {
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

  async function createCompanionBook(source: Manuscript) {
    if (isCreatingCompanion) return;

    const targetMode: Mode = source.mode === "fiction" ? "nonfiction" : "fiction";
    setIsCreatingCompanion(true);
    setError("");
    setAutoFillMessage("");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "companion",
          mode: targetMode,
          sourceMode: source.mode,
          brief: source.brief,
          provider,
          preferredProvider:
            provider === "auto" ? source.providersUsed?.at(-1) ?? undefined : undefined,
          manuscript: {
            title: source.title,
            subtitle: source.subtitle,
            sections: source.sections.map((section) => ({
              title: section.title,
              summary: section.summary,
            })),
          },
        }),
      });
      const data = await readResponse(response);
      const chapterCount = Math.min(
        20,
        Math.max(3, Number(data.chapter_count) || source.brief.chapterCount || 8),
      );
      const nextBrief: BookBrief = {
        ...blankBrief,
        title: source.title,
        author: source.author,
        chapterCount,
        ...(targetMode === "fiction"
          ? {
              genre: String(data.genre ?? ""),
              characters: String(data.characters ?? ""),
              premise: String(data.premise ?? ""),
            }
          : {
              topic: String(data.topic ?? ""),
              audience: String(data.audience ?? ""),
              keyPoints: String(data.key_points ?? ""),
            }),
      };

      setCompanionSource({ id: source.id, title: source.title, mode: source.mode });
      setCreationMode("single");
      setDualProject(null);
      setCreatorMode("new");
      setMode(targetMode);
      setBrief(nextBrief);
      setCustomChapters("");
      setManuscript(null);
      setStatus("idle");
      setActiveSection(0);
      setActiveProvider(data.provider as ActiveAIProvider);
      setTitlePromptDismissed(true);
      setTitleSuggestions([]);
      setAutoFillMessage(
        `${targetMode === "fiction" ? "Fiction" : "Non-Fiction"} companion brief created. Review it, then generate the companion book.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (companionError) {
      setError(
        companionError instanceof Error
          ? companionError.message
          : "EB Studio Pro could not create the companion brief.",
      );
    } finally {
      setIsCreatingCompanion(false);
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
          <button
            className={view === "notes" ? "nav-button active" : "nav-button"}
            onClick={() => setView("notes")}
          >
            <NotebookPen size={18} />
            Notes
          </button>
        </nav>
      </header>

      {view === "create" ? (
        <section className="studio-grid">
          <div className={creatorMode === "visual" ? "visual-studio-span" : "form-column"}>
            <div className="creator-workspace-tabs" role="tablist" aria-label="Creator workspace">
              <button role="tab" aria-selected={creatorMode === "new"} className={creatorMode === "new" ? "selected" : ""} onClick={() => setCreatorMode("new")}>
                <Plus size={17} /> Long-Form Book
              </button>
              <button role="tab" aria-selected={creatorMode === "visual"} className={creatorMode === "visual" ? "selected" : ""} onClick={() => setCreatorMode("visual")}>
                <BookMarked size={17} /> Visual & Comics
              </button>
              <button role="tab" aria-selected={creatorMode === "optimize"} className={creatorMode === "optimize" ? "selected" : ""} onClick={() => setCreatorMode("optimize")}>
                <Sparkles size={17} /> Optimize Existing Ebook
              </button>
            </div>
            {creatorMode === "optimize" ? (
              <ExistingEbookOptimizer provider={provider} onComplete={completeOptimization} />
            ) : creatorMode === "visual" ? (
              <VisualBookStudio provider={provider} />
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

            {companionSource ? (
              <div className="companion-brief-banner">
                <BookOpen size={18} />
                <div>
                  <span>{mode === "fiction" ? "Fiction" : "Non-Fiction"} companion</span>
                  <strong>Related to {companionSource.title}</strong>
                  <small>The shared concept is preserved while this book remains standalone.</small>
                </div>
              </div>
            ) : null}

            <div className="mode-switch" role="tablist" aria-label="Book type">
              <button
                role="tab"
                aria-selected={creationMode === "single" && mode === "fiction"}
                className={creationMode === "single" && mode === "fiction" ? "selected" : ""}
                onClick={() => chooseMode("fiction")}
                disabled={fieldsLocked}
              >
                Fiction
              </button>
              <button
                role="tab"
                aria-selected={creationMode === "single" && mode === "nonfiction"}
                className={creationMode === "single" && mode === "nonfiction" ? "selected" : ""}
                onClick={() => chooseMode("nonfiction")}
                disabled={fieldsLocked}
              >
                Non-Fiction
              </button>
              <button
                role="tab"
                aria-selected={creationMode === "dual"}
                className={creationMode === "dual" ? "selected" : ""}
                onClick={chooseDualMode}
                disabled={fieldsLocked}
              >
                Fiction + Non-Fiction
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
              {creationMode === "dual" ? (
                <div className="dual-subtitle-fields">
                  <Field
                    label="Fiction subtitle (optional)"
                    value={dualInput.fictionSubtitle}
                    onChange={(value) =>
                      setDualInput((current) => ({ ...current, fictionSubtitle: value }))
                    }
                    placeholder="Leave blank and AI will create one"
                    disabled={fieldsLocked}
                  />
                  <Field
                    label="Non-Fiction subtitle (optional)"
                    value={dualInput.nonfictionSubtitle}
                    onChange={(value) =>
                      setDualInput((current) => ({ ...current, nonfictionSubtitle: value }))
                    }
                    placeholder="Leave blank and AI will create one"
                    disabled={fieldsLocked}
                  />
                </div>
              ) : (
                <Field
                  label="Book subtitle (optional)"
                  value={brief.subtitle ?? ""}
                  onChange={(value) => updateBrief("subtitle", value)}
                  placeholder="Leave blank and AI will create one"
                  disabled={fieldsLocked}
                />
              )}
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
                    {creationMode === "dual"
                      ? "Let AI build the shared concept, audience, two subtitles, and chapter count. Every suggestion stays editable."
                      : mode === "fiction"
                        ? "Let AI draft the rest of your Fiction brief. Fill in Genre first and the brief is written to match it. Every suggestion stays editable."
                        : "Let AI draft the rest of your Non-Fiction brief. Every suggestion stays editable."}
                  </p>
                </div>
                <button
                  className="ai-brief-button"
                  type="button"
                  onClick={creationMode === "dual" ? autoFillDualDetails : autoFillBrief}
                  disabled={!brief.title.trim() || fieldsLocked}
                >
                  {isAutoFilling ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}
                  {isAutoFilling
                    ? "Creating suggestions"
                    : creationMode === "dual"
                      ? "Fill Fiction + Non-Fiction Details"
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

              {creationMode === "dual" ? (
                <>
                  <Field
                    textarea
                    label="Shared central concept"
                    value={dualInput.concept}
                    onChange={(value) =>
                      setDualInput((current) => ({ ...current, concept: value }))
                    }
                    placeholder="What central theme, problem, or transformation should connect both books?"
                    disabled={fieldsLocked}
                  />
                  <Field
                    textarea
                    label="Shared target audience"
                    value={dualInput.audience}
                    onChange={(value) =>
                      setDualInput((current) => ({ ...current, audience: value }))
                    }
                    placeholder="Who should connect with both the story and the practical guide?"
                    disabled={fieldsLocked}
                  />
                </>
              ) : mode === "fiction" ? (
                <>
                  <Field
                    label="Genre"
                    value={brief.genre}
                    onChange={(value) => updateBrief("genre", value)}
                    placeholder="Fill this before auto-fill to lock the genre, e.g. Contemporary second chance romance"
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
                <legend>Book length</legend>
                <div className="length-options">
                  {bookLengths.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      className={bookLength === option.id ? "selected" : ""}
                      onClick={() => setBookLength(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <small className="length-note">
                  {bookLengths.find((option) => option.id === bookLength)?.note}
                </small>
              </fieldset>

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
                  {creationMode === "dual"
                    ? status === "complete"
                      ? "Generate another pair"
                      : "Generate both books"
                    : status === "complete"
                      ? "Generate another version"
                      : "Generate book"}
                </button>
              )}
            </form>
              </>
            )}
          </div>

          {creatorMode === "visual" ? null : creationMode === "dual" ? (
            <DualBookPreview
              project={dualProject}
              status={status}
              onOpen={openBook}
              resumeFrom={dualResume ? dualResume.nextIndex : null}
              resumeTotal={dualResume ? dualResume.sectionCount : null}
              onContinue={continueDualBooks}
            />
          ) : <BookPreview
            manuscript={manuscript}
            status={status}
            progress={progress}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            exporting={exporting}
            onExport={runExport}
            activeProvider={activeProvider}
            onSaveCover={saveCover}
            onSaveAuthor={saveAuthorName}
            repairingSection={repairingSection}
            onRepairSection={repairSection}
            isCreatingCompanion={isCreatingCompanion}
            onCreateCompanion={createCompanionBook}
            resumeFrom={singleResume ? singleResume.nextIndex : null}
            resumeTotal={singleResume ? singleResume.sectionCount : null}
            onContinue={continueSingleBook}
          />}
        </section>
      ) : view === "library" ? (
        <LibraryView
          books={library}
          syncState={librarySyncState}
          onOpen={openBook}
          onRemove={removeBook}
          onCreate={() => setView("create")}
        />
      ) : (
        <NotesView notes={notes} onChange={setNotes} preview={notesPreview} onTogglePreview={setNotesPreview} />
      )}
      {creatorMode !== "visual" ? <CreativeAssistant
        mode={mode}
        brief={brief}
        manuscript={manuscript}
        activeSection={activeSection}
        provider={provider}
        onApplyTitle={applyAssistantTitle}
        onApplySection={applyAssistantSection}
        creationMode={creationMode}
        dualContext={
          creationMode === "dual"
            ? {
                title: brief.title,
                concept: dualInput.concept,
                audience: dualInput.audience,
                fictionSubtitle: dualInput.fictionSubtitle,
                nonfictionSubtitle: dualInput.nonfictionSubtitle,
                fictionTitle: dualProject?.fiction.title ?? "",
                nonfictionTitle: dualProject?.nonfiction.title ?? "",
              }
            : null
        }
      /> : null}
    </main>
  );
}

function DualBookPreview({
  project,
  status,
  onOpen,
  resumeFrom,
  resumeTotal,
  onContinue,
}: {
  project: DualBookProject | null;
  status: GenerationStatus;
  onOpen: (book: Manuscript) => void;
  resumeFrom?: number | null;
  resumeTotal?: number | null;
  onContinue?: () => void;
}) {
  if (!project) {
    return (
      <aside className="preview-panel dual-preview-panel" aria-live="polite">
        <div className={status === "outlining" ? "generation-empty" : "empty-state"}>
          {status === "outlining" ? (
            <LoaderCircle className="spin" size={34} />
          ) : (
            <div className="dual-book-illustration" aria-hidden="true">
              <BookOpen size={30} />
              <BookOpen size={30} />
            </div>
          )}
          <p className="preview-kicker">
            {status === "outlining" ? "Building the shared Book DNA" : "Dual Book Project"}
          </p>
          <h2>
            {status === "outlining"
              ? "Designing two connected books"
              : "One concept. Two complete books."}
          </h2>
          <p>
            {status === "outlining"
              ? "EB Studio Pro is creating aligned fiction and non-fiction briefs and outlines."
              : "Fiction delivers the emotional experience. Non-fiction delivers the practical transformation."}
          </p>
        </div>
      </aside>
    );
  }

  const books = [project.fiction, project.nonfiction];
  const canOpen = status !== "outlining" && status !== "writing";
  const canResume =
    typeof resumeFrom === "number" &&
    typeof resumeTotal === "number" &&
    resumeFrom < resumeTotal &&
    status !== "writing" &&
    status !== "outlining" &&
    Boolean(onContinue);

  return (
    <aside className="preview-panel dual-preview-panel" aria-live="polite">
      {canResume ? (
        <div className="dual-resume-bar">
          <div>
            <strong>Generation stopped at chapter {(resumeFrom ?? 0) + 1} of {resumeTotal}</strong>
            <p>Your finished chapters are saved. Continue from where it stopped instead of starting over.</p>
          </div>
          <button type="button" onClick={onContinue}>
            <Sparkles size={15} />
            Continue generating
          </button>
        </div>
      ) : null}
      <div className="dual-preview-heading">
        <div>
          <span className="preview-kicker">Dual Book Project</span>
          <h2>{project.title}</h2>
          <p>
            {status === "complete"
              ? "Both manuscripts are complete and saved as a companion pair."
              : status === "writing"
                ? "Both writers are working in synchronized section cycles."
                : "Generation paused. Open either manuscript to inspect or repair it."}
          </p>
        </div>
        {status === "complete" ? (
          <span className="dual-complete-badge"><Check size={15} /> Pair complete</span>
        ) : status === "writing" ? (
          <span className="dual-writing-badge"><LoaderCircle className="spin" size={15} /> Writing both</span>
        ) : null}
      </div>

      <div className="dual-lanes">
        {books.map((book) => {
          const completed = book.plan.filter(
            (_, index) => Boolean(book.sections[index]?.content?.trim()),
          ).length;
          const percent = book.plan.length
            ? Math.round((completed / book.plan.length) * 100)
            : 0;
          return (
            <article className={`dual-lane ${book.mode}`} key={book.id}>
              <div className="dual-lane-label">
                <span>{book.mode === "fiction" ? "Fiction" : "Non-Fiction"}</span>
                <strong>{completed} of {book.plan.length} sections</strong>
              </div>
              <h3>{book.title}</h3>
              <p>{book.subtitle || "Subtitle will be created during outlining."}</p>
              <div className="dual-lane-progress" aria-label={`${percent}% complete`}>
                <span style={{ width: `${percent}%` }} />
              </div>
              <small>
                {(book.providersUsed ?? []).map(providerLabel).join(" + ") || "Writer pending"}
              </small>
              <button onClick={() => onOpen(book)} disabled={!canOpen}>
                {canOpen ? <BookOpen size={15} /> : <LoaderCircle className="spin" size={15} />}
                {canOpen
                  ? `Open ${book.mode === "fiction" ? "Fiction" : "Non-Fiction"} Book`
                  : "Writing manuscript"}
              </button>
            </article>
          );
        })}
      </div>
    </aside>
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
  onSaveAuthor,
  repairingSection,
  onRepairSection,
  isCreatingCompanion,
  onCreateCompanion,
  resumeFrom,
  resumeTotal,
  onContinue,
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
  onSaveAuthor: (author: string) => void;
  repairingSection: number | null;
  onRepairSection: (index: number) => void;
  isCreatingCompanion: boolean;
  onCreateCompanion: (source: Manuscript) => void;
  resumeFrom?: number | null;
  resumeTotal?: number | null;
  onContinue?: () => void;
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
  const activeSectionContent = manuscript.sections[activeSection];
  const selected =
    (isSectionFinished(activeSectionContent) ? activeSectionContent : undefined) ??
    (!isComplete ? manuscript.sections[manuscript.sections.length - 1] : null) ??
    null;
  const selectedPlan = manuscript.plan[activeSection] ?? null;
  const completedCount = manuscript.plan.filter(
    (_, index) => isSectionFinished(manuscript.sections[index]),
  ).length;
  const wordCount = manuscriptWordCount(manuscript);
  const shortSections = shortSectionIndexes(manuscript.sections);
  const tenseOutliers = tenseOutlierIndexes(manuscript.sections);
  const incompleteSectionIndex = manuscript.plan.findIndex(
    (_, index) => !isSectionFinished(manuscript.sections[index]),
  );
  const kdpReadiness = getKdpReadiness(manuscript);
  const coverReadiness = getCoverReadiness(manuscript);
  const canResume =
    typeof resumeFrom === "number" &&
    typeof resumeTotal === "number" &&
    resumeFrom < resumeTotal &&
    Boolean(onContinue);

  return (
    <aside className="preview-panel manuscript-panel" aria-live="polite">
      {canResume ? (
        <div className="dual-resume-bar">
          <div>
            <strong>Generation stopped at chapter {(resumeFrom ?? 0) + 1} of {resumeTotal}</strong>
            <p>Your finished chapters are saved. Continue from where it stopped instead of starting over.</p>
          </div>
          <button type="button" onClick={onContinue}>
            <Sparkles size={15} />
            Continue generating
          </button>
        </div>
      ) : null}
      <div className="manuscript-toolbar">
        <div>
          <span className="preview-kicker">
            {isComplete && incompleteSectionIndex < 0
              ? "Manuscript complete"
              : isComplete
                ? "Manuscript needs repair"
                : "Writing in progress"}
          </span>
          <strong>
            {completedCount} of {manuscript.plan.length} sections
            {wordCount > 0 ? `, ${wordCount.toLocaleString()} words` : ""}
          </strong>
          <div className="provider-badges" aria-label="AI writers used">
            {(manuscript.providersUsed ?? (activeProvider ? [activeProvider] : [])).map(
              (usedProvider) => (
                <span key={usedProvider}>Written by {providerLabel(usedProvider)}</span>
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

      {isComplete && incompleteSectionIndex < 0 ? (
        <div className="companion-action-bar">
          <div>
            <strong>Build the companion book</strong>
            <span>
              Turn this {manuscript.mode === "fiction" ? "story into a practical guide" : "guide into an original story"} with the same core title and theme.
            </span>
          </div>
          <button
            onClick={() => onCreateCompanion(manuscript)}
            disabled={isCreatingCompanion}
          >
            {isCreatingCompanion ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <BookOpen size={15} />
            )}
            {isCreatingCompanion
              ? "Creating companion brief"
              : `Create ${manuscript.mode === "fiction" ? "Non-Fiction" : "Fiction"} Companion`}
          </button>
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
          onSaveAuthor={onSaveAuthor}
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
            const finished = isSectionFinished(manuscript.sections[index]);
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
                <em>
                  {section.title}
                  {section.pov ? <small>{section.pov}</small> : null}
                </em>
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
              {isComplete ? (
                <div className="section-rewrite">
                  <p>
                    <strong className="section-stat">
                      {sectionWordCount(selected).toLocaleString()} words
                    </strong>
                    {shortSections.includes(activeSection) ? (
                      <span className="section-flag">
                        Much shorter than the rest of this book
                      </span>
                    ) : null}
                    {tenseOutliers.includes(activeSection) ? (
                      <span className="section-flag">
                        Written in a different tense from the rest of this book
                      </span>
                    ) : null}
                    Not right? Only this chapter is written again. The rest of your
                    book stays unchanged.
                  </p>
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
                    {repairingSection === activeSection
                      ? "Rewriting chapter"
                      : "Rewrite this chapter"}
                  </button>
                </div>
              ) : null}
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

function normalizeBriefSubtitle(book: Manuscript): BookBrief {
  return {
    ...book.brief,
    subtitle: book.brief.subtitle?.trim() || book.subtitle || "",
  };
}

function LibraryView({
  books,
  syncState,
  onOpen,
  onRemove,
  onCreate,
}: {
  books: Manuscript[];
  syncState: SyncState;
  onOpen: (book: Manuscript) => void;
  onRemove: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <section className="library-view">
      <div>
        <span className="eyebrow"><LibraryBig size={18} /> Your library</span>
        <h1>Every manuscript, in one place.</h1>
        <p>{syncState === "synced" ? "Cloud synced across your signed-in devices, with an offline copy kept here." : syncState === "syncing" ? "Syncing this device with your private cloud library..." : "Saved on this device. Cloud sync will resume when account storage is available."}</p>
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
                {book.companionOf ? <b className="companion-card-label">Companion Book</b> : null}
                <h2>{book.title}</h2>
                {book.subtitle ? <p>{book.subtitle}</p> : null}
                <small>{book.author}</small>
              </button>
              <div className="book-card-footer">
                <span>
                  {book.brief.chapterCount} chapters
                  {book.companionOf ? ` · Related to ${book.companionOf.mode === "fiction" ? "Fiction" : "Non-Fiction"}` : ""}
                </span>
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

function NotesView({
  notes,
  onChange,
  preview,
  onTogglePreview,
}: {
  notes: string;
  onChange: (value: string) => void;
  preview: boolean;
  onTogglePreview: (value: boolean) => void;
}) {
  return (
    <section className="library-view">
      <div className="notes-header">
        <div>
          <span className="eyebrow"><NotebookPen size={18} /> Notes</span>
          <h1>Keep your working notes here.</h1>
          <p>Titles, subtitles, checklists, anything you want handy. Saved automatically in this browser. Paste a markdown table and switch to Preview to see it rendered.</p>
        </div>
        <div className="notes-toggle" role="tablist" aria-label="Notes mode">
          <button
            role="tab"
            aria-selected={!preview}
            className={!preview ? "selected" : ""}
            onClick={() => onTogglePreview(false)}
          >
            Edit
          </button>
          <button
            role="tab"
            aria-selected={preview}
            className={preview ? "selected" : ""}
            onClick={() => onTogglePreview(true)}
          >
            Preview
          </button>
        </div>
      </div>
      {preview ? (
        <div className="notes-preview-panel">
          <NotesMarkdown text={notes} />
        </div>
      ) : (
        <textarea
          className="notes-textarea"
          value={notes}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Paste your title list, KDP checklist, or anything else you want to keep close..."
          rows={20}
        />
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
