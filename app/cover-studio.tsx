"use client";

import { Check, ImageIcon, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AuthorStyle, CoverDesign, Manuscript } from "./book-types";
import {
  CREATIVE_COVER_FINISH_OPTIONS,
  formatPremiumCoverAuthor,
  getCreativeCoverFinishPreset,
  stripCoverPlaceholderText,
} from "./creative-direction";
import {
  TITLE_PLACEMENT_OPTIONS,
  TITLE_TYPOGRAPHY_OPTIONS,
  contrastingTextStroke,
  getCoverTitlePlacementPreset,
  getCoverTypographyPreset,
  resolveCoverAuthorY,
  resolveExactCoverSubtitle,
  resolveExactCoverTitle,
  resolveCoverTitlePlacement,
  resolveCoverTitleTop,
  resolveCoverTitleTypography,
  resolveNonCollidingCoverTextY,
  wrapBalancedCoverTitle,
} from "./cover-utils";

const authorStyles: Array<{ id: AuthorStyle; label: string }> = [
  { id: "uppercase", label: "Uppercase" },
  { id: "signature", label: "Signature" },
  { id: "typewriter", label: "Typewriter" },
];

const styles = [
  { id: "cinematic", label: "Cinematic" },
  { id: "minimalist", label: "Minimalist" },
  { id: "illustrated", label: "Illustrated" },
  { id: "photoreal-title", label: "Real Person" },
  { id: "minimal-real-title", label: "Minimal Object" },
  { id: "fully-loaded-title", label: "Fully Loaded" },
  { id: "eb-signature", label: "EB Signature" },
];

const finishes = [
  { id: "matte", label: "Matte" },
  { id: "satin", label: "Satin" },
  { id: "glossy-premium", label: "Glossy Premium" },
];

function formattedCoverAuthor(
  manuscript: Manuscript,
  subtitle: string,
  creativeFinish: string,
  authorStyle: AuthorStyle,
) {
  if (authorStyle !== "uppercase") return stripCoverPlaceholderText(manuscript.author);
  return formatPremiumCoverAuthor(manuscript.author, creativeFinish, {
    mode: manuscript.mode,
    title: manuscript.title,
    subtitle,
    genre: manuscript.brief.genre,
    topic: manuscript.brief.topic,
    premise: manuscript.brief.premise,
    audience: manuscript.brief.audience,
    keyPoints: manuscript.brief.keyPoints,
  });
}

function resolveTitleDirections(
  manuscript: Manuscript,
  subtitle: string,
  creativeFinish: string,
  style: string,
  titleTypography: string,
  titlePlacement: string,
) {
  const creativeContext = {
    mode: manuscript.mode,
    title: manuscript.title,
    subtitle,
    genre: manuscript.brief.genre,
    topic: manuscript.brief.topic,
    premise: manuscript.brief.premise,
    audience: manuscript.brief.audience,
    keyPoints: manuscript.brief.keyPoints,
  };
  const resolvedCreativeFinish = getCreativeCoverFinishPreset(
    creativeFinish,
    creativeContext,
  ).id;
  const directionContext = {
    ...creativeContext,
    creativeFinish: resolvedCreativeFinish,
    style,
  };
  return {
    typographyPreset: resolveCoverTitleTypography(
      titleTypography,
      directionContext,
    ),
    placementPreset: resolveCoverTitlePlacement(
      titlePlacement,
      directionContext,
    ),
  };
}

export default function CoverStudio({
  manuscript,
  onSave,
  onSaveAuthor,
}: {
  manuscript: Manuscript;
  onSave: (cover: CoverDesign) => void;
  onSaveAuthor?: (author: string) => void;
}) {
  const initialStyle = manuscript.cover?.style ?? "cinematic";
  const [style, setStyle] = useState(initialStyle);
  const [finish, setFinish] = useState(manuscript.cover?.finish ?? "satin");
  const [creativeFinish, setCreativeFinish] = useState(
    manuscript.cover?.creativeFinish ?? "auto",
  );
  const [titleTypography, setTitleTypography] = useState(
    manuscript.cover?.titleTypography ?? "auto",
  );
  const [titlePlacement, setTitlePlacement] = useState(
    manuscript.cover?.titlePlacement ?? "auto",
  );
  const [customDirection, setCustomDirection] = useState("");
  const [authorStyle, setAuthorStyle] = useState<AuthorStyle>(
    manuscript.cover?.authorStyle ?? "uppercase",
  );
  const coverTitle = resolveExactCoverTitle(manuscript, manuscript.title);
  const [coverSubtitle, setCoverSubtitle] = useState(
    resolveExactCoverSubtitle(manuscript),
  );
  const [authorName, setAuthorName] = useState(manuscript.author);
  const [autoFitText, setAutoFitText] = useState(
    manuscript.cover?.autoFitText ?? true,
  );
  const [subtitleFontSize, setSubtitleFontSize] = useState(
    manuscript.cover?.subtitleFontSize ?? 40,
  );
  const [subtitlePosition, setSubtitlePosition] = useState(
    manuscript.cover?.subtitlePosition ?? 25,
  );
  const [subtitleAlignment, setSubtitleAlignment] = useState<"left" | "center" | "right">(
    manuscript.cover?.subtitleAlignment ?? "center",
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
  const onSaveRef = useRef(onSave);
  const manuscriptRef = useRef(manuscript);
  const coverRef = useRef(manuscript.cover);
  const skippedInitialAutoApply = useRef(true);
  const autoApplySequence = useRef(0);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    manuscriptRef.current = manuscript;
    coverRef.current = manuscript.cover;
  }, [manuscript]);

  useEffect(() => {
    if (!skippedInitialAutoApply.current) {
      skippedInitialAutoApply.current = true;
      return;
    }
    const currentCover = coverRef.current;
    if (!currentCover?.sourceImageData || loading) return;
    const sequence = ++autoApplySequence.current;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setApplying(true);
        setError("");
        try {
          const currentManuscript = manuscriptRef.current;
          const exactTitle = resolveExactCoverTitle(currentManuscript, coverTitle);
          const directions = resolveTitleDirections(
            currentManuscript,
            coverSubtitle.trim(),
            creativeFinish,
            style,
            titleTypography,
            titlePlacement,
          );
          const imageData = await composeCover(
            currentCover.sourceImageData ?? "",
            exactTitle,
            coverSubtitle.trim(),
            formattedCoverAuthor(
              currentManuscript,
              coverSubtitle.trim(),
              creativeFinish,
              authorStyle,
            ),
            finish,
            style,
            autoFitText,
            subtitleFontSize,
            subtitlePosition,
            subtitleAlignment,
            subtitleColor,
            authorColor,
            authorStyle,
            directions.typographyPreset,
            directions.placementPreset,
          );
          if (sequence !== autoApplySequence.current) return;
          onSaveRef.current({
            ...currentCover,
            imageData,
            width: 1600,
            height: 2560,
            sourceImageData: currentCover.sourceImageData,
            style,
            finish,
            creativeFinish,
            displayTitle: exactTitle,
            displaySubtitle: coverSubtitle.trim(),
            showTitle: true,
            autoFitText,
            subtitleFontSize,
            subtitlePosition,
            subtitleAlignment,
            subtitleColor,
            authorColor,
            authorStyle,
            typographyPreset: directions.typographyPreset,
            titleTypography,
            titlePlacement,
            createdAt: currentCover.createdAt ?? new Date().toISOString(),
          });
        } catch (applyError) {
          if (sequence !== autoApplySequence.current) return;
          setError(
            applyError instanceof Error
              ? applyError.message
              : "The cover preview could not be updated.",
          );
        } finally {
          if (sequence === autoApplySequence.current) setApplying(false);
        }
      })();
    }, 280);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    authorColor,
    authorStyle,
    autoFitText,
    coverSubtitle,
    coverTitle,
    creativeFinish,
    finish,
    loading,
    manuscript.author,
    manuscript.brief.title,
    manuscript.title,
    style,
    subtitleAlignment,
    subtitleColor,
    subtitleFontSize,
    subtitlePosition,
    titlePlacement,
    titleTypography,
  ]);

  async function generateCover() {
    const exactTitle = resolveExactCoverTitle(manuscript, coverTitle);
    const exactSubtitle = coverSubtitle.trim();
    if (!exactTitle) {
      setError("Add a complete book title before generating.");
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
          subtitle: exactSubtitle,
          author: stripCoverPlaceholderText(manuscript.author),
          style,
          finish,
          creativeFinish,
          titleTypography,
          titlePlacement,
          customDirection: customDirection.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.imageData) {
        throw new Error(String(data.error ?? "The AI cover could not be generated."));
      }
      const sourceImageData = String(data.imageData);
      const directions = resolveTitleDirections(
        manuscript,
        exactSubtitle,
        creativeFinish,
        style,
        titleTypography,
        titlePlacement,
      );
      const typography = getCoverTypographyPreset(directions.typographyPreset);
      const nextSubtitleAlignment = typography.titleAlignment;
      const nextSubtitleColor = typography.subtitleColor;
      const nextAuthorColor = typography.authorColor;
      const imageData = await composeCover(
        sourceImageData,
        exactTitle,
        exactSubtitle,
        formattedCoverAuthor(
          manuscript,
          exactSubtitle,
          creativeFinish,
          authorStyle,
        ),
        finish,
        style,
        autoFitText,
        subtitleFontSize,
        subtitlePosition,
        nextSubtitleAlignment,
        nextSubtitleColor,
        nextAuthorColor,
        authorStyle,
        directions.typographyPreset,
        directions.placementPreset,
      );
      setSubtitleAlignment(nextSubtitleAlignment);
      setSubtitleColor(nextSubtitleColor);
      setAuthorColor(nextAuthorColor);
      onSave({
        imageData,
        width: 1600,
        height: 2560,
        sourceImageData,
        style,
        finish,
        creativeFinish,
        displayTitle: exactTitle,
        displaySubtitle: exactSubtitle,
        showTitle: true,
        autoFitText,
        subtitleFontSize,
        subtitlePosition,
        subtitleAlignment: nextSubtitleAlignment,
        subtitleColor: nextSubtitleColor,
        authorColor: nextAuthorColor,
        authorStyle,
        typographyPreset: directions.typographyPreset,
        titleTypography,
        titlePlacement,
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
      setError("Add a complete book title before applying typography.");
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
      const directions = resolveTitleDirections(
        manuscript,
        coverSubtitle.trim(),
        creativeFinish,
        style,
        titleTypography,
        titlePlacement,
      );
      const imageData = await composeCover(
        sourceImageData,
        exactTitle,
        coverSubtitle.trim(),
        formattedCoverAuthor(
          manuscript,
          coverSubtitle.trim(),
          creativeFinish,
          authorStyle,
        ),
        finish,
        style,
        autoFitText,
        subtitleFontSize,
        subtitlePosition,
        subtitleAlignment,
        subtitleColor,
        authorColor,
        authorStyle,
        directions.typographyPreset,
        directions.placementPreset,
      );
      onSave({
        ...manuscript.cover,
        imageData,
        width: 1600,
        height: 2560,
        sourceImageData,
        style,
        finish,
        creativeFinish,
        displayTitle: exactTitle,
        displaySubtitle: coverSubtitle.trim(),
        showTitle: true,
        autoFitText,
        subtitleFontSize,
        subtitlePosition,
        subtitleAlignment,
        subtitleColor,
        authorColor,
        authorStyle,
        typographyPreset: directions.typographyPreset,
        titleTypography,
        titlePlacement,
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
          <p>AI creates text-free artwork. EB Studio Pro adds your exact title, subtitle, and author separately.</p>
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
              <span>Cover subtitle <small>Optional</small></span>
              <textarea
                value={coverSubtitle}
                onChange={(event) => setCoverSubtitle(event.target.value)}
                disabled={loading}
                rows={3}
              />
            </label>
            <details className="cover-advanced-settings">
              <summary>
                <span>Subtitle & author</span>
                <strong>Editable text</strong>
              </summary>
              <div className="cover-type-controls">
              <label>
                <span>Author name <small>Shown on the cover, title page, and ebook file</small></span>
                <input
                  type="text"
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  onBlur={() => {
                    const next = authorName.trim();
                    if (!next) {
                      setAuthorName(manuscript.author);
                      return;
                    }
                    if (next !== manuscript.author) onSaveAuthor?.(next);
                  }}
                  disabled={loading}
                />
              </label>
              <label className="cover-auto-fit">
                <input
                  type="checkbox"
                  checked={autoFitText}
                  onChange={(event) => setAutoFitText(event.target.checked)}
                  disabled={loading}
                />
                <span>Auto Fit subtitle</span>
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
                <select
                  className="cover-alignment-select"
                  value={subtitleAlignment}
                  onChange={(event) =>
                    setSubtitleAlignment(
                      event.target.value as "left" | "center" | "right",
                    )
                  }
                  disabled={loading}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
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
              <div className="author-style-row">
                <span>Author style</span>
                <div className="author-style-options" role="group" aria-label="Author style">
                  {authorStyles.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={authorStyle === option.id ? "selected" : ""}
                      onClick={() => setAuthorStyle(option.id)}
                      disabled={loading}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
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
            </details>
            <p>
              {applying
                ? "Updating the cover preview…"
                : autoFitText
                  ? "Subtitle and author changes update the cover automatically."
                  : "Manual subtitle sizing updates automatically."}
            </p>
          </div>
          <label className="cover-select-control">
            <span>Visual direction</span>
            <select
              value={style}
              onChange={(event) => {
                const nextStyle = event.target.value;
                setStyle(nextStyle);
                if (nextStyle === "eb-signature") {
                  setSubtitleColor("#e8d5b8");
                } else {
                  setSubtitleColor("#fffdf7");
                }
              }}
              disabled={loading}
            >
              {styles.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p>
            AI creates the selected artwork direction without text. Cover Studio adds the exact title separately.
          </p>
          <label className="cover-select-control cover-direction-label">
            <span>Describe your cover (optional)</span>
            <textarea
              className="cover-direction-input"
              value={customDirection}
              onChange={(event) => setCustomDirection(event.target.value)}
              placeholder="Example: window with curtains and warm golden light, empty windowsill, no rings, no hearts, no people"
              rows={3}
              disabled={loading}
            />
          </label>
          <small className="cover-direction-note">
            {customDirection.trim()
              ? "Your description takes priority over the visual direction preset."
              : "Leave blank to let AI choose the scene. Say what you want and what to avoid."}
          </small>
          <label className="cover-select-control cover-finish-label">
            <span>Cover finish</span>
            <select
              value={finish}
              onChange={(event) => setFinish(event.target.value)}
              disabled={loading}
            >
              {finishes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <small className="cover-finish-note">
            {finish === "glossy-premium"
              ? "Polished depth, richer blacks, and controlled metallic highlights."
              : finish === "matte"
                ? "Soft, restrained color with a refined editorial finish."
                : "Balanced color depth with a subtle premium sheen."}
          </small>
          <label className="cover-select-control cover-finish-label">
            <span>Creative Cover Finish</span>
            <select
              value={creativeFinish}
              onChange={(event) => setCreativeFinish(event.target.value)}
              disabled={loading}
            >
              {CREATIVE_COVER_FINISH_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <small className="cover-finish-note">
            Controls the market and design direction, such as Rain-Soaked Gothic or Premium Nonfiction. Auto chooses from your book context.
          </small>
          <label className="cover-select-control cover-finish-label">
            <span>Title Typography</span>
            <select
              value={titleTypography}
              onChange={(event) => setTitleTypography(event.target.value)}
              disabled={loading}
            >
              {TITLE_TYPOGRAPHY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <small className="cover-finish-note">
            Controls the title’s book-cover lettering style, such as Stormglass Serif or Editorial Luxe.
          </small>
          <label className="cover-select-control cover-finish-label">
            <span>Title Placement</span>
            <select
              value={titlePlacement}
              onChange={(event) => setTitlePlacement(event.target.value)}
              disabled={loading}
            >
              {TITLE_PLACEMENT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <small className="cover-finish-note">
            Controls where the title sits on the cover, such as Top, Center, Lower Third, or Split Title.
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
  subtitleFontSize: number,
  subtitlePosition: number,
  subtitleAlignment: "left" | "center" | "right",
  subtitleColor: string,
  authorColor: string,
  authorStyle: AuthorStyle = "uppercase",
  typographyPresetId?: string,
  titlePlacementId?: string,
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

  context.textBaseline = "top";
  context.shadowColor = isEbSignature
    ? "rgba(6,20,16,.72)"
    : "rgba(0,0,0,.55)";
  context.shadowBlur = 24;
  context.shadowOffsetY = 6;

  let y = 0;
  let subtitleTop = 0;
  let subtitleBottom = 0;
  const titleBands: Array<{ top: number; bottom: number }> = [];

  const safeTitle = stripCoverPlaceholderText(title);
  if (safeTitle) {
    const typography = getCoverTypographyPreset(typographyPresetId);
    const placement = getCoverTitlePlacementPreset(titlePlacementId);
    const titleText = typography.uppercase ? safeTitle.toUpperCase() : safeTitle;
    const titleFont = (size: number) =>
      `${typography.fontWeight} ${size}px ${typography.fontFamily}`;
    context.letterSpacing = `${typography.letterSpacing}px`;
    const fittedTitle = fitText(
      context,
      titleText,
      typography.maxWidth,
      typography.maxLines,
      typography.titleSize,
      safeTitle.length > 54
        ? Math.min(typography.minSize, 44)
        : typography.minSize,
      titleFont,
      (value, width) => wrapBalancedCoverTitle(
        context,
        value,
        width,
        typography.maxLines,
      ),
    );
    context.font = titleFont(fittedTitle.size);
    context.textAlign = typography.titleAlignment;
    context.strokeStyle = contrastingTextStroke(typography.titleColor);
    context.lineWidth = Math.max(2, fittedTitle.size * 0.045);
    context.shadowColor = typography.shadowColor ?? "rgba(0,0,0,.72)";
    context.shadowBlur = typography.shadowBlur ?? 18;
    context.shadowOffsetY = typography.shadowOffsetY ?? 5;
    const titleX = alignmentX(typography.titleAlignment, canvas.width);
    const titleLineHeight = fittedTitle.size * typography.lineHeight;
    const titleLines = fittedTitle.lines;
    const splitIndex = placement.split && titleLines.length > 1
      ? Math.ceil(titleLines.length / 2)
      : titleLines.length;
    const titleGroups = placement.split && titleLines.length > 1
      ? [titleLines.slice(0, splitIndex), titleLines.slice(splitIndex)]
      : [titleLines];
    const drawTitleGroup = (lines: string[], top: number, framed: boolean) => {
      const height = lines.length * titleLineHeight;
      if (framed) {
        const panelX = canvas.width * 0.065;
        const panelY = top - 42;
        const panelWidth = canvas.width * 0.87;
        const panelHeight = height + 84;
        context.save();
        context.shadowColor = "rgba(0,0,0,0)";
        context.fillStyle = "rgba(7, 13, 14, .58)";
        context.strokeStyle = "rgba(230, 204, 150, .64)";
        context.lineWidth = 3;
        context.fillRect(panelX, panelY, panelWidth, panelHeight);
        context.strokeRect(panelX + 10, panelY + 10, panelWidth - 20, panelHeight - 20);
        context.restore();
      }
      const titleFill = typography.titleGradient
        ? context.createLinearGradient(0, top, 0, top + height)
        : typography.titleColor;
      if (typography.titleGradient && titleFill instanceof CanvasGradient) {
        titleFill.addColorStop(0, typography.titleGradient[0]);
        titleFill.addColorStop(0.52, typography.titleGradient[1]);
        titleFill.addColorStop(1, typography.titleGradient[2]);
      }
      context.fillStyle = titleFill;
      y = top;
      for (const line of lines) {
        context.strokeText(line, titleX, y);
        context.fillText(line, titleX, y);
        y += titleLineHeight;
      }
      titleBands.push({ top, bottom: top + height });
    };
    const firstGroupHeight = titleGroups[0].length * titleLineHeight;
    const firstTop = resolveCoverTitleTop(
      canvas.height,
      firstGroupHeight,
      placement,
    );
    drawTitleGroup(titleGroups[0], firstTop, placement.frame);
    if (titleGroups.length > 1) {
      const secondGroupHeight = titleGroups[1].length * titleLineHeight;
      const secondTop = resolveNonCollidingCoverTextY(
        canvas.height * 0.61,
        secondGroupHeight,
        canvas.height,
        titleBands,
      );
      drawTitleGroup(titleGroups[1], secondTop, false);
    }
    if (typography.rule) {
      const finalBand = titleBands[titleBands.length - 1];
      context.fillStyle = "#0f5d3b";
      context.fillRect(canvas.width * 0.39, finalBand.bottom + 18, canvas.width * 0.22, 5);
      finalBand.bottom += 31;
    }
  }

  const safeSubtitle = stripCoverPlaceholderText(subtitle);
  if (safeSubtitle) {
    context.letterSpacing = "0px";
    context.textAlign = subtitleAlignment;
    context.fillStyle = subtitleColor;
    const fittedSubtitle = fitText(
      context,
      safeSubtitle,
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
    const subtitleHeight = fittedSubtitle.lines.length * subtitleLineHeight;
    const preferredSubtitleY = subtitlePosition >= 70
      ? (canvas.height * subtitlePosition) / 100 - subtitleHeight
      : (canvas.height * subtitlePosition) / 100;
    y = resolveNonCollidingCoverTextY(
      preferredSubtitleY,
      subtitleHeight,
      canvas.height,
      titleBands,
    );
    subtitleTop = y;
    for (const line of fittedSubtitle.lines) {
      context.strokeText(line, subtitleX, y);
      context.fillText(line, subtitleX, y);
      y += fittedSubtitle.size * 1.3;
    }
    subtitleBottom = y;
  }

  const safeAuthor = stripCoverPlaceholderText(author);
  if (safeAuthor) {
    context.textAlign = "center";
    context.fillStyle = authorColor;
    const signature = authorStyle === "signature";
    const typewriter = authorStyle === "typewriter";
    const premiumSpaced = /\s{3}/.test(safeAuthor);
    const authorText = signature ? safeAuthor : safeAuthor.toUpperCase();
    let authorFontSize = signature ? 76 : typewriter ? 44 : premiumSpaced ? 44 : 48;
    const authorFont = (size: number) =>
      signature
        ? `400 ${size}px "Great Vibes", "Brush Script MT", cursive`
        : typewriter
          ? `700 ${size}px "Courier Prime", "Courier New", Courier, monospace`
          : `700 ${size}px "Montserrat", Arial, sans-serif`;
    context.font = authorFont(authorFontSize);
    context.letterSpacing = signature || premiumSpaced ? "0px" : typewriter ? "7px" : "3px";
    while (context.measureText(authorText).width > 1160 && authorFontSize > 30) {
      authorFontSize -= 2;
      context.font = authorFont(authorFontSize);
    }
    context.lineWidth = signature ? 2 : 3;
    context.strokeStyle = contrastingTextStroke(authorColor);
    const authorY = resolveCoverAuthorY(
      canvas.height,
      [
        ...titleBands,
        { top: subtitleTop, bottom: subtitleBottom },
      ],
      signature
        ? { heightRatio: 0.038, defaultRatio: 0.912 }
        : {},
    );
    context.strokeText(authorText, canvas.width / 2, authorY);
    context.fillText(authorText, canvas.width / 2, authorY);
  }
  return canvas.toDataURL("image/jpeg", 0.92);
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
