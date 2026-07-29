"use client";

import { Check, ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import type { CoverDesign, Manuscript } from "./book-types";

const styles = [
  { id: "cinematic", label: "Cinematic" },
  { id: "minimalist", label: "Minimalist" },
  { id: "illustrated", label: "Illustrated" },
  { id: "eb-signature", label: "EB Signature" },
];

const finishes = [
  { id: "matte", label: "Matte" },
  { id: "satin", label: "Satin" },
  { id: "glossy-premium", label: "Glossy Premium" },
];

export default function CoverStudio({
  manuscript,
  onSave,
}: {
  manuscript: Manuscript;
  onSave: (cover: CoverDesign) => void;
}) {
  const [style, setStyle] = useState(manuscript.cover?.style ?? "cinematic");
  const [finish, setFinish] = useState(manuscript.cover?.finish ?? "satin");
  const [coverTitle, setCoverTitle] = useState(
    manuscript.cover?.displayTitle ?? manuscript.title,
  );
  const [coverSubtitle, setCoverSubtitle] = useState(
    manuscript.cover?.displaySubtitle ?? manuscript.subtitle,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generateCover() {
    if (!coverTitle.trim()) {
      setError("Add a complete cover title before generating.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: manuscript.mode,
          brief: { ...manuscript.brief, title: coverTitle.trim() },
          subtitle: coverSubtitle.trim(),
          style,
          finish,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.imageData) {
        throw new Error(String(data.error ?? "The AI cover could not be generated."));
      }
      const imageData = await composeCover(
        String(data.imageData),
        coverTitle.trim(),
        coverSubtitle.trim(),
        manuscript.author,
        finish,
      );
      onSave({
        imageData,
        style,
        finish,
        displayTitle: coverTitle.trim(),
        displaySubtitle: coverSubtitle.trim(),
        createdAt: new Date().toISOString(),
      });
    } catch (coverError) {
      setError(
        coverError instanceof Error
          ? coverError.message
          : "The AI cover could not be generated.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="cover-studio" aria-label="AI Book Cover Studio">
      <div className="cover-studio-heading">
        <div>
          <span><Sparkles size={15} /> AI Book Cover Studio</span>
          <h3>Give your finished book a cover.</h3>
          <p>AI creates original artwork. EB Studio Pro adds clean, editable book typography.</p>
        </div>
        {manuscript.cover ? <small><Check size={14} /> Cover selected</small> : null}
      </div>

      <div className="cover-studio-grid">
        <div className="cover-preview">
          {manuscript.cover ? (
            <img src={manuscript.cover.imageData} alt={`Cover for ${manuscript.title}`} />
          ) : (
            <div className="cover-placeholder">
              <ImageIcon size={32} />
              <strong>{manuscript.title}</strong>
              <span>{manuscript.author}</span>
            </div>
          )}
        </div>

        <div className="cover-controls">
          <div className="cover-wording">
            <label>
              <span>Cover title</span>
              <textarea
                value={coverTitle}
                onChange={(event) => setCoverTitle(event.target.value)}
                disabled={loading}
                rows={2}
              />
            </label>
            <label>
              <span>Cover subtitle <small>Optional</small></span>
              <textarea
                value={coverSubtitle}
                onChange={(event) => setCoverSubtitle(event.target.value)}
                disabled={loading}
                rows={3}
              />
            </label>
            <p>The complete wording automatically resizes to fit—no silent truncation.</p>
          </div>
          <span>Choose a visual direction</span>
          <div className="cover-style-options">
            {styles.map((option) => (
              <button
                type="button"
                key={option.id}
                className={style === option.id ? "selected" : ""}
                onClick={() => setStyle(option.id)}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p>
            {style === "eb-signature"
              ? "AI connects the artwork to your book concept using EB Studio Pro’s forest, navy, copper, parchment, and charcoal palette."
              : "The title, subtitle, and author are placed separately for sharper export quality."}
          </p>
          <span className="cover-finish-label">Choose a cover finish</span>
          <div className="cover-finish-options">
            {finishes.map((option) => (
              <button
                type="button"
                key={option.id}
                className={finish === option.id ? "selected" : ""}
                onClick={() => setFinish(option.id)}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>
          <small className="cover-finish-note">
            {finish === "glossy-premium"
              ? "Polished depth, richer blacks, and controlled metallic highlights."
              : finish === "matte"
                ? "Soft, restrained color with a refined editorial finish."
                : "Balanced color depth with a subtle premium sheen."}
          </small>
          <button
            className="cover-generate-button"
            type="button"
            onClick={generateCover}
            disabled={loading}
          >
            {loading ? <LoaderCircle className="spin" size={17} /> : manuscript.cover ? <RefreshCw size={17} /> : <Sparkles size={17} />}
            {loading ? "Designing cover…" : manuscript.cover ? "Generate another cover" : "Generate AI cover"}
          </button>
          {error ? <p className="cover-error" role="alert">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

async function composeCover(
  artworkData: string,
  title: string,
  subtitle: string,
  author: string,
  finish: string,
) {
  const image = await loadImage(artworkData);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the cover.");

  context.save();
  context.filter =
    finish === "glossy-premium"
      ? "contrast(1.12) saturate(1.1)"
      : finish === "matte"
        ? "contrast(0.97) saturate(0.94)"
        : "contrast(1.04) saturate(1.03)";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.restore();

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(10,14,12,.62)");
  gradient.addColorStop(0.34, "rgba(10,14,12,.04)");
  gradient.addColorStop(0.7, "rgba(10,14,12,.08)");
  gradient.addColorStop(1, "rgba(10,14,12,.72)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (finish === "glossy-premium") {
    const sheen = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    sheen.addColorStop(0, "rgba(255,255,255,.03)");
    sheen.addColorStop(0.3, "rgba(255,255,255,.015)");
    sheen.addColorStop(0.43, "rgba(255,248,228,.13)");
    sheen.addColorStop(0.5, "rgba(255,255,255,.055)");
    sheen.addColorStop(0.62, "rgba(255,255,255,0)");
    sheen.addColorStop(1, "rgba(255,255,255,.025)");
    context.fillStyle = sheen;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const highlight = context.createRadialGradient(980, 210, 20, 980, 210, 520);
    highlight.addColorStop(0, "rgba(255,245,214,.16)");
    highlight.addColorStop(0.45, "rgba(255,255,255,.045)");
    highlight.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = highlight;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = "#fffdf7";
  context.shadowColor = "rgba(0,0,0,.55)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 6;

  const titleStartSize = title.length > 55 ? 82 : title.length > 32 ? 96 : 112;
  const fittedTitle = fitText(
    context,
    title,
    980,
    4,
    titleStartSize,
    62,
    (size) => `700 ${size}px Georgia, serif`,
  );
  context.font = `700 ${fittedTitle.size}px Georgia, serif`;
  let y = 125;
  for (const line of fittedTitle.lines) {
    context.fillText(line, canvas.width / 2, y);
    y += fittedTitle.size * 1.04;
  }

  if (subtitle) {
    y += 28;
    const fittedSubtitle = fitText(
      context,
      subtitle,
      900,
      4,
      42,
      28,
      (size) => `italic ${size}px Georgia, serif`,
    );
    context.font = `italic ${fittedSubtitle.size}px Georgia, serif`;
    for (const line of fittedSubtitle.lines) {
      context.fillText(line, canvas.width / 2, y);
      y += fittedSubtitle.size * 1.3;
    }
  }

  context.font = "700 38px Arial, sans-serif";
  context.letterSpacing = "3px";
  context.fillText(author.toUpperCase(), canvas.width / 2, 1660);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The generated artwork could not be loaded."));
    image.src = source;
  });
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
  font: (size: number) => string,
) {
  for (let size = startSize; size >= minSize; size -= 2) {
    context.font = font(size);
    const lines = wrapText(context, text, maxWidth);
    if (lines.length <= maxLines) return { lines, size };
  }
  context.font = font(minSize);
  return { lines: wrapText(context, text, maxWidth), size: minSize };
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
