"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Manuscript, SectionContent, SectionPlan } from "../book-types";
import { exportBundle, exportDocx, exportEpub, exportPdf } from "../exporters";

type Mode = "fiction" | "nonfiction";
type Provider = "openai" | "anthropic";
type Brief = {
  title: string; author: string; mode: Mode; topic: string; audience: string;
  pointA: string; pointB: string; tone: string; language: string; chapterCount: number;
  genre: string; characters: string; premise: string;
};
type Chapter = { id: string; number: number; title: string; objective: string; subsections: string[]; keyTakeaway: string };
type Blueprint = {
  title: string; subtitle: string; promise: string; readerAvatar: string; bigIdea: string;
  corePhilosophy: string; transformation: string; introduction: string; chapters: Chapter[];
  conclusion: string; bonusChapters: string[]; appendixIdeas: string[];
};
type WrittenSection = { title: string; content: string; summary: string; kind: "introduction" | "chapter" | "conclusion"; number?: number; purpose: string };
type SavedProject = { projectId?: string; createdAt?: string; brief: Brief; blueprint: Blueprint | null; approved: boolean; sections: WrittenSection[]; provider: Provider | null };

const STORAGE_KEY = "ebstudio-blueprint-project-v1";
const initialBrief: Brief = {
  title: "", author: "Sulong", mode: "nonfiction", topic: "", audience: "",
  pointA: "", pointB: "", tone: "Clear, encouraging, professional", language: "English",
  chapterCount: 8, genre: "", characters: "", premise: "",
};

export default function BlueprintStudio() {
  const projectId = useRef("");
  const projectCreatedAt = useRef("");
  const [brief, setBrief] = useState(initialBrief);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [approved, setApproved] = useState(false);
  const [sections, setSections] = useState<WrittenSection[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [busy, setBusy] = useState<"" | "blueprint" | "writing" | "exporting">("");
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    projectId.current = crypto.randomUUID();
    projectCreatedAt.current = new Date().toISOString();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const project = JSON.parse(saved) as SavedProject;
        projectId.current = project.projectId ?? projectId.current;
        projectCreatedAt.current = project.createdAt ?? projectCreatedAt.current;
        setBrief(project.brief ?? initialBrief);
        setBlueprint(project.blueprint ?? null);
        setApproved(Boolean(project.approved));
        setSections(project.sections ?? []);
        setProvider(project.provider ?? null);
        setSavedNotice("Your saved Blueprint project was restored.");
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const project: SavedProject = { projectId: projectId.current, createdAt: projectCreatedAt.current, brief, blueprint, approved, sections, provider };
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      if (blueprint) setSavedNotice("Autosaved in this browser.");
    }, 350);
    return () => window.clearTimeout(timer);
  }, [ready, brief, blueprint, approved, sections, provider]);

  const plan = useMemo(() => blueprint ? buildPlan(blueprint) : [], [blueprint]);
  const manuscript = useMemo(() => ready && blueprint && sections.length ? buildManuscript(projectId.current, projectCreatedAt.current, brief, blueprint, plan, sections, provider) : null, [ready, brief, blueprint, plan, sections, provider]);
  const set = (key: keyof Brief, value: string | number) => setBrief((b) => ({ ...b, [key]: value }));

  async function generateBlueprint() {
    setBusy("blueprint"); setError(""); setApproved(false); setSections([]);
    try {
      const response = await fetch("/api/blueprint", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", brief }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Blueprint generation failed.");
      setBlueprint(normalizeBlueprint(data.blueprint)); setProvider(data.provider);
    } catch (e) { setError(e instanceof Error ? e.message : "Blueprint generation failed."); }
    finally { setBusy(""); }
  }

  function updateBlueprint(patch: Partial<Blueprint>) {
    setBlueprint((current) => current ? { ...current, ...patch } : current);
    setApproved(false);
  }

  function updateChapter(index: number, patch: Partial<Chapter>) {
    setBlueprint((current) => current ? {
      ...current,
      chapters: renumber(current.chapters.map((chapter, i) => i === index ? { ...chapter, ...patch } : chapter)),
    } : current);
    setApproved(false);
  }

  function moveChapter(index: number, direction: -1 | 1) {
    setBlueprint((current) => {
      if (!current) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.chapters.length) return current;
      const chapters = [...current.chapters];
      [chapters[index], chapters[nextIndex]] = [chapters[nextIndex], chapters[index]];
      return { ...current, chapters: renumber(chapters) };
    });
    setApproved(false);
  }

  function addChapter() {
    setBlueprint((current) => current ? {
      ...current,
      chapters: renumber([...current.chapters, {
        id: crypto.randomUUID(), number: current.chapters.length + 1,
        title: "New Chapter", objective: "Define this chapter's purpose.",
        subsections: ["Opening idea", "Main lesson", "Practical application"],
        keyTakeaway: "State the main takeaway.",
      }]),
    } : current);
    setApproved(false);
  }

  function deleteChapter(index: number) {
    setBlueprint((current) => current ? { ...current, chapters: renumber(current.chapters.filter((_, i) => i !== index)) } : current);
    setApproved(false);
  }

  async function writeBook() {
    if (!blueprint || !approved) return;
    setBusy("writing"); setError("");
    const completed = [...sections];
    try {
      for (let index = completed.length; index < plan.length; index += 1) {
        const section = plan[index];
        const chapter = section.kind === "chapter" ? blueprint.chapters.find((item) => item.number === section.number) : undefined;
        const response = await fetch("/api/blueprint", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "write_section", brief, blueprint,
            section: { kind: section.kind, title: section.title, chapter },
            previousSummaries: completed.slice(-8).map((item) => item.summary),
            preferredProvider: provider || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Could not write ${section.title}.`);
        completed.push({ ...section, content: String(data.content), summary: String(data.summary) });
        setSections([...completed]); setProvider(data.provider);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Book writing failed. You can resume from the last completed section."); }
    finally { setBusy(""); }
  }

  async function runExport(format: "bundle" | "docx" | "pdf" | "epub") {
    if (!manuscript || sections.length !== plan.length) return;
    setBusy("exporting"); setError("");
    try {
      if (format === "bundle") await exportBundle(manuscript);
      if (format === "docx") await exportDocx(manuscript);
      if (format === "pdf") await exportPdf(manuscript);
      if (format === "epub") await exportEpub(manuscript);
    } catch (e) { setError(e instanceof Error ? e.message : `${format.toUpperCase()} export failed.`); }
    finally { setBusy(""); }
  }

  function downloadJson() {
    if (!blueprint) return;
    downloadBlob(JSON.stringify({ projectId: projectId.current, createdAt: projectCreatedAt.current, brief, blueprint, approved, sections }, null, 2), `${safeName(brief.title)}-blueprint.json`, "application/json");
  }

  function startFresh() {
    localStorage.removeItem(STORAGE_KEY);
    projectId.current = crypto.randomUUID();
    projectCreatedAt.current = new Date().toISOString();
    setBrief(initialBrief); setBlueprint(null); setApproved(false); setSections([]); setProvider(null); setError(""); setSavedNotice("");
  }

  const complete = Boolean(plan.length && sections.length === plan.length);

  return <main style={styles.page}>
    <header style={styles.header}>
      <div><p style={styles.eyebrow}>EBStudio.Pro</p><h1 style={styles.h1}>Blueprint Engine</h1>
      <p style={styles.sub}>Your first book starts here. Plan first, approve the structure, then write and export.</p></div>
      <div style={styles.actions}><a href="/" style={styles.link}>Back to Creator</a><button style={styles.secondary} onClick={startFresh}>New Project</button></div>
    </header>
    {savedNotice ? <p style={styles.notice}>{savedNotice}</p> : null}

    <section style={styles.grid}>
      <div style={styles.card}>
        <h2>1. Book Setup</h2>
        <div style={styles.two}><Field label="Title" value={brief.title} onChange={(v) => set("title", v)} /><Field label="Author" value={brief.author} onChange={(v) => set("author", v)} /></div>
        <label style={styles.label}>Book type<select style={styles.input} value={brief.mode} onChange={(e) => set("mode", e.target.value)}><option value="nonfiction">Non-Fiction</option><option value="fiction">Fiction</option></select></label>
        {brief.mode === "nonfiction" ? <>
          <Field label="Topic" value={brief.topic} onChange={(v) => set("topic", v)} />
          <Field label="Target audience" value={brief.audience} onChange={(v) => set("audience", v)} />
          <Area label="Point A: Where is the reader now?" value={brief.pointA} onChange={(v) => set("pointA", v)} />
          <Area label="Point B: Where should the reader end?" value={brief.pointB} onChange={(v) => set("pointB", v)} />
        </> : <>
          <Field label="Genre" value={brief.genre} onChange={(v) => set("genre", v)} />
          <Area label="Main characters" value={brief.characters} onChange={(v) => set("characters", v)} />
          <Area label="Plot premise" value={brief.premise} onChange={(v) => set("premise", v)} />
        </>}
        <div style={styles.two}><Field label="Tone" value={brief.tone} onChange={(v) => set("tone", v)} /><Field label="Language" value={brief.language} onChange={(v) => set("language", v)} /></div>
        <label style={styles.label}>Chapters<input style={styles.input} type="number" min={3} max={20} value={brief.chapterCount} onChange={(e) => set("chapterCount", Math.min(20, Math.max(3, Number(e.target.value))))} /></label>
        <button style={styles.primary} disabled={busy !== "" || !brief.title || !brief.author} onClick={generateBlueprint}>{busy === "blueprint" ? "Building blueprint..." : blueprint ? "Regenerate Blueprint" : "Generate Blueprint"}</button>
        {error ? <p style={styles.error}>{error}</p> : null}
      </div>

      <div style={styles.card}>
        <h2>2. Review and Approve</h2>
        {!blueprint ? <p style={styles.muted}>Your editable blueprint will appear here.</p> : <>
          <Field label="Subtitle" value={blueprint.subtitle} onChange={(v) => updateBlueprint({ subtitle: v })} />
          <Area label="Book promise" value={blueprint.promise} onChange={(v) => updateBlueprint({ promise: v })} />
          <Area label="Reader transformation" value={blueprint.transformation} onChange={(v) => updateBlueprint({ transformation: v })} />
          {blueprint.chapters.map((chapter, index) => <article key={chapter.id} style={styles.chapter}>
            <div style={styles.chapterHead}><strong>Chapter {chapter.number}</strong><div style={styles.miniActions}>
              <button style={styles.mini} disabled={index === 0} onClick={() => moveChapter(index, -1)}>Up</button>
              <button style={styles.mini} disabled={index === blueprint.chapters.length - 1} onClick={() => moveChapter(index, 1)}>Down</button>
              <button style={styles.danger} disabled={blueprint.chapters.length <= 3} onClick={() => deleteChapter(index)}>Delete</button>
            </div></div>
            <Field label="Title" value={chapter.title} onChange={(v) => updateChapter(index, { title: v })} />
            <Area label="Objective" value={chapter.objective} onChange={(v) => updateChapter(index, { objective: v })} />
            <Area label="Subsections, one per line" value={chapter.subsections.join("\n")} onChange={(v) => updateChapter(index, { subsections: v.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            <Area label="Key takeaway" value={chapter.keyTakeaway} onChange={(v) => updateChapter(index, { keyTakeaway: v })} />
          </article>)}
          {blueprint.chapters.length < 20 ? <button style={styles.secondary} onClick={addChapter}>Add Chapter</button> : null}
          <div style={styles.actions}>
            <button style={approved ? styles.approved : styles.primary} onClick={() => setApproved(true)}>{approved ? "Blueprint Approved" : "Approve Blueprint"}</button>
            <button style={styles.secondary} onClick={downloadJson}>Download Blueprint JSON</button>
          </div>
        </>}
      </div>
    </section>

    {blueprint ? <section style={styles.card}>
      <h2>3. Write and Export</h2>
      <p style={styles.muted}>{complete ? "Your manuscript is complete and ready to export." : approved ? `${sections.length} of ${plan.length} sections completed. Progress is autosaved.` : "Writing remains locked until the blueprint is approved."}</p>
      <div style={styles.actions}>
        <button style={styles.primary} disabled={!approved || busy !== "" || complete} onClick={writeBook}>{busy === "writing" ? `Writing section ${sections.length + 1} of ${plan.length}...` : sections.length ? "Resume Writing" : "Write Entire Book"}</button>
        {complete ? <>
          <button style={styles.secondary} disabled={busy !== ""} onClick={() => runExport("pdf")}>Export PDF</button>
          <button style={styles.secondary} disabled={busy !== ""} onClick={() => runExport("docx")}>Export DOCX</button>
          <button style={styles.secondary} disabled={busy !== ""} onClick={() => runExport("epub")}>Export EPUB</button>
          <button style={styles.secondary} disabled={busy !== ""} onClick={() => runExport("bundle")}>Export Complete Package</button>
        </> : null}
      </div>
      {sections.length ? <div style={{ marginTop: 24 }}>{sections.map((section) => <article key={section.title} style={styles.output}><h3>{section.title}</h3><p style={{ whiteSpace: "pre-wrap" }}>{section.content}</p></article>)}</div> : null}
    </section> : null}
  </main>;
}

function buildPlan(blueprint: Blueprint): SectionPlan[] {
  return [
    { kind: "introduction", title: "Introduction", purpose: blueprint.introduction || blueprint.promise },
    ...blueprint.chapters.map((chapter) => ({ kind: "chapter" as const, number: chapter.number, title: `Chapter ${chapter.number}: ${chapter.title}`, purpose: chapter.objective })),
    { kind: "conclusion", title: "Conclusion", purpose: blueprint.conclusion || blueprint.transformation },
  ];
}

function buildManuscript(projectId: string, createdAt: string, brief: Brief, blueprint: Blueprint, plan: SectionPlan[], sections: WrittenSection[], provider: Provider | null): Manuscript {
  const completeSections: SectionContent[] = sections.map((section) => ({ kind: section.kind, number: section.number, title: section.title, purpose: section.purpose, content: section.content, summary: section.summary }));
  return {
    id: projectId, mode: brief.mode, title: brief.title, subtitle: blueprint.subtitle,
    author: brief.author, createdAt,
    brief: {
      title: brief.title, author: brief.author, genre: brief.genre, characters: brief.characters,
      premise: brief.premise, topic: brief.topic, audience: brief.audience,
      keyPoints: brief.mode === "nonfiction" ? `${brief.pointA}\n${brief.pointB}\n${blueprint.promise}` : blueprint.bigIdea,
      chapterCount: blueprint.chapters.length,
    },
    plan, sections: completeSections, providersUsed: provider ? [provider] : undefined,
  };
}

function normalizeBlueprint(value: Blueprint): Blueprint { return { ...value, chapters: renumber((value.chapters ?? []).map((chapter) => ({ ...chapter, id: chapter.id || crypto.randomUUID() }))) }; }
function renumber(chapters: Chapter[]) { return chapters.map((chapter, index) => ({ ...chapter, number: index + 1 })); }
function safeName(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "book"; }
function downloadBlob(content: string, filename: string, type: string) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label style={styles.label}>{label}<input style={styles.input} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label style={styles.label}>{label}<textarea style={{ ...styles.input, minHeight: 88, resize: "vertical" }} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1500, margin: "0 auto", padding: "32px 20px 80px", color: "#eaf5ef", background: "#07110d", minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap" },
  eyebrow: { color: "#62d49a", fontWeight: 800, margin: 0 }, h1: { fontSize: "clamp(2rem,5vw,4rem)", margin: "4px 0" }, sub: { color: "#a8bbb0", maxWidth: 700 },
  link: { color: "#8ce9b9", textDecoration: "none", border: "1px solid #2d5b45", padding: "10px 14px", borderRadius: 10 },
  notice: { color: "#9ce7bc", background: "#10271b", border: "1px solid #285b3f", padding: "10px 14px", borderRadius: 10 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 20, marginBottom: 20 },
  card: { background: "#0d1b15", border: "1px solid #214331", borderRadius: 18, padding: 22, boxShadow: "0 18px 50px rgba(0,0,0,.25)", marginBottom: 20 },
  two: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }, label: { display: "grid", gap: 7, fontSize: 13, fontWeight: 700, marginBottom: 13 },
  input: { width: "100%", boxSizing: "border-box", background: "#07110d", color: "#f4fff8", border: "1px solid #315c47", borderRadius: 10, padding: "11px 12px", font: "inherit" },
  primary: { background: "#31c77d", color: "#04130b", border: 0, borderRadius: 10, padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
  approved: { background: "#153d2b", color: "#93efbf", border: "1px solid #3a8d62", borderRadius: 10, padding: "12px 16px", fontWeight: 900 },
  secondary: { background: "transparent", color: "#b8d9c5", border: "1px solid #315c47", borderRadius: 10, padding: "12px 16px", fontWeight: 800, cursor: "pointer" },
  actions: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }, chapter: { borderTop: "1px solid #214331", paddingTop: 18, marginTop: 18 },
  chapterHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }, miniActions: { display: "flex", gap: 6, flexWrap: "wrap" },
  mini: { background: "#13271e", color: "#b8d9c5", border: "1px solid #315c47", borderRadius: 8, padding: "6px 9px", cursor: "pointer" }, danger: { background: "#32191b", color: "#ffb2b2", border: "1px solid #713338", borderRadius: 8, padding: "6px 9px", cursor: "pointer" },
  muted: { color: "#93a89b" }, error: { color: "#ff9f9f", fontWeight: 700 }, output: { borderTop: "1px solid #214331", paddingTop: 18, lineHeight: 1.75 },
};