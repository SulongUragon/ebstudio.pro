"use client";

import { Check, ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import type { CoverDesign, Manuscript } from "./book-types";

const styles = [
  { id: "cinematic", label: "Cinematic" },
  { id: "minimalist", label: "Minimalist" },
  { id: "illustrated", label: "Illustrated" },
];

export default function CoverStudio({
  manuscript,
  onSave,
}: {
  manuscript: Manuscript;
  onSave: (cover: CoverDesign) => void;
}) {
  const [style, setStyle] = useState(manuscript.cover?.style ?? "cinematic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generateCover() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: manuscript.mode,
          brief: manuscript.brief,
          subtitle: manuscript.subtitle,
          style,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.imageData) {
        throw new Error(String(data.error ?? "The AI cover could not be generated."));
      }
      const imageData = await composeCover(
        String(data.imageData),
        manuscript.title,
        manuscript.subtitle,
        manuscript.author,
      );
      onSave({ imageData, style, createdAt: new Date().toISOString() });
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
          <p>The title, subtitle, and author are placed separately for sharper export quality.</p>
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
) {
  const image = await loadImage(artworkData);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the cover.");

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(10,14,12,.62)");
  gradient.addColorStop(0.34, "rgba(10,14,12,.04)");
  gradient.addColorStop(0.7, "rgba(10,14,12,.08)");
  gradient.addColorStop(1, "rgba(10,14,12,.72)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = "#fffdf7";
  context.shadowColor = "rgba(0,0,0,.55)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 6;

  const titleSize = title.length > 55 ? 82 : title.length > 32 ? 96 : 112;
  context.font = `700 ${titleSize}px Georgia, serif`;
  const titleLines = wrapText(context, title, 980, 3);
  let y = 135;
  for (const line of titleLines) {
    context.fillText(line, canvas.width / 2, y);
    y += titleSize * 1.04;
  }

  if (subtitle) {
    y += 34;
    context.font = "italic 42px Georgia, serif";
    for (const line of wrapText(context, subtitle, 900, 3)) {
      context.fillText(line, canvas.width / 2, y);
      y += 54;
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

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}
