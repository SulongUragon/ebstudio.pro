"use client";

import { Check, ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import type { CoverDesign, Manuscript } from "./book-types";

const styles = [
  { id: "cinematic", label: "Cinematic" },
  { id: "minimalist", label: "Minimalist" },
  { id: "illustrated", label: "Illustrated" },
  { id: "photoreal-title", label: "Real Person + AI Title" },
  { id: "minimal-real-title", label: "Minimal Real Object + AI Title" },
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
  const [autoFitText, setAutoFitText] = useState(
    manuscript.cover?.autoFitText ?? true,
  );
  const [titleFontSize, setTitleFontSize] = useState(
    manuscript.cover?.titleFontSize ?? 96,
  );
  const [subtitleFontSize, setSubtitleFontSize] = useState(
    manuscript.cover?.subtitleFontSize ?? 40,
  );
  const [titlePosition, setTitlePosition] = useState(
    manuscript.cover?.titlePosition ?? 7,
  );
  const [subtitlePosition, setSubtitlePosition] = useState(
    manuscript.cover?.subtitlePosition ?? 25,
  );
  const [titleAlignment, setTitleAlignment] = useState<"left" | "center" | "right">(
    manuscript.cover?.titleAlignment ?? "center",
  );
  const [subtitleAlignment, setSubtitleAlignment] = useState<"left" | "center" | "right">(
    manuscript.cover?.subtitleAlignment ?? "center",
  );
  const [titleColor, setTitleColor] = useState(
    manuscript.cover?.titleColor ??
      (manuscript.cover?.style === "eb-signature" ? "#f1e3cf" : "#fffdf7"),
  );
  const [subtitleColor, setSubtitleColor] = useState(
    manuscript.cover?.subtitleColor ??
      (manuscript.cover?.style === "eb-signature" ? "#e8d5b8" : "#fffdf7"),
  );
  const [authorColor, setAuthorColor] = useState(
    manuscript.cover?.authorColor ?? "#e9dfcf",
  );
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const aiTitleMode =
    style === "photoreal-title" || style === "minimal-real-title";

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
      const sourceImageData = String(data.imageData);
      const imageData = aiTitleMode
        ? sourceImageData
        : await composeCover(
            sourceImageData,
            coverTitle.trim(),
            coverSubtitle.trim(),
            manuscript.author,
            finish,
            style,
            autoFitText,
            titleFontSize,
            subtitleFontSize,
            titlePosition,
            subtitlePosition,
            titleAlignment,
            subtitleAlignment,
            titleColor,
            subtitleColor,
            authorColor,
          );
      onSave({
        imageData,
        sourceImageData,
        style,
        finish,
        displayTitle: coverTitle.trim(),
        displaySubtitle: aiTitleMode ? "" : coverSubtitle.trim(),
        autoFitText,
        titleFontSize,
        subtitleFontSize,
        titlePosition,
        subtitlePosition,
        titleAlignment,
        subtitleAlignment,
        titleColor,
        subtitleColor,
        authorColor,
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

  async function applyTypography() {
    if (aiTitleMode) {
      setError("This cover already includes the AI-designed title. Choose another visual direction to use editable typography.");
      return;
    }
    const sourceImageData = manuscript.cover?.sourceImageData;
    if (!sourceImageData) {
      setError("Generate one new cover first to unlock reusable typography editing.");
      return;
    }
    setApplying(true);
    setError("");
    try {
      const imageData = await composeCover(
        sourceImageData,
        coverTitle.trim(),
        coverSubtitle.trim(),
        manuscript.author,
        finish,
        style,
        autoFitText,
        titleFontSize,
        subtitleFontSize,
        titlePosition,
        subtitlePosition,
        titleAlignment,
        subtitleAlignment,
        titleColor,
        subtitleColor,
        authorColor,
      );
      onSave({
        ...manuscript.cover,
        imageData,
        sourceImageData,
        style,
        finish,
        displayTitle: coverTitle.trim(),
        displaySubtitle: coverSubtitle.trim(),
        autoFitText,
        titleFontSize,
        subtitleFontSize,
        titlePosition,
        subtitlePosition,
        titleAlignment,
        subtitleAlignment,
        titleColor,
        subtitleColor,
        authorColor,
        createdAt: manuscript.cover?.createdAt ?? new Date().toISOString(),
      });
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "The typography layout could not be applied.",
      );
    } finally {
      setApplying(false);
    }
  }

  const previewSource =
    manuscript.cover?.sourceImageData ?? manuscript.cover?.imageData;

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
            <>
              <img src={previewSource} alt={`Cover for ${manuscript.title}`} />
              {manuscript.cover.sourceImageData && manuscript.cover.style !== "photoreal-title" &&
                manuscript.cover.style !== "minimal-real-title" ? (
                <div className="cover-live-type" aria-hidden="true">
                  <strong
                    className={`align-${titleAlignment}`}
                    style={{
                      top: `${titlePosition}%`,
                      color: titleColor,
                      fontSize: `${titleFontSize / 12}cqw`,
                    }}
                  >
                    {coverTitle}
                  </strong>
                  {coverSubtitle ? (
                    <em
                      className={`align-${subtitleAlignment} ${subtitlePosition >= 70 ? "anchor-bottom" : ""}`}
                      style={{
                        top: `${subtitlePosition}%`,
                        color: subtitleColor,
                        fontSize: `${subtitleFontSize / 12}cqw`,
                      }}
                    >
                      {coverSubtitle}
                    </em>
                  ) : null}
                  <small style={{ color: authorColor }}>
                    {manuscript.author.toUpperCase()}
                  </small>
                </div>
              ) : null}
            </>
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
                disabled={loading || aiTitleMode}
                rows={3}
              />
            </label>
            <div className="cover-type-controls">
              <label className="cover-auto-fit">
                <input
                  type="checkbox"
                  checked={autoFitText}
                  onChange={(event) => setAutoFitText(event.target.checked)}
                  disabled={loading}
                />
                <span>Auto Fit typography</span>
              </label>
              <label>
                <span>Title size <strong>{autoFitText ? "Auto" : `${titleFontSize}px`}</strong></span>
                <input
                  type="range"
                  min="62"
                  max="124"
                  step="2"
                  value={titleFontSize}
                  onChange={(event) => setTitleFontSize(Number(event.target.value))}
                  disabled={loading}
                />
              </label>
              <label>
                <span>Subtitle size <strong>{autoFitText ? "Auto" : `${subtitleFontSize}px`}</strong></span>
                <input
                  type="range"
                  min="28"
                  max="54"
                  step="2"
                  value={subtitleFontSize}
                  onChange={(event) => setSubtitleFontSize(Number(event.target.value))}
                  disabled={loading}
                />
              </label>
              <label>
                <span>Title position <strong>{titlePosition}%</strong></span>
                <input
                  type="range"
                  min="3"
                  max="38"
                  step="1"
                  value={titlePosition}
                  onChange={(event) => setTitlePosition(Number(event.target.value))}
                  disabled={loading}
                />
              </label>
              <div className="cover-layout-row">
                <span>Title alignment</span>
                <div className="cover-align-options">
                  {(["left", "center", "right"] as const).map((alignment) => (
                    <button
                      type="button"
                      key={alignment}
                      className={titleAlignment === alignment ? "selected" : ""}
                      onClick={() => setTitleAlignment(alignment)}
                      disabled={loading}
                    >
                      {alignment}
                    </button>
                  ))}
                </div>
                <label className="cover-color-control">
                  <span>Title color</span>
                  <input
                    type="color"
                    value={titleColor}
                    onChange={(event) => setTitleColor(event.target.value)}
                    disabled={loading}
                  />
                </label>
              </div>
              <label>
                <span>Subtitle position <strong>{subtitlePosition}%</strong></span>
                <input
                  type="range"
                  min="10"
                  max="95"
                  step="1"
                  value={subtitlePosition}
                  onChange={(event) => setSubtitlePosition(Number(event.target.value))}
                  disabled={loading}
                />
              </label>
              <div className="cover-layout-row">
                <span>Subtitle alignment</span>
                <div className="cover-align-options">
                  {(["left", "center", "right"] as const).map((alignment) => (
                    <button
                      type="button"
                      key={alignment}
                      className={subtitleAlignment === alignment ? "selected" : ""}
                      onClick={() => setSubtitleAlignment(alignment)}
                      disabled={loading}
                    >
                      {alignment}
                    </button>
                  ))}
                </div>
                <label className="cover-color-control">
                  <span>Subtitle color</span>
                  <input
                    type="color"
                    value={subtitleColor}
                    onChange={(event) => setSubtitleColor(event.target.value)}
                    disabled={loading}
                  />
                </label>
              </div>
              <label className="cover-author-color">
                <span>Author color</span>
                <input
                  type="color"
                  value={authorColor}
                  onChange={(event) => setAuthorColor(event.target.value)}
                  disabled={loading}
                />
                <strong>{authorColor.toUpperCase()}</strong>
              </label>
              <button
                className="cover-apply-type"
                type="button"
                onClick={applyTypography}
                disabled={loading || applying || aiTitleMode || !manuscript.cover?.sourceImageData}
              >
                {applying ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
                {applying ? "Applying typography…" : "Apply text layout"}
              </button>
            </div>
            <p>
              {aiTitleMode
                ? "AI prints the exact title into the photorealistic artwork. Subtitle, author, and extra text are excluded."
                : autoFitText
                  ? "The complete wording automatically resizes to fit—no silent truncation."
                  : "Manual sizing preserves every word. Reduce the size if the title uses too many lines."}
            </p>
          </div>
          <span>Choose a visual direction</span>
          <div className="cover-style-options">
            {styles.map((option) => (
              <button
                type="button"
                key={option.id}
                className={style === option.id ? "selected" : ""}
                onClick={() => {
                  setStyle(option.id);
                  if (option.id === "eb-signature") {
                    setTitleColor("#f1e3cf");
                    setSubtitleColor("#e8d5b8");
                  } else {
                    setTitleColor("#fffdf7");
                    setSubtitleColor("#fffdf7");
                  }
                }}
                disabled={loading}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p>
            {style === "photoreal-title"
              ? "AI creates a lifelike human cover and designs the exact title directly into the artwork—title only."
              : style === "minimal-real-title"
                ? "AI creates a minimalist still life using realistic objects connected to the book and prints the exact title—title only."
                : style === "eb-signature"
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
  style: string,
  autoFitText: boolean,
  titleFontSize: number,
  subtitleFontSize: number,
  titlePosition: number,
  subtitlePosition: number,
  titleAlignment: "left" | "center" | "right",
  subtitleAlignment: "left" | "center" | "right",
  titleColor: string,
  subtitleColor: string,
  authorColor: string,
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

  const isEbSignature = style === "eb-signature";

  context.textAlign = titleAlignment;
  context.textBaseline = "top";
  context.fillStyle = titleColor;
  context.shadowColor = isEbSignature
    ? "rgba(6,20,16,.72)"
    : "rgba(0,0,0,.55)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 6;

  const titleStartSize = titleFontSize;
  const fittedTitle = fitText(
    context,
    title,
    980,
    4,
    titleStartSize,
    autoFitText ? 62 : titleFontSize,
    (size) => `700 ${size}px Georgia, serif`,
  );
  context.font = `700 ${fittedTitle.size}px Georgia, serif`;
  const titleX = alignmentX(titleAlignment, canvas.width);
  let y = (canvas.height * titlePosition) / 100;
  for (const line of fittedTitle.lines) {
    context.fillText(line, titleX, y);
    y += fittedTitle.size * 1.04;
  }

  if (subtitle) {
    context.textAlign = subtitleAlignment;
    context.fillStyle = subtitleColor;
    const fittedSubtitle = fitText(
      context,
      subtitle,
      900,
      4,
      subtitleFontSize,
      autoFitText ? 28 : subtitleFontSize,
      (size) => `italic ${size}px Georgia, serif`,
    );
    context.font = `italic ${fittedSubtitle.size}px Georgia, serif`;
    const subtitleX = alignmentX(subtitleAlignment, canvas.width);
    const subtitleLineHeight = fittedSubtitle.size * 1.3;
    y = (canvas.height * subtitlePosition) / 100;
    if (subtitlePosition >= 70) {
      y -= fittedSubtitle.lines.length * subtitleLineHeight;
    }
    for (const line of fittedSubtitle.lines) {
      context.fillText(line, subtitleX, y);
      y += fittedSubtitle.size * 1.3;
    }
  }

  context.textAlign = "center";
  context.fillStyle = authorColor;
  context.font = "700 38px Arial, sans-serif";
  context.letterSpacing = "3px";
  context.fillText(author.toUpperCase(), canvas.width / 2, 1660);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function alignmentX(
  alignment: "left" | "center" | "right",
  width: number,
) {
  if (alignment === "left") return width * 0.09;
  if (alignment === "right") return width * 0.91;
  return width / 2;
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
