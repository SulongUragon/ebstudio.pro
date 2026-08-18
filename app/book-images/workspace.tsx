"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BookImage, Manuscript } from "../book-types";
import BookImagesStudio from "../book-images-studio";
import { loadStoredLibrary, persistStoredLibrary } from "../library-storage";
import { saveCloudProject, syncCloudProjects, type SyncState } from "../cloud-library-client";
import { exportIllustratedPdf } from "./illustrated-pdf";
import styles from "./workspace.module.css";

export default function BookImagesWorkspace() {
  const [library, setLibrary] = useState<Manuscript[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("syncing");
  const [error, setError] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadStoredLibrary()
      .then(async (saved) => {
        const synced = await syncCloudProjects("manuscript", saved);
        if (cancelled) return;
        setLibrary(synced.projects);
        setSyncState(synced.state);
        setSelectedId(synced.projects[0]?.id ?? "");
        await persistStoredLibrary(synced.projects);
      })
      .catch(() => {
        if (!cancelled) setError("Your saved long-form library could not be loaded.");
      });
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(
    () => library.find((book) => book.id === selectedId) ?? null,
    [library, selectedId],
  );

  async function saveImages(images: BookImage[]) {
    if (!selected) return;
    const updated: Manuscript = {
      ...selected,
      images,
      updatedAt: new Date().toISOString(),
    };
    const next = library.map((book) => (book.id === updated.id ? updated : book));
    setLibrary(next);
    await persistStoredLibrary(next);
    try {
      await saveCloudProject("manuscript", updated);
      setSyncState("synced");
    } catch {
      setSyncState("local-only");
    }
  }

  async function downloadIllustratedPdf() {
    if (!selected || exportingPdf) return;
    setExportingPdf(true);
    setError("");
    try {
      await exportIllustratedPdf(selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The illustrated PDF could not be created.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>EB Studio Pro</span>
          <h1>Book Images</h1>
          <p>Generate and keep long-form interior illustrations attached to the same saved manuscript.</p>
        </div>
        <Link href="/" className={styles.back}>Back to Studio</Link>
      </header>

      <section className={styles.libraryBar}>
        <label>
          <span>Choose saved book</span>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {library.map((book) => (
              <option value={book.id} key={book.id}>{book.title} — {book.author}</option>
            ))}
          </select>
        </label>
        <div className={styles.syncState}>
          {syncState === "synced" ? "☁️ Cloud synced" : syncState === "syncing" ? "↻ Syncing" : "💾 Saved on this device"}
        </div>
        <button
          type="button"
          className={styles.back}
          onClick={downloadIllustratedPdf}
          disabled={!selected || exportingPdf}
        >
          {exportingPdf ? "Building PDF…" : `Download Illustrated PDF${selected?.images?.length ? ` (${selected.images.length})` : ""}`}
        </button>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}
      {!error && !library.length ? (
        <section className={styles.empty}>
          <h2>No saved long-form books found</h2>
          <p>Create or open a long-form manuscript first, then return here.</p>
          <Link href="/">Open Long-Form Studio</Link>
        </section>
      ) : selected ? (
        <BookImagesStudio manuscript={selected} onSave={saveImages} />
      ) : null}
    </main>
  );
}
