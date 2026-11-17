"use client";

import { mergeCharacterLock } from "./visual-image-prompt";
import CharacterRefsPanel from "./character-refs-panel";
import { referencesForScene } from "./character-refs";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileImage,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ActiveAIProvider, AIProvider } from "./book-types";
import {
  VISUAL_BOOK_KINDS,
  VISUAL_STYLES,
  blankVisualBookBrief,
  isRetiredComicRequest,
  type VisualBookBrief,
  type VisualBookPage,
  type VisualBookProject,
  type VisualPageCount,
} from "./visual-book-types";
import { normalizeVisualPages } from "./visual-book-utils";
import {
  exportVisualPageJpeg,
  exportVisualPagesZip,
  exportVisualPdf,
  renderVisualPage,
} from "./visual-book-exporters";
import {
  deleteVisualProject,
  loadVisualProjects,
  saveVisualProject,
} from "./visual-book-storage";
import {
  deleteCloudProject,
  saveCloudProject,
  syncCloudProjects,
  type SyncState,
} from "./cloud-library-client";
import VisualCreativeAssistant from "./visual-creative-assistant";

type Busy = "" | "storyboard" | "page" | "image" | "all-images" | "pdf" | "zip";

export default function VisualBookStudio({ provider }: { provider: AIProvider }) {
  const [brief, setBrief] = useState<VisualBookBrief>(() => blankVisualBookBrief("visual"));
  const [project, setProject] = useState<VisualBookProject | null>(null);
  const [projects, setProjects] = useState<VisualBookProject[]>([]);
  const [activePage, setActivePage] = useState(0);
  const [busy, setBusy] = useState<Busy>("");
  const [busyTarget, setBusyTarget] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("syncing");
  const [castBusy, setCastBusy] = useState(false);

  const page = project?.pages[activePage] ?? null;
  const locked = Boolean(busy) || castBusy;

  useEffect(() => {
    let dead = false;
    void loadVisualProjects()
      .then(async local => {
        const synced = await syncCloudProjects("visual", local);
        if (dead) return;
        // Comics were removed from the app; a comic saved earlier is not listed or opened.
        const visualProjects = synced.projects.filter(item => !isRetiredComicRequest(item));
        setProjects(visualProjects);
        setSyncState(synced.state);
        await Promise.all(visualProjects.map(saveVisualProject));
      })
      .catch(() => {
        if (!dead) setError("Saved visual projects could not be loaded from this browser.");
      });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (!project) return;
    const timer = window.setTimeout(() => {
      void saveVisualProject(project)
        .then(() =>
          setProjects(current =>
            [project, ...current.filter(item => item.id !== project.id)].sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt),
            ),
          ),
        )
        .catch(() => setError("This browser could not save the latest visual project changes."));
      void saveCloudProject("visual", project)
        .then(() => setSyncState("synced"))
        .catch(() => setSyncState("local-only"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [project]);

  const imageProgress = useMemo(() => {
    if (!project) return { complete: 0, total: 0 };
    return {
      complete: project.pages.filter(item => item.imageData).length,
      total: project.pages.length,
    };
  }, [project]);

  function updateBrief<K extends keyof VisualBookBrief>(key: K, value: VisualBookBrief[K]) {
    setBrief(current => ({ ...current, [key]: value }));
  }

  function updateProjectBrief<K extends keyof VisualBookBrief>(key: K, value: VisualBookBrief[K]) {
    setBrief(current => ({ ...current, [key]: value }));
    setProject(current =>
      current ? { ...current, [key]: value, updatedAt: new Date().toISOString() } : current,
    );
  }

  function applyAssistantBrief(patch: Partial<VisualBookBrief>) {
    setBrief(current => ({ ...current, ...patch }));
    setProject(current =>
      current ? { ...current, ...patch, updatedAt: new Date().toISOString() } : current,
    );
    setNotice("Ask EB suggestions applied. Review the filled fields before generating.");
  }

  function reset() {
    setProject(null);
    setBrief(blankVisualBookBrief());
    setActivePage(0);
    setError("");
    setNotice("");
  }

  async function createStoryboard(event: FormEvent) {
    event.preventDefault();
    if (!brief.title.trim() || !brief.author.trim() || !brief.premise.trim()) {
      setError("Add the title, author, and story idea or core promise first — or ask EB to fill the setup.");
      return;
    }
    setBusy("storyboard");
    setError("");
    setNotice("");
    try {
      const data = await api("/api/generate", {
        action: "visual_storyboard",
        mode: "fiction",
        brief: { title: brief.title },
        provider,
        visualProject: brief,
      });
      const now = new Date().toISOString();
      const refined = {
        ...brief,
        subtitle: brief.subtitle.trim() || String(data.refined_subtitle ?? "").trim(),
        characterBible: mergeCharacterLock(brief.characterBible, String(data.character_bible ?? "")),
        palette: brief.palette.trim() || String(data.palette ?? "").trim(),
      };
      const next: VisualBookProject = {
        ...refined,
        id: project?.id ?? crypto.randomUUID(),
        createdAt: project?.createdAt ?? now,
        updatedAt: now,
        pages: normalizeVisualPages(data.pages, refined.pageCount),
        providersUsed: data.provider ? [data.provider as ActiveAIProvider] : [],
      };
      setBrief(refined);
      setProject(next);
      setActivePage(0);
      setNotice("Storyboard ready. Review the pages and character lock before generating images.");
    } catch (caught) {
      setError(message(caught, "The visual storyboard could not be created."));
    } finally {
      setBusy("");
    }
  }

  function updatePage(patch: Partial<VisualBookPage>) {
    if (!project || !page) return;
    setProject({
      ...project,
      pages: project.pages.map((item, index) =>
        index === activePage ? { ...item, ...patch } : item,
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  async function rewrite() {
    if (!project || !page) return;
    setBusy("page");
    setError("");
    try {
      const data = await api("/api/generate", {
        action: "visual_page",
        mode: "fiction",
        brief: { title: project.title },
        provider,
        preferredProvider: project.providersUsed?.at(-1),
        visualProject: { ...project, page },
      });
      const rewritten = normalizeVisualPages([data.page], 1)[0];
      updatePage({
        ...rewritten,
        id: page.id,
        pageNumber: page.pageNumber,
        role: page.role,
      });
      setNotice(`Page ${page.pageNumber} was rewritten. Existing art stays until you regenerate it.`);
    } catch (caught) {
      setError(message(caught, "This page could not be rewritten."));
    } finally {
      setBusy("");
    }
  }

  async function generateImage(pageIndex: number) {
    if (!project) return;
    const selectedPage = project.pages[pageIndex];
    setBusy("image");
    setBusyTarget(`${selectedPage.pageNumber}`);
    setError("");
    try {
      const imageData = await visualImage(project, selectedPage);
      setProject(current => {
        if (!current) return current;
        return {
          ...current,
          updatedAt: new Date().toISOString(),
          pages: current.pages.map((item, index) => (index === pageIndex ? { ...item, imageData } : item)),
        };
      });
    } catch (caught) {
      setError(message(caught, "This image could not be generated."));
    } finally {
      setBusy("");
      setBusyTarget("");
    }
  }

  async function generateAll(redraw = false) {
    if (!project) return;
    if (
      redraw &&
      !window.confirm(
        `Redraw all ${imageProgress.total} images with the character references? This replaces the current art and uses image credits for each one.`,
      )
    ) {
      return;
    }
    setBusy("all-images");
    setError("");
    let working = project;
    try {
      for (let pageIndex = 0; pageIndex < working.pages.length; pageIndex += 1) {
        const selectedPage = working.pages[pageIndex];
        if (redraw || !selectedPage.imageData) {
          setBusyTarget(`${selectedPage.pageNumber}`);
          const imageData = await visualImage(working, selectedPage);
          working = {
            ...working,
            updatedAt: new Date().toISOString(),
            pages: working.pages.map((item, index) =>
              index === pageIndex ? { ...item, imageData } : item,
            ),
          };
          setProject(working);
        }
      }
      setNotice("All page art is complete. Page text remains editable.");
    } catch (caught) {
      setProject(working);
      setError(`${message(caught, "Image generation stopped.")} Finished images were saved.`);
    } finally {
      setBusy("");
      setBusyTarget("");
    }
  }

  function move(direction: -1 | 1) {
    if (!project || activePage === 0) return;
    const target = activePage + direction;
    if (target < 1 || target >= project.pages.length) return;
    const pages = [...project.pages];
    [pages[activePage], pages[target]] = [pages[target], pages[activePage]];
    setProject({
      ...project,
      updatedAt: new Date().toISOString(),
      pages: pages.map((item, index) => ({
        ...item,
        pageNumber: index + 1,
        role: index === 0 ? "cover" : index === pages.length - 1 ? "cta" : "content",
      })),
    });
    setActivePage(target);
  }

  async function runExport(kind: "pdf" | "zip" | "page") {
    if (!project || !page) return;
    setBusy(kind === "pdf" ? "pdf" : kind === "zip" ? "zip" : "image");
    try {
      if (kind === "pdf") await exportVisualPdf(project);
      if (kind === "zip") await exportVisualPagesZip(project);
      if (kind === "page") await exportVisualPageJpeg(project, page);
    } catch (caught) {
      setError(message(caught, "The visual export could not be created."));
    } finally {
      setBusy("");
    }
  }

  function open(saved: VisualBookProject) {
    setBrief(projectBrief(saved));
    setProject(saved);
    setActivePage(0);
    setNotice("Saved visual project opened.");
  }

  async function remove(saved: VisualBookProject) {
    await deleteVisualProject(saved.id);
    void deleteCloudProject("visual", saved.id).catch(() => setSyncState("local-only"));
    setProjects(current => current.filter(item => item.id !== saved.id));
    if (project?.id === saved.id) reset();
  }

  return (
    <div className="visual-studio">
      <div className="visual-studio-header">
        <div>
          <span className="eyebrow"><LayoutGrid size={18} /> Page-based creator</span>
          <h1>Build a visual mini book.</h1>
          <p>Three to fifty designed pages with editable text and consistent art.</p>
        </div>
        {project ? (
          <button className="visual-new-button" onClick={reset}><Plus size={16} /> New visual project</button>
        ) : null}
      </div>

      <div className="visual-workspace">
        <form className="visual-brief-panel" onSubmit={createStoryboard}>
          <div className="visual-askeb-callout">
            <div>
              <Sparkles size={17} />
              <span><strong>Ask EB can fill this setup.</strong><small>Give it the idea; it will spot missing fields and sharpen the brief.</small></span>
            </div>
          </div>
          <Field label="Title" value={brief.title} set={value => updateBrief("title", value)} placeholder="Your visual book title" disabled={locked || Boolean(project)} />
          <Field label="Subtitle (optional)" value={brief.subtitle} set={value => project ? updateProjectBrief("subtitle", value) : updateBrief("subtitle", value)} placeholder="AI can create one" disabled={locked} />
          <Field label="Author" value={brief.author} set={value => project ? updateProjectBrief("author", value) : updateBrief("author", value)} placeholder="Author name" disabled={locked} />

          <fieldset className="visual-choice-field" disabled={locked || Boolean(project)}>
            <legend>Mini book type</legend>
            <div className="visual-choice-grid">
              {VISUAL_BOOK_KINDS.map(option => (
                <button
                  type="button"
                  key={option.id}
                  className={brief.kind === option.id ? "selected" : ""}
                  onClick={() => updateBrief("kind", option.id)}
                >
                  <strong>{option.label}</strong><small>{option.note}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <Field textarea label="Story idea or core promise" value={brief.premise} set={value => project ? updateProjectBrief("premise", value) : updateBrief("premise", value)} placeholder="What should happen, change, or help the reader?" disabled={locked} />
          <Field label="Target reader" value={brief.audience} set={value => project ? updateProjectBrief("audience", value) : updateBrief("audience", value)} placeholder="Who is this for?" disabled={locked} />

          <fieldset className="visual-inline-options" disabled={locked || Boolean(project)}>
            <legend>Total pages, including cover</legend>
            <div>
              {([5, 7, 10, 15] as VisualPageCount[]).map(count => (
                <button type="button" key={count} className={brief.pageCount === count ? "selected" : ""} onClick={() => updateBrief("pageCount", count)}>{count}</button>
              ))}
              <label className="visual-page-count-custom">
                <span>Custom</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={50}
                  step={1}
                  value={brief.pageCount}
                  onChange={event => updateBrief("pageCount", Math.min(50, Math.max(3, Math.round(Number(event.target.value) || 3))))}
                  aria-label="Custom total page count"
                />
              </label>
            </div>
            <small>Choose any exact length from 3 to 50 pages. Larger books use more AI credits.</small>
          </fieldset>

          <fieldset className="visual-inline-options" disabled={locked}>
            <legend>Visual style</legend>
            <select value={brief.visualStyle} onChange={event => project ? updateProjectBrief("visualStyle", event.target.value as VisualBookBrief["visualStyle"]) : updateBrief("visualStyle", event.target.value as VisualBookBrief["visualStyle"])}>
              {VISUAL_STYLES.map(style => <option key={style.id} value={style.id}>{style.label}</option>)}
            </select>
          </fieldset>

          <div className="character-lock-block">
            <div>
              <span><Save size={15} /> Character & world lock</span>
              <small>Used on every recurring image for consistency.</small>
            </div>
            <textarea rows={5} value={brief.characterBible} onChange={event => project ? updateProjectBrief("characterBible", event.target.value) : updateBrief("characterBible", event.target.value)} placeholder="Ask EB can build this if blank" disabled={locked} />
            <textarea rows={3} value={brief.palette} onChange={event => project ? updateProjectBrief("palette", event.target.value) : updateBrief("palette", event.target.value)} placeholder="Palette and lighting lock" disabled={locked} />
            {project?.characterBible ? <b><Check size={14} /> Character design locked</b> : null}
          </div>

          {project ? (
            <CharacterRefsPanel
              brief={projectBrief(project)}
              pages={project.pages}
              refs={project.characterRefs ?? []}
              onChange={characterRefs =>
                setProject(current =>
                  current ? { ...current, characterRefs, updatedAt: new Date().toISOString() } : current,
                )
              }
              provider={provider}
              disabled={locked}
              onBusyChange={setCastBusy}
            />
          ) : null}
          {project?.characterRefs?.some(ref => ref.imageData) && imageProgress.complete > 0 ? (
            <button className="character-refs-redraw" type="button" onClick={() => generateAll(true)} disabled={locked}>
              <RotateCcw size={15} /> Redraw all art with these references
            </button>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="visual-notice"><Check size={15} />{notice}</p> : null}

          {!project ? (
            <button className="generate-button" type="submit" disabled={locked}>
              {busy === "storyboard" ? <LoaderCircle className="spin" /> : <Sparkles />}
              {busy === "storyboard" ? "Designing every page" : "Create editable storyboard"}
            </button>
          ) : (
            <div className="visual-production-actions">
              <button className="visual-primary-action" type="button" onClick={() => generateAll()} disabled={locked || imageProgress.complete === imageProgress.total}>
                {busy === "all-images" ? <LoaderCircle className="spin" /> : <ImageIcon />}
                {busy === "all-images"
                  ? `Creating art ${imageProgress.complete + 1} of ${imageProgress.total}`
                  : imageProgress.complete === imageProgress.total
                    ? "All art complete"
                    : `Generate all art (${imageProgress.total - imageProgress.complete} remaining)`}
              </button>
              <div className="visual-export-actions">
                <button type="button" onClick={() => runExport("pdf")} disabled={locked}><FileText size={16} /> PDF</button>
                <button type="button" onClick={() => runExport("zip")} disabled={locked}><Download size={16} /> Page ZIP</button>
              </div>
            </div>
          )}
        </form>

        <div className="visual-editor-panel">
          {project && page ? (
            <>
              <div className="visual-editor-toolbar">
                <div><span>Storyboard</span><strong>{project.pages.length} pages · {imageProgress.complete}/{imageProgress.total} images</strong></div>
                <div>
                  <button onClick={() => move(-1)} disabled={locked || activePage <= 1}><ChevronUp size={16} /></button>
                  <button onClick={() => move(1)} disabled={locked || activePage === 0 || activePage >= project.pages.length - 1}><ChevronDown size={16} /></button>
                  <button onClick={rewrite} disabled={locked}><RotateCcw size={16} /> Rewrite page</button>
                </div>
              </div>

              <div className="visual-page-tabs">
                {project.pages.map((item, index) => (
                  <button key={item.id} className={index === activePage ? "selected" : ""} onClick={() => setActivePage(index)}>
                    <span>{item.pageNumber}</span>
                    <small>{item.role === "cover" ? "Cover" : item.title}</small>
                    {hasArt(item) ? <Check size={12} /> : null}
                  </button>
                ))}
              </div>

              <div className="visual-page-editor">
                <PagePreview project={project} page={page} />
                <div className="visual-page-controls">
                  <div className="visual-page-meta"><span>Page {page.pageNumber}</span><small>{page.role}</small></div>
                  <Field label="Page heading" value={page.title} set={value => updatePage({ title: value })} placeholder="Page heading" disabled={locked} />
                  <Field textarea label="Page copy" value={page.body} set={value => updatePage({ body: value })} placeholder="Short page copy" disabled={locked} />

                  {page.role !== "cover" ? (
                    <Field label="Pull quote (one sentence from the page copy)" value={page.pullQuote ?? ""} set={value => updatePage({ pullQuote: value })} placeholder="Leave blank and EB picks one" disabled={locked} />
                  ) : null}
                  <Field textarea label="Art direction" value={page.imagePrompt} set={value => updatePage({ imagePrompt: value })} placeholder="Visible scene only" disabled={locked} />
                  <button className="panel-image-button" type="button" onClick={() => generateImage(activePage)} disabled={locked}>
                    {busy === "image" && busyTarget === String(page.pageNumber) ? <LoaderCircle className="spin" /> : <ImageIcon />}
                    {page.imageData ? "Regenerate page art" : "Generate page art"}
                  </button>

                  <button className="download-page-button" type="button" onClick={() => runExport("page")} disabled={locked}><Download size={16} /> Download this page JPG</button>
                </div>
              </div>
            </>
          ) : (
            <div className="visual-empty-preview">
              <div><FileImage size={38} /><LayoutGrid size={30} /></div>
              <span className="preview-kicker">Visual publishing</span>
              <h2>One idea. Up to ten designed pages.</h2>
              <p>Create and approve the page plan before image generation begins.</p>
              <div><span>Editable text</span><span>Character lock</span><span>Page-by-page art</span></div>
            </div>
          )}
        </div>
      </div>

      <VisualCreativeAssistant
        provider={provider}
        brief={brief}
        project={project}
        page={page}
        onApplyBrief={applyAssistantBrief}
        onApplyPage={updatePage}
      />

      {projects.length ? (
        <section className="visual-project-library">
          <div>
            <span className="eyebrow"><BookOpen size={16} /> Saved visual projects</span>
            <small>{syncState === "synced" ? "Cloud synced across devices" : syncState === "syncing" ? "Syncing this device..." : "Saved locally; cloud sync paused"}</small>
          </div>
          <div>
            {projects.map(saved => (
              <article key={saved.id}>
                <button className="visual-project-open" onClick={() => open(saved)}>
                  <span>Visual Mini</span>
                  <strong>{saved.title}</strong>
                  <small>{saved.pages.length} pages · {saved.author}</small>
                </button>
                <button className="visual-project-delete" onClick={() => void remove(saved)}><Trash2 size={15} /></button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PagePreview({ project, page }: { project: VisualBookProject; page: VisualBookPage }) {
  // The preview is the exported page itself, so what you see is what you download.
  const [rendered, setRendered] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void renderVisualPage(project, page)
        .then(url => {
          if (cancelled) return;
          setRendered(url);
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project, page]);
  return (
    <div className="visual-page-canvas visual-page-rendered">
      {rendered ? (
        // eslint-disable-next-line @next/next/no-img-element -- a rendered data URL, not a remote asset
        <img className="visual-page-render" src={rendered} alt={`Page ${page.pageNumber} preview`} />
      ) : (
        <div className="visual-preview-image"><span>{failed ? "Preview unavailable" : <><LoaderCircle className="spin" size={16} /> Rendering page</>}</span></div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  set,
  placeholder,
  textarea = false,
  disabled = false,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  placeholder: string;
  textarea?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field visual-field">
      <span>{label}</span>
      {textarea ? (
        <textarea value={value} onChange={event => set(event.target.value)} placeholder={placeholder} rows={4} disabled={disabled} />
      ) : (
        <input value={value} onChange={event => set(event.target.value)} placeholder={placeholder} disabled={disabled} />
      )}
    </label>
  );
}

async function api(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error ?? "The generator could not be reached. Your project is safe."));
  return data;
}

async function visualImage(project: VisualBookProject, page: VisualBookPage) {
  // Send the reference drawing of every character this page names.
  const references = referencesForScene(project.characterRefs, page.imagePrompt);
  const data = await api("/api/visual-image", { project: projectBrief(project), page, references });
  const imageData = String(data.imageData ?? "");
  if (!imageData) throw new Error("The image generator returned no usable image.");
  return imageData;
}

function projectBrief(project: VisualBookProject): VisualBookBrief {
  return {
    mode: project.mode,
    title: project.title,
    subtitle: project.subtitle,
    author: project.author,
    kind: project.kind,
    premise: project.premise,
    audience: project.audience,
    pageCount: project.pageCount,
    visualStyle: project.visualStyle,
    characterBible: project.characterBible,
    palette: project.palette,
  };
}

function hasArt(page: VisualBookPage) {
  return Boolean(page.imageData);
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
