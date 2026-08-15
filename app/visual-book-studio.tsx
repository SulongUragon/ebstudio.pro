"use client";

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
  MessageCircle,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ActiveAIProvider, AIProvider } from "./book-types";
import {
  COMIC_FORMATS,
  VISUAL_BOOK_KINDS,
  VISUAL_STYLES,
  blankVisualBookBrief,
  type ComicPanel,
  type VisualBookBrief,
  type VisualBookPage,
  type VisualBookProject,
  type VisualPageCount,
  type VisualProjectMode,
} from "./visual-book-types";
import { normalizeVisualPages } from "./visual-book-utils";
import {
  exportVisualPageJpeg,
  exportVisualPagesZip,
  exportVisualPdf,
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
  const [mode, setMode] = useState<VisualProjectMode>("visual");
  const [brief, setBrief] = useState<VisualBookBrief>(() => blankVisualBookBrief("visual"));
  const [project, setProject] = useState<VisualBookProject | null>(null);
  const [projects, setProjects] = useState<VisualBookProject[]>([]);
  const [activePage, setActivePage] = useState(0);
  const [busy, setBusy] = useState<Busy>("");
  const [busyTarget, setBusyTarget] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("syncing");

  const page = project?.pages[activePage] ?? null;
  const locked = Boolean(busy);

  useEffect(() => {
    let dead = false;
    void loadVisualProjects()
      .then(async local => {
        const synced = await syncCloudProjects("visual", local);
        if (dead) return;
        setProjects(synced.projects);
        setSyncState(synced.state);
        await Promise.all(synced.projects.map(saveVisualProject));
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
    if (project.mode === "comic") {
      const panels = project.pages.flatMap(item => item.panels);
      return {
        complete: panels.filter(item => item.imageData).length,
        total: panels.length,
      };
    }
    return {
      complete: project.pages.filter(item => item.imageData).length,
      total: project.pages.length,
    };
  }, [project]);

  function chooseMode(next: VisualProjectMode) {
    if (locked || next === mode) return;
    setMode(next);
    setBrief(blankVisualBookBrief(next));
    setProject(null);
    setActivePage(0);
    setError("");
    setNotice("");
  }

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
    setBrief(blankVisualBookBrief(mode));
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
        characterBible:
          brief.characterBible.trim() || String(data.character_bible ?? "").trim(),
        palette: brief.palette.trim() || String(data.palette ?? "").trim(),
      };
      const next: VisualBookProject = {
        ...refined,
        id: project?.id ?? crypto.randomUUID(),
        createdAt: project?.createdAt ?? now,
        updatedAt: now,
        pages: normalizeVisualPages(data.pages, refined.pageCount, refined.mode),
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

  function updatePanel(index: number, patch: Partial<ComicPanel>) {
    if (!page) return;
    updatePage({
      panels: page.panels.map((item, panelIndex) =>
        panelIndex === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function addPanel() {
    if (!page || page.panels.length >= 4) return;
    updatePage({
      panels: [
        ...page.panels,
        {
          id: `panel-${crypto.randomUUID()}`,
          order: page.panels.length + 1,
          scene: "",
          camera: "medium cinematic composition",
          dialogue: [],
          caption: "",
          soundEffect: "",
        },
      ],
    });
  }

  function removePanel(index: number) {
    if (!page || page.panels.length <= 1) return;
    updatePage({
      panels: page.panels
        .filter((_, panelIndex) => panelIndex !== index)
        .map((item, panelIndex) => ({ ...item, order: panelIndex + 1 })),
    });
  }

  function addDialogue(index: number) {
    if (!page) return;
    updatePanel(index, {
      dialogue: [...page.panels[index].dialogue, { speaker: "", text: "" }].slice(0, 3),
    });
  }

  function updateDialogue(
    panelIndex: number,
    dialogueIndex: number,
    key: "speaker" | "text",
    value: string,
  ) {
    if (!page) return;
    updatePanel(panelIndex, {
      dialogue: page.panels[panelIndex].dialogue.map((item, index) =>
        index === dialogueIndex ? { ...item, [key]: value } : item,
      ),
    });
  }

  function removeDialogue(panelIndex: number, dialogueIndex: number) {
    if (!page) return;
    updatePanel(panelIndex, {
      dialogue: page.panels[panelIndex].dialogue.filter((_, index) => index !== dialogueIndex),
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
      const rewritten = normalizeVisualPages([data.page], 1, project.mode)[0];
      updatePage({
        ...rewritten,
        id: page.id,
        pageNumber: page.pageNumber,
        role: page.role,
        panels: rewritten.panels.map((item, index) => ({
          ...item,
          imageData: page.panels[index]?.imageData,
        })),
      });
      setNotice(`Page ${page.pageNumber} was rewritten. Existing art stays until you regenerate it.`);
    } catch (caught) {
      setError(message(caught, "This page could not be rewritten."));
    } finally {
      setBusy("");
    }
  }

  async function generateImage(pageIndex: number, panelIndex?: number) {
    if (!project) return;
    const selectedPage = project.pages[pageIndex];
    const selectedPanel =
      typeof panelIndex === "number" ? selectedPage.panels[panelIndex] : undefined;
    setBusy("image");
    setBusyTarget(
      selectedPanel ? `${selectedPage.pageNumber}-${panelIndex}` : `${selectedPage.pageNumber}`,
    );
    setError("");
    try {
      const imageData = await visualImage(project, selectedPage, selectedPanel);
      setProject(current => {
        if (!current) return current;
        return {
          ...current,
          updatedAt: new Date().toISOString(),
          pages: current.pages.map((item, index) => {
            if (index !== pageIndex) return item;
            if (typeof panelIndex !== "number") return { ...item, imageData };
            return {
              ...item,
              panels: item.panels.map((panelItem, panelNumber) =>
                panelNumber === panelIndex ? { ...panelItem, imageData } : panelItem,
              ),
            };
          }),
        };
      });
    } catch (caught) {
      setError(message(caught, "This image could not be generated."));
    } finally {
      setBusy("");
      setBusyTarget("");
    }
  }

  async function generateAll() {
    if (!project) return;
    setBusy("all-images");
    setError("");
    let working = project;
    try {
      for (let pageIndex = 0; pageIndex < working.pages.length; pageIndex += 1) {
        const selectedPage = working.pages[pageIndex];
        if (working.mode === "comic") {
          for (let panelIndex = 0; panelIndex < selectedPage.panels.length; panelIndex += 1) {
            if (working.pages[pageIndex].panels[panelIndex].imageData) continue;
            setBusyTarget(`${selectedPage.pageNumber}-${panelIndex}`);
            const imageData = await visualImage(
              working,
              selectedPage,
              selectedPage.panels[panelIndex],
            );
            const panels = working.pages[pageIndex].panels.map((item, index) =>
              index === panelIndex ? { ...item, imageData } : item,
            );
            working = {
              ...working,
              updatedAt: new Date().toISOString(),
              pages: working.pages.map((item, index) =>
                index === pageIndex ? { ...item, panels } : item,
              ),
            };
            setProject(working);
          }
        } else if (!selectedPage.imageData) {
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
      setNotice("All page art is complete. Dialogue and captions remain editable.");
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
    setMode(saved.mode);
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
          <p>Five to ten designed pages with editable text, consistent art, and comic-ready panels.</p>
        </div>
        {project ? (
          <button className="visual-new-button" onClick={reset}><Plus size={16} /> New visual project</button>
        ) : null}
      </div>

      <div className="visual-mode-switch" role="tablist">
        <button className={mode === "visual" ? "selected" : ""} onClick={() => chooseMode("visual")} disabled={locked}>
          <FileImage size={18} />
          <span>Visual Mini eBook<small>Image-rich designed pages</small></span>
        </button>
        <button className={mode === "comic" ? "selected" : ""} onClick={() => chooseMode("comic")} disabled={locked}>
          <MessageCircle size={18} />
          <span>Comics & Graphic Story<small>Panels, dialogue, captions</small></span>
        </button>
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
            <legend>{mode === "comic" ? "Comic format" : "Mini book type"}</legend>
            <div className="visual-choice-grid">
              {(mode === "comic" ? COMIC_FORMATS : VISUAL_BOOK_KINDS).map(option => (
                <button
                  type="button"
                  key={option.id}
                  className={(mode === "comic" ? brief.comicFormat : brief.kind) === option.id ? "selected" : ""}
                  onClick={() =>
                    mode === "comic"
                      ? updateBrief("comicFormat", option.id as VisualBookBrief["comicFormat"])
                      : updateBrief("kind", option.id as VisualBookBrief["kind"])
                  }
                >
                  <strong>{option.label}</strong><small>{option.note}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <Field textarea label={mode === "comic" ? "Story idea and conflict" : "Story idea or core promise"} value={brief.premise} set={value => project ? updateProjectBrief("premise", value) : updateBrief("premise", value)} placeholder="What should happen, change, or help the reader?" disabled={locked} />
          <Field label="Target reader" value={brief.audience} set={value => project ? updateProjectBrief("audience", value) : updateBrief("audience", value)} placeholder="Who is this for?" disabled={locked} />

          <fieldset className="visual-inline-options" disabled={locked || Boolean(project)}>
            <legend>Total pages, including cover</legend>
            <div>
              {([5, 7, 10] as VisualPageCount[]).map(count => (
                <button type="button" key={count} className={brief.pageCount === count ? "selected" : ""} onClick={() => updateBrief("pageCount", count)}>{count}</button>
              ))}
            </div>
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

          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="visual-notice"><Check size={15} />{notice}</p> : null}

          {!project ? (
            <button className="generate-button" type="submit" disabled={locked}>
              {busy === "storyboard" ? <LoaderCircle className="spin" /> : <Sparkles />}
              {busy === "storyboard" ? "Designing every page" : "Create editable storyboard"}
            </button>
          ) : (
            <div className="visual-production-actions">
              <button className="visual-primary-action" type="button" onClick={generateAll} disabled={locked || imageProgress.complete === imageProgress.total}>
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
                    {hasArt(project.mode, item) ? <Check size={12} /> : null}
                  </button>
                ))}
              </div>

              <div className="visual-page-editor">
                <PagePreview project={project} page={page} />
                <div className="visual-page-controls">
                  <div className="visual-page-meta"><span>Page {page.pageNumber}</span><small>{page.role}</small></div>
                  <Field label="Page heading" value={page.title} set={value => updatePage({ title: value })} placeholder="Page heading" disabled={locked} />
                  <Field textarea label={project.mode === "comic" ? "Page note" : "Page copy"} value={page.body} set={value => updatePage({ body: value })} placeholder="Short page copy" disabled={locked} />

                  {project.mode === "visual" ? (
                    <>
                      <Field textarea label="Art direction" value={page.imagePrompt} set={value => updatePage({ imagePrompt: value })} placeholder="Visible scene only" disabled={locked} />
                      <button className="panel-image-button" type="button" onClick={() => generateImage(activePage)} disabled={locked}>
                        {busy === "image" && busyTarget === String(page.pageNumber) ? <LoaderCircle className="spin" /> : <ImageIcon />}
                        {page.imageData ? "Regenerate page art" : "Generate page art"}
                      </button>
                    </>
                  ) : (
                    <div className="comic-panel-editors">
                      <div className="comic-panel-count-control">
                        <span>{page.panels.length} panel{page.panels.length === 1 ? "" : "s"}</span>
                        {page.panels.length < 4 ? <button type="button" onClick={addPanel}><Plus size={13} /> Add panel</button> : null}
                      </div>
                      {page.panels.map((panel, panelIndex) => (
                        <section key={panel.id}>
                          <header>
                            <strong>Panel {panelIndex + 1}</strong>
                            <div>
                              {page.panels.length > 1 ? <button className="comic-remove-panel" type="button" onClick={() => removePanel(panelIndex)}><Trash2 size={14} /></button> : null}
                              <button type="button" onClick={() => generateImage(activePage, panelIndex)} disabled={locked}>
                                {busy === "image" && busyTarget === `${page.pageNumber}-${panelIndex}` ? <LoaderCircle className="spin" /> : <ImageIcon />}
                                {panel.imageData ? "Regenerate art" : "Generate art"}
                              </button>
                            </div>
                          </header>
                          <Field textarea label="Visible scene" value={panel.scene} set={value => updatePanel(panelIndex, { scene: value })} placeholder="Characters, action, setting" disabled={locked} />
                          <Field label="Camera" value={panel.camera} set={value => updatePanel(panelIndex, { camera: value })} placeholder="Close-up, wide..." disabled={locked} />
                          <Field label="Narration caption" value={panel.caption} set={value => updatePanel(panelIndex, { caption: value })} placeholder="Optional narration" disabled={locked} />
                          <Field label="Sound effect" value={panel.soundEffect} set={value => updatePanel(panelIndex, { soundEffect: value })} placeholder="Optional: THUD!" disabled={locked} />
                          <div className="dialogue-editor">
                            <div>
                              <span>Speech bubbles</span>
                              {panel.dialogue.length < 3 ? <button type="button" onClick={() => addDialogue(panelIndex)}><Plus size={13} /> Add</button> : null}
                            </div>
                            {panel.dialogue.map((dialogue, dialogueIndex) => (
                              <div className="dialogue-row" key={dialogueIndex}>
                                <input value={dialogue.speaker} onChange={event => updateDialogue(panelIndex, dialogueIndex, "speaker", event.target.value)} placeholder="Speaker" />
                                <textarea rows={2} value={dialogue.text} onChange={event => updateDialogue(panelIndex, dialogueIndex, "text", event.target.value)} placeholder="Short dialogue" />
                                <button type="button" onClick={() => removeDialogue(panelIndex, dialogueIndex)}><Trash2 size={14} /></button>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}

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
                  <span>{saved.mode === "comic" ? "Comic" : "Visual Mini"}</span>
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
  if (project.mode === "comic") {
    return (
      <div className={`visual-page-canvas comic-preview panels-${Math.min(4, Math.max(1, page.panels.length))}`}>
        {page.panels.map(panel => (
          <div className="comic-preview-panel" key={panel.id} style={panel.imageData ? { backgroundImage: `url(${panel.imageData})` } : undefined}>
            {!panel.imageData ? <span><ImageIcon /> Art pending</span> : null}
            <div className="comic-bubbles">
              {panel.dialogue.map((dialogue, index) => <p key={index}><b>{dialogue.speaker}</b>{dialogue.text}</p>)}
            </div>
            {panel.caption ? <small className="comic-caption">{panel.caption}</small> : null}
            {panel.soundEffect ? <strong className="comic-sfx">{panel.soundEffect}</strong> : null}
          </div>
        ))}
        {page.role === "cover" ? <div className="comic-cover-copy"><h2>{project.title}</h2><p>{project.subtitle}</p><small>{project.author}</small></div> : null}
      </div>
    );
  }

  return (
    <div className={`visual-page-canvas visual-layout-${page.layout}${page.role === "cover" ? " visual-cover-preview" : ""}`}>
      <div className="visual-preview-image" style={page.imageData ? { backgroundImage: `url(${page.imageData})` } : undefined}>
        {!page.imageData ? <span><ImageIcon /> Art pending</span> : null}
      </div>
      <div className="visual-preview-copy">
        {page.role === "cover" ? (
          <><h2>{project.title}</h2><p>{project.subtitle}</p><small>{project.author}</small></>
        ) : (
          <><em>{project.title}</em><h2>{page.title}</h2><p>{page.body}</p><small>{page.pageNumber}</small></>
        )}
      </div>
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

async function visualImage(project: VisualBookProject, page: VisualBookPage, panel?: ComicPanel) {
  const data = await api("/api/visual-image", { project: projectBrief(project), page, panel });
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
    comicFormat: project.comicFormat,
    premise: project.premise,
    audience: project.audience,
    pageCount: project.pageCount,
    visualStyle: project.visualStyle,
    characterBible: project.characterBible,
    palette: project.palette,
  };
}

function hasArt(mode: VisualProjectMode, page: VisualBookPage) {
  return mode === "comic"
    ? page.panels.length > 0 && page.panels.every(panel => panel.imageData)
    : Boolean(page.imageData);
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
