"use client";

import { Check, ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import type { CoverDesign, Manuscript } from "./book-types";
import {
  contrastingTextStroke,
  getCoverTypographyPreset,
  resolveExactCoverTitle,
  selectCoverTypographyPreset,
  usesAutomaticTitleVariety,
} from "./cover-utils";

const styles = [
  { id: "cinematic", label: "Cinematic" },
  { id: "minimalist", label: "Minimalist" },
  { id: "illustrated", label: "Illustrated" },
  { id: "photoreal-title", label: "Real Person + Exact Title" },
  { id: "minimal-real-title", label: "Minimal Object + Exact Title" },
  { id: "fully-loaded-title", label: "Fully Loaded + Exact Title" },
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
  const [typographyPreset, setTypographyPreset] = useState(
    manuscript.cover?.typographyPreset ?? "cinematic-ivory",
  );
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  async function generateCover() {
    const exactTitle = resolveExactCoverTitle(manuscript, coverTitle);
    if (!exactTitle) {
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
          brief: { ...manuscript.brief, title: exactTitle },
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
      const shouldVaryTitleDesign = usesAutomaticTitleVariety(style);
      const selectedTypographyPreset = shouldVaryTitleDesign
        ? selectCoverTypographyPreset(style, sourceImageData)
        : typographyPreset;
      const typography = getCoverTypographyPreset(selectedTypographyPreset);
      const nextTitleFontSize = shouldVaryTitleDesign
        ? typography.titleSize
        : titleFontSize;
      const nextTitlePosition = shouldVaryTitleDesign
        ? typography.titlePosition
        : titlePosition;
      const nextTitleAlignment = shouldVaryTitleDesign
        ? typography.titleAlignment
        : titleAlignment;
      const nextSubtitleAlignment = shouldVaryTitleDesign
        ? typography.titleAlignment
        : subtitleAlignment;
      const nextTitleColor = shouldVaryTitleDesign
        ? typography.titleColor
        : titleColor;
      const nextSubtitleColor = shouldVaryTitleDesign
        ? typography.subtitleColor
        : subtitleColor;
      const nextAuthorColor = shouldVaryTitleDesign
        ? typography.authorColor
        : authorColor;
      const imageData = await composeCover(
        sourceImageData,
        exactTitle,
        coverSubtitle.trim(),
        manuscript.author,
        finish,
        style,
        selectedTypographyPreset,
        autoFitText,
        nextTitleFontSize,
        subtitleFontSize,
        nextTitlePosition,
        subtitlePosition,
        nextTitleAlignment,
        nextSubtitleAlignment,
        nextTitleColor,
        nextSubtitleColor,
        nextAuthorColor,
      );
      setTypographyPreset(selectedTypographyPreset);
      setTitleFontSize(nextTitleFontSize);
      setTitlePosition(nextTitlePosition);
      setTitleAlignment(nextTitleAlignment);
      setSubtitleAlignment(nextSubtitleAlignment);
      setTitleColor(nextTitleColor);
      setSubtitleColor(nextSubtitleColor);
      setAuthorColor(nextAuthorColor);
      onSave({
        imageData,
        width: 1600,
        height: 2560,
        sourceImageData,
        style,
        finish,
        displayTitle: exactTitle,
        displaySubtitle: coverSubtitle.trim(),
        autoFitText,
        titleFontSize: nextTitleFontSize,
        subtitleFontSize,
        titlePosition: nextTitlePosition,
        subtitlePosition,
        titleAlignment: nextTitleAlignment,
        subtitleAlignment: nextSubtitleAlignment,
        titleColor: nextTitleColor,
        subtitleColor: nextSubtitleColor,
        authorColor: nextAuthorColor,
        typographyPreset: selectedTypographyPreset,
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
    const exactTitle = resolveExactCoverTitle(manuscript, coverTitle);
    if (!exactTitle) {
      setError("Add a complete cover title before applying typography.");
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
      const selectedTypographyPreset =
        manuscript.cover?.typographyPreset ?? typographyPreset;
      const imageData = await composeCover(
        sourceImageData,
        exactTitle,
        coverSubtitle.trim(),
        manuscript.author,
        finish,
        style,
        selectedTypographyPreset,
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
      setTypographyPreset(selectedTypographyPreset);
      onSave({
        ...manuscript.cover,
        imageData,
        width: 1600,
        height: 2560,
        sourceImageData,
        style,
        finish,
        displayTitle: exactTitle,
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
        typographyPreset: selectedTypographyPreset,
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
            <img
              src={manuscript.cover.imageData}
              alt={`Final cover for ${resolveExactCoverTitle(manuscript, coverTitle)}`}
            />
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
              <div className="cover-title-design-status">
                <span>Title design</span>
                <strong>{getCoverTypographyPreset(typographyPreset).label}</strong>
                <small>+ Exact Title directions rotate this automatically on every new cover.</small>
              </div>
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
                disabled={loading || applying || !manuscript.cover?.sourceImageData}
              >
                {applying ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
                {applying ? "Applying typography…" : "Apply text layout"}
              </button>
            </div>
            <p>
              {autoFitText
                ? "EB Studio Pro places the exact title, subtitle, and author, then automatically resizes them to fit. Select Apply text layout after an edit to refresh the final cover preview."
                : "Manual sizing preserves every word. Reduce the size if the title uses too many lines, then select Apply text layout."}
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
              ? "AI creates the lifelike human artwork; EB Studio Pro always places the exact title using a varied premium design."
              : style === "minimal-real-title"
                ? "AI creates a minimalist still life; EB Studio Pro always places the exact title using a varied premium design."
                : style === "fully-loaded-title"
                  ? "AI builds the dense cinematic artwork; EB Studio Pro always places the exact title using a varied premium design."
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
  typographyPreset: string,
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
  canvas.width = 1600;
  canvas.height = 2560;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the cover.");

  context.save();
  context.filter =
    finish === "glossy-premium"
      ? "contrast(1.12) saturate(1.1)"
      : finish === "matte"
        ? "contrast(0.97) saturate(0.94)"
        : "contrast(1.04) saturate(1.03)";
  drawImageCover(context, image, canvas.width, canvas.height);
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
  const typography = getCoverTypographyPreset(typographyPreset);
  const displayTitle = typography.uppercase ? title.toUpperCase() : title;

  context.textAlign = titleAlignment;
  context.textBaseline = "top";
  context.fillStyle = titleColor;
  context.shadowColor = isEbSignature
    ? "rgba(6,20,16,.72)"
    : "rgba(0,0,0,.55)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 6;
  context.letterSpacing = `${typography.letterSpacing}px`;

  const titleStartSize = titleFontSize;
  const fittedTitle = fitText(
    context,
    displayTitle,
    typography.maxWidth,
    typography.maxLines,
    titleStartSize,
    autoFitText ? typography.minSize : titleFontSize,
    (size) => `${typography.fontWeight} ${size}px ${typography.fontFamily}`,
    (value, maxWidth) =>
      wrapCoverTitle(context, value, maxWidth, typography.id),
  );
  context.font = `${typography.fontWeight} ${fittedTitle.size}px ${typography.fontFamily}`;
  context.lineJoin = "round";
  context.lineWidth = Math.max(3, fittedTitle.size * 0.055);
  context.strokeStyle = contrastingTextStroke(titleColor);
  const titleX = alignmentX(titleAlignment, canvas.width);
  let y = (canvas.height * titlePosition) / 100;
  for (const line of fittedTitle.lines) {
    context.strokeText(line, titleX, y);
    context.fillText(line, titleX, y);
    y += fittedTitle.size * typography.lineHeight;
  }

  if (typography.rule) {
    drawTitleRule(
      context,
      titleAlignment,
      titleX,
      y + fittedTitle.size * 0.18,
      titleColor,
    );
  }
  const titleBottom = y + (typography.rule ? fittedTitle.size * 0.35 : 0);

  if (subtitle) {
    context.letterSpacing = "0px";
    context.textAlign = subtitleAlignment;
    context.fillStyle = subtitleColor;
    const fittedSubtitle = fitText(
      context,
      subtitle,
      1240,
      4,
      subtitleFontSize,
      autoFitText ? 28 : subtitleFontSize,
      (size) => `italic ${size}px Georgia, serif`,
    );
    context.font = `italic ${fittedSubtitle.size}px Georgia, serif`;
    context.lineWidth = Math.max(2, fittedSubtitle.size * 0.05);
    context.strokeStyle = contrastingTextStroke(subtitleColor);
    const subtitleX = alignmentX(subtitleAlignment, canvas.width);
    const subtitleLineHeight = fittedSubtitle.size * 1.3;
    y = (canvas.height * subtitlePosition) / 100;
    if (subtitlePosition >= 70) {
      y -= fittedSubtitle.lines.length * subtitleLineHeight;
    } else {
      y = Math.max(y, titleBottom + fittedTitle.size * 0.25);
    }
    for (const line of fittedSubtitle.lines) {
      context.strokeText(line, subtitleX, y);
      context.fillText(line, subtitleX, y);
      y += fittedSubtitle.size * 1.3;
    }
  }

  context.textAlign = "center";
  context.fillStyle = authorColor;
  context.font = "700 48px Arial, sans-serif";
  context.letterSpacing = "3px";
  context.lineWidth = 3;
  context.strokeStyle = contrastingTextStroke(authorColor);
  context.strokeText(author.toUpperCase(), canvas.width / 2, 2380);
  context.fillText(author.toUpperCase(), canvas.width / 2, 2380);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function drawTitleRule(
  context: CanvasRenderingContext2D,
  alignment: "left" | "center" | "right",
  anchorX: number,
  y: number,
  color: string,
) {
  const width = 250;
  const startX =
    alignment === "left"
      ? anchorX
      : alignment === "right"
        ? anchorX - width
        : anchorX - width / 2;
  context.save();
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.globalAlpha = 0.82;
  context.lineWidth = 3;
  context.strokeStyle = color;
  context.beginPath();
  context.moveTo(startX, y);
  context.lineTo(startX + width, y);
  context.stroke();
  context.restore();
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = targetWidth / targetHeight;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
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
  wrap: (text: string, maxWidth: number) => string[] = (value, width) =>
    wrapText(context, value, width),
) {
  for (let size = startSize; size >= minSize; size -= 2) {
    context.font = font(size);
    const lines = wrap(text, maxWidth);
    if (lines.length <= maxLines) return { lines, size };
  }
  context.font = font(minSize);
  return { lines: wrap(text, maxWidth), size: minSize };
}

function wrapCoverTitle(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  preset: string,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (
    preset === "classic-gold" &&
    words.length >= 4 &&
    words.length <= 6 &&
    /^(the|a|an)$/i.test(words[0])
  ) {
    const posterLines = [
      words[0],
      words.slice(1, -1).join(" "),
      words.at(-1) ?? "",
    ];
    if (
      posterLines.every(
        (line) => line && context.measureText(line).width <= maxWidth,
      )
    ) {
      return posterLines;
    }
  }
  return wrapText(context, text, maxWidth);
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
