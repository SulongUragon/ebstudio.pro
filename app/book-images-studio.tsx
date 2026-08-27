"use client";

import { Check, ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { BookImage, Manuscript } from "./book-types";

const IMAGE_REQUEST_TIMEOUT_MS = 180_000;

export default function BookImagesStudio({ manuscript, onSave }: { manuscript: Manuscript; onSave: (images: BookImage[]) => void }) {
  const [open, setOpen] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const images = manuscript.images ?? [];
  const imageBySection = useMemo(() => new Map(images.map((image) => [image.sectionIndex, image])), [images]);
  const illustrated = manuscript.plan.filter((_, index) => imageBySection.has(index)).length;

  async function generate(sectionIndex: number) {
    const section = manuscript.sections[sectionIndex];
    const plan = manuscript.plan[sectionIndex];
    if (!section || !plan) return;
    setLoadingIndex(sectionIndex);
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), IMAGE_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/book-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          manuscript: {
            mode: manuscript.mode,
            title: manuscript.title,
            genre: manuscript.brief.genre,
            premise: manuscript.brief.premise,
            characters: manuscript.brief.characters,
            topic: manuscript.brief.topic,
          },
          section: {
            title: plan.title,
            purpose: plan.purpose,
            summary: section.summary,
            content: section.content.slice(0, 7000),
            openerDeck: plan.openerDeck,
            openerImagePrompt: plan.openerImagePrompt,
            openerVisualMood: plan.openerVisualMood,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.imageData) throw new Error(String(data.error ?? "Book image could not be generated."));
      const next: BookImage = {
        id: imageBySection.get(sectionIndex)?.id ?? crypto.randomUUID(),
        sectionIndex,
        sectionTitle: plan.title,
        imageData: String(data.imageData),
        prompt: String(data.prompt ?? ""),
        createdAt: new Date().toISOString(),
      };
      await Promise.resolve(onSave([...images.filter((image) => image.sectionIndex !== sectionIndex), next].sort((a, b) => a.sectionIndex - b.sectionIndex)));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setError(`Image ${sectionIndex + 1} timed out after 3 minutes. Your existing images are safe. Retry this section when ready.`);
      } else {
        setError(caught instanceof Error ? caught.message : "Book image could not be generated.");
      }
    } finally {
      window.clearTimeout(timeout);
      setLoadingIndex(null);
    }
  }

  return (
    <section className="book-images-studio">
      <button type="button" className="book-images-toggle" onClick={() => setOpen((value) => !value)}>
        <ImageIcon size={17} />
        <span><strong>Book Images</strong><small>{illustrated} of {manuscript.plan.length} sections illustrated</small></span>
        <b>{open ? "Close" : "Open"}</b>
      </button>
      {open ? (
        <div className="book-images-panel">
          <div className="book-images-heading">
            <div><span>Long-form illustration studio</span><h3>{manuscript.title}</h3><p>Generate only the scenes that deserve artwork. Every approved image stays attached to this saved book.</p></div>
            <div className="book-images-progress"><Sparkles size={16} /><strong>{illustrated}</strong><span>illustrated</span></div>
          </div>
          {error ? <p className="book-images-error">{error}</p> : null}
          <div className="book-images-grid">
            {manuscript.plan.map((section, index) => {
              const image = imageBySection.get(index);
              return (
                <article className="book-image-card" key={`${section.kind}-${index}`}>
                  <div className="book-image-preview">{image ? <img src={image.imageData} alt={`Illustration for ${section.title}`} /> : <ImageIcon size={30} />}</div>
                  <div className="book-image-copy"><small>{index + 1}</small><strong>{section.title}</strong><span>{image ? <><Check size={13} /> Saved with book</> : "No illustration yet"}</span></div>
                  <button type="button" onClick={() => generate(index)} disabled={loadingIndex !== null}>
                    {loadingIndex === index ? <LoaderCircle className="spin" size={14} /> : image ? <RefreshCw size={14} /> : <Sparkles size={14} />}
                    {loadingIndex === index ? "Generating" : image ? "Regenerate" : "Generate image"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
