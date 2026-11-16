"use client";

import { ImageIcon, LoaderCircle, RotateCcw, Trash2, Users } from "lucide-react";
import { useState } from "react";
import type { AIProvider } from "./book-types";
import { CHARACTER_REF_SIDE, mergeCast, normalizeCast, type CharacterRef } from "./character-refs";
import type { VisualBookBrief, VisualBookPage } from "./visual-book-types";

type Props = {
  brief: VisualBookBrief;
  pages: VisualBookPage[];
  refs: CharacterRef[];
  onChange: (refs: CharacterRef[]) => void;
  provider: AIProvider;
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
};

/**
 * Draws each recurring character once. Every later page or panel that names a
 * character sends that drawing to the image model so the character stays the
 * same from page to page.
 */
export default function CharacterRefsPanel({ brief, pages, refs, onChange, provider, disabled, onBusyChange }: Props) {
  const [busy, setBusy] = useState<"" | "cast" | string>("");
  const [error, setError] = useState("");
  const locked = disabled || Boolean(busy);
  const drawn = refs.filter((ref) => ref.imageData).length;

  function start(value: string) {
    setBusy(value);
    setError("");
    onBusyChange?.(true);
  }

  function finish() {
    setBusy("");
    onBusyChange?.(false);
  }

  async function draw(ref: CharacterRef) {
    const data = await post("/api/visual-image", { project: brief, character: { name: ref.name, description: ref.description } });
    const imageData = String(data.imageData ?? "");
    if (!imageData) throw new Error("The image generator returned no usable picture.");
    return shrinkReference(imageData);
  }

  async function buildCast() {
    start("cast");
    let working = refs;
    try {
      const data = await post("/api/generate", {
        action: "visual_cast",
        provider,
        mode: "fiction",
        brief: { title: brief.title },
        visualProject: { ...brief, pages: pages.map(withoutArt) },
      });
      working = mergeCast(refs, normalizeCast(data.characters));
      if (!working.length) {
        setError("No recurring characters were found. Add them to the character lock above, then try again.");
        return;
      }
      onChange(working);
      for (const ref of working) {
        if (ref.imageData) continue;
        setBusy(ref.id);
        const imageData = await draw(ref);
        working = working.map((item) => (item.id === ref.id ? { ...item, imageData } : item));
        onChange(working);
      }
    } catch (caught) {
      onChange(working);
      setError(caught instanceof Error ? caught.message : "The character references could not be made.");
    } finally {
      finish();
    }
  }

  async function redraw(ref: CharacterRef) {
    start(ref.id);
    try {
      const imageData = await draw(ref);
      onChange(refs.map((item) => (item.id === ref.id ? { ...item, imageData } : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This character could not be drawn.");
    } finally {
      finish();
    }
  }

  return (
    <section className="character-refs" aria-label="Character references">
      <div className="character-refs-head">
        <span><Users size={15} /> Character references</span>
        <small>
          Each character is drawn once. Every page or panel that names a character then copies that drawing, so the
          cast stays the same through the book.
        </small>
      </div>

      {refs.length ? (
        <ul className="character-refs-list">
          {refs.map((ref) => (
            <li key={ref.id}>
              <div className="character-ref-art">
                {ref.imageData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ref.imageData} alt={`Reference drawing of ${ref.name}`} />
                ) : busy === ref.id ? (
                  <LoaderCircle className="spin" size={20} aria-label="Drawing" />
                ) : (
                  <ImageIcon size={20} aria-hidden="true" />
                )}
              </div>
              <div className="character-ref-copy">
                <strong>{ref.name}</strong>
                <label>
                  <span className="sr-only">Description of {ref.name}</span>
                  <textarea
                    rows={3}
                    value={ref.description}
                    onChange={(event) =>
                      onChange(refs.map((item) => (item.id === ref.id ? { ...item, description: event.target.value } : item)))
                    }
                    disabled={locked}
                  />
                </label>
                <div className="character-ref-actions">
                  <button type="button" onClick={() => redraw(ref)} disabled={locked || !ref.description.trim()}>
                    {busy === ref.id ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />}
                    {ref.imageData ? "Redraw" : "Draw"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${ref.name}`}
                    onClick={() => onChange(refs.filter((item) => item.id !== ref.id))}
                    disabled={locked}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <button className="character-refs-build" type="button" onClick={buildCast} disabled={locked}>
        {busy === "cast" ? <LoaderCircle className="spin" size={16} /> : <Users size={16} />}
        {busy ? "Drawing the cast" : refs.length ? "Find characters again" : "Draw character references"}
      </button>
      {drawn ? (
        <p className="character-refs-note">
          {drawn} of {refs.length} drawn. New art uses them at once. Art made earlier keeps its old look until you redraw it.
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}

function withoutArt(page: VisualBookPage): VisualBookPage {
  return { ...page, imageData: undefined, panels: page.panels.map((panel) => ({ ...panel, imageData: undefined })) };
}

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error ?? "The generator could not be reached. Your project is safe."));
  return data;
}

/** Reference pictures must stay under 512 px, and small files keep the saved project light. */
export async function shrinkReference(imageData: string, side = CHARACTER_REF_SIDE) {
  const image = new Image();
  image.decoding = "async";
  image.src = imageData;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the reference picture.");
  // Center-crop to a square so the character stays in the middle.
  const crop = Math.min(image.naturalWidth, image.naturalHeight);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, side, side);
  context.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, 0, 0, side, side);
  return canvas.toDataURL("image/jpeg", 0.86);
}
