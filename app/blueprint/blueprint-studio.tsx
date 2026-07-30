"use client";

import { useState } from "react";

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
type WrittenSection = { title: string; content: string; summary: string };

const initialBrief: Brief = {
  title: "", author: "Sulong", mode: "nonfiction", topic: "", audience: "",
  pointA: "", pointB: "", tone: "Clear, encouraging, professional", language: "English",
  chapterCount: 8, genre: "", characters: "", premise: "",
};

export default function BlueprintStudio() {
  const [brief, setBrief] = useState(initialBrief);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [approved, setApproved] = useState(false);
  const [sections, setSections] = useState<WrittenSection[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [busy, setBusy] = useState<"" | "blueprint" | "writing">("");
  const [error, setError] = useState("");

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
      setBlueprint(data.blueprint); setProvider(data.provider);
    } catch (e) { setError(e instanceof Error ? e.message : "Blueprint generation failed."); }
    finally { setBusy(""); }
  }

  function updateChapter(index: number, patch: Partial<Chapter>) {
    setBlueprint((current) => current ? {
      ...current,
      chapters: current.chapters.map((chapter, i) => i === index ? { ...chapter, ...patch } : chapter),
    } : current);
    setApproved(false);
  }

  async function writeBook() {
    if (!blueprint || !approved) return;
    setBusy("writing"); setError(""); setSections([]);
    const plan = [
      { kind: "introduction" as const, title: "Introduction" },
      ...blueprint.chapters.map((chapter) => ({ kind: "chapter" as const, title: `Chapter ${chapter.number}: ${chapter.title}`, chapter })),
      { kind: "conclusion" as const, title: "Conclusion" },
    ];
    const completed: WrittenSection[] = [];
    try {
      for (const section of plan) {
        const response = await fetch("/api/blueprint", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "write_section", brief, blueprint, section,
            previousSummaries: completed.slice(-8).map((item) => item.summary),
            preferredProvider: provider || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Could not write ${section.title}.`);
        completed.push({ title: section.title, content: data.content, summary: data.summary });
        setSections([...completed]); setProvider(data.provider);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Book writing failed."); }
    finally { setBusy(""); }
  }

  function downloadJson() {
    if (!blueprint) return;
    const blob = new Blob([JSON.stringify({ brief, blueprint, approved, sections }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${brief.title || "book"}-blueprint.json`; anchor.click();
    URL.revokeObjectURL(url);
  }

  return <main style={styles.page}>
    <header style={styles.header}>
      <div><p style={styles.eyebrow}>EBStudio.Pro</p><h1 style={styles.h1}>Blueprint Engine MVP</h1>
      <p style={styles.sub}>Your first book starts here. Plan first, approve the structure, then write.</p></div>
      <a href="/" style={styles.link}>Back to Creator</a>
    </header>

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
        <button style={styles.primary} disabled={busy !== "" || !brief.title || !brief.author} onClick={generateBlueprint}>{busy === "blueprint" ? "Building blueprint..." : "Generate Blueprint"}</button>
        {error ? <p style={styles.error}>{error}</p> : null}
      </div>

      <div style={styles.card}>
        <h2>2. Review and Approve</h2>
        {!blueprint ? <p style={styles.muted}>Your editable blueprint will appear here.</p> : <>
          <Field label="Subtitle" value={blueprint.subtitle} onChange={(v) => { setBlueprint({ ...blueprint, subtitle: v }); setApproved(false); }} />
          <Area label="Book promise" value={blueprint.promise} onChange={(v) => { setBlueprint({ ...blueprint, promise: v }); setApproved(false); }} />
          <Area label="Reader transformation" value={blueprint.transformation} onChange={(v) => { setBlueprint({ ...blueprint, transformation: v }); setApproved(false); }} />
          {blueprint.chapters.map((chapter, index) => <article key={chapter.id} style={styles.chapter}>
            <strong>Chapter {chapter.number}</strong>
            <Field label="Title" value={chapter.title} onChange={(v) => updateChapter(index, { title: v })} />
            <Area label="Objective" value={chapter.objective} onChange={(v) => updateChapter(index, { objective: v })} />
            <Area label="Subsections, one per line" value={chapter.subsections.join("\n")} onChange={(v) => updateChapter(index, { subsections: v.split("\n").map((x) => x.trim()).filter(Boolean) })} />
            <Area label="Key takeaway" value={chapter.keyTakeaway} onChange={(v) => updateChapter(index, { keyTakeaway: v })} />
          </article>)}
          <div style={styles.actions}>
            <button style={approved ? styles.approved : styles.primary} onClick={() => setApproved(true)}>{approved ? "Blueprint Approved" : "Approve Blueprint"}</button>
            <button style={styles.secondary} onClick={downloadJson}>Download Blueprint JSON</button>
          </div>
        </>}
      </div>
    </section>

    {blueprint ? <section style={styles.card}>
      <h2>3. Write the Book</h2>
      <p style={styles.muted}>Writing remains locked until the blueprint is approved.</p>
      <button style={styles.primary} disabled={!approved || busy !== ""} onClick={writeBook}>{busy === "writing" ? `Writing section ${sections.length + 1}...` : "Write Entire Book"}</button>
      {sections.length ? <div style={{ marginTop: 24 }}>{sections.map((section) => <article key={section.title} style={styles.output}><h3>{section.title}</h3><p style={{ whiteSpace: "pre-wrap" }}>{section.content}</p></article>)}</div> : null}
    </section> : null}
  </main>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label style={styles.label}>{label}<input style={styles.input} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label style={styles.label}>{label}<textarea style={{ ...styles.input, minHeight: 88, resize: "vertical" }} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1500, margin: "0 auto", padding: "32px 20px 80px", color: "#eaf5ef", background: "#07110d", minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", marginBottom: 28 },
  eyebrow: { color: "#62d49a", fontWeight: 800, margin: 0 }, h1: { fontSize: "clamp(2rem,5vw,4rem)", margin: "4px 0" }, sub: { color: "#a8bbb0", maxWidth: 700 },
  link: { color: "#8ce9b9", textDecoration: "none", border: "1px solid #2d5b45", padding: "10px 14px", borderRadius: 10 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 20, marginBottom: 20 },
  card: { background: "#0d1b15", border: "1px solid #214331", borderRadius: 18, padding: 22, boxShadow: "0 18px 50px rgba(0,0,0,.25)" },
  two: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 },
  label: { display: "grid", gap: 7, fontSize: 13, fontWeight: 700, marginBottom: 13 },
  input: { width: "100%", boxSizing: "border-box", background: "#07110d", color: "#f4fff8", border: "1px solid #315c47", borderRadius: 10, padding: "11px 12px", font: "inherit" },
  primary: { background: "#31c77d", color: "#04130b", border: 0, borderRadius: 10, padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
  approved: { background: "#153d2b", color: "#93efbf", border: "1px solid #3a8d62", borderRadius: 10, padding: "12px 16px", fontWeight: 900 },
  secondary: { background: "transparent", color: "#b8d9c5", border: "1px solid #315c47", borderRadius: 10, padding: "12px 16px", fontWeight: 800, cursor: "pointer" },
  actions: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }, chapter: { borderTop: "1px solid #214331", paddingTop: 18, marginTop: 18 },
  muted: { color: "#93a89b" }, error: { color: "#ff9f9f", fontWeight: 700 }, output: { borderTop: "1px solid #214331", paddingTop: 18, lineHeight: 1.75 },
};
