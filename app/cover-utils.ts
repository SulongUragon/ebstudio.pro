import type { Manuscript } from "./book-types";

export type CoverTypographyPresetId =
  | "classic-gold"
  | "cinematic-ivory"
  | "modern-clean"
  | "dramatic-stacked"
  | "quiet-editorial";

export type CoverTypographyPreset = {
  id: CoverTypographyPresetId;
  label: string;
  fontName: string;
  fontFamily: string;
  fontWeight: number;
  uppercase: boolean;
  titleColor: string;
  subtitleColor: string;
  authorColor: string;
  titleAlignment: "left" | "center" | "right";
  titlePosition: number;
  titleSize: number;
  maxWidth: number;
  maxLines: number;
  minSize: number;
  lineHeight: number;
  letterSpacing: number;
  rule: boolean;
};

const COVER_TYPOGRAPHY_PRESETS: Record<
  CoverTypographyPresetId,
  CoverTypographyPreset
> = {
  "classic-gold": {
    id: "classic-gold",
    label: "Classic Gold",
    fontName: "Cinzel",
    fontFamily: '"Cinzel", Georgia, "Times New Roman", serif',
    fontWeight: 400,
    uppercase: true,
    titleColor: "#d7b77a",
    subtitleColor: "#eadfc8",
    authorColor: "#e8decd",
    titleAlignment: "center",
    titlePosition: 7,
    titleSize: 118,
    maxWidth: 1120,
    maxLines: 4,
    minSize: 62,
    lineHeight: 1.14,
    letterSpacing: 5,
    rule: false,
  },
  "cinematic-ivory": {
    id: "cinematic-ivory",
    label: "Cinematic Ivory",
    fontName: "Playfair Display",
    fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
    fontWeight: 700,
    uppercase: false,
    titleColor: "#fff7e8",
    subtitleColor: "#f4ead8",
    authorColor: "#e9dfcf",
    titleAlignment: "center",
    titlePosition: 6,
    titleSize: 108,
    maxWidth: 1320,
    maxLines: 4,
    minSize: 62,
    lineHeight: 1.04,
    letterSpacing: 0,
    rule: false,
  },
  "modern-clean": {
    id: "modern-clean",
    label: "Modern Clean",
    fontName: "Montserrat",
    fontFamily: '"Montserrat", Arial, Helvetica, sans-serif',
    fontWeight: 800,
    uppercase: true,
    titleColor: "#fffdf7",
    subtitleColor: "#f0eadf",
    authorColor: "#eee6d9",
    titleAlignment: "left",
    titlePosition: 8,
    titleSize: 104,
    maxWidth: 1240,
    maxLines: 4,
    minSize: 58,
    lineHeight: 1.08,
    letterSpacing: 4,
    rule: true,
  },
  "dramatic-stacked": {
    id: "dramatic-stacked",
    label: "Dramatic Stacked",
    fontName: "Bebas Neue",
    fontFamily: '"Bebas Neue", Impact, sans-serif',
    fontWeight: 400,
    uppercase: true,
    titleColor: "#f3e2bd",
    subtitleColor: "#f5ead5",
    authorColor: "#eadfcd",
    titleAlignment: "center",
    titlePosition: 5,
    titleSize: 124,
    maxWidth: 980,
    maxLines: 5,
    minSize: 58,
    lineHeight: 0.98,
    letterSpacing: 1,
    rule: false,
  },
  "quiet-editorial": {
    id: "quiet-editorial",
    label: "Quiet Editorial",
    fontName: "Cormorant Garamond",
    fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
    fontWeight: 400,
    uppercase: true,
    titleColor: "#f1e7d4",
    subtitleColor: "#e9deca",
    authorColor: "#e7dcc9",
    titleAlignment: "center",
    titlePosition: 10,
    titleSize: 102,
    maxWidth: 1060,
    maxLines: 4,
    minSize: 58,
    lineHeight: 1.18,
    letterSpacing: 8,
    rule: true,
  },
};

const ALL_PRESETS = Object.keys(
  COVER_TYPOGRAPHY_PRESETS,
) as CoverTypographyPresetId[];

const FIXED_STYLE_PRESETS: Record<string, CoverTypographyPresetId> = {
  "photoreal-title": "classic-gold",
};

const STYLE_PRESET_POOLS: Record<string, CoverTypographyPresetId[]> = {
  cinematic: [
    "cinematic-ivory",
    "classic-gold",
    "dramatic-stacked",
    "quiet-editorial",
  ],
  minimalist: [
    "quiet-editorial",
    "modern-clean",
    "classic-gold",
    "cinematic-ivory",
  ],
  illustrated: [
    "classic-gold",
    "modern-clean",
    "quiet-editorial",
    "cinematic-ivory",
  ],
  "minimal-real-title": [
    "classic-gold",
    "quiet-editorial",
    "modern-clean",
    "cinematic-ivory",
  ],
  "fully-loaded-title": [
    "dramatic-stacked",
    "cinematic-ivory",
    "modern-clean",
    "classic-gold",
  ],
  "eb-signature": [
    "classic-gold",
    "cinematic-ivory",
    "quiet-editorial",
  ],
};

export function resolveExactCoverTitle(manuscript: Manuscript, candidate: string) {
  return (
    candidate.trim() ||
    manuscript.title.trim() ||
    manuscript.brief.title.trim()
  );
}

export function resolveExactCoverSubtitle(manuscript: Manuscript) {
  return (
    manuscript.subtitle.trim() ||
    manuscript.brief.subtitle?.trim() ||
    manuscript.cover?.displaySubtitle?.trim() ||
    ""
  );
}

export function contrastingTextStroke(color: string) {
  const normalized = color.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return "rgba(0,0,0,.78)";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 145 ? "rgba(0,0,0,.78)" : "rgba(255,255,255,.82)";
}

export function getCoverTypographyPreset(id?: string) {
  return (
    COVER_TYPOGRAPHY_PRESETS[id as CoverTypographyPresetId] ??
    COVER_TYPOGRAPHY_PRESETS["cinematic-ivory"]
  );
}

export function selectCoverTypographyPreset(style: string, seed: string) {
  const fixedPreset = FIXED_STYLE_PRESETS[style];
  if (fixedPreset) return fixedPreset;
  const pool = STYLE_PRESET_POOLS[style] ?? ALL_PRESETS;
  const compactSeed =
    seed.length > 1024
      ? `${seed.slice(0, 512)}:${seed.slice(-512)}:${seed.length}`
      : seed;
  let hash = 2166136261;
  const input = `${style}:${compactSeed}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return pool[(hash >>> 0) % pool.length];
}

export function usesAutomaticTitleVariety(style: string) {
  return (
    Object.hasOwn(FIXED_STYLE_PRESETS, style) ||
    Object.hasOwn(STYLE_PRESET_POOLS, style)
  );
}

export function normalizeCoverTypographyPreset(style: string, id?: string) {
  const fixedPreset = FIXED_STYLE_PRESETS[style];
  if (fixedPreset) return fixedPreset;
  const pool = STYLE_PRESET_POOLS[style] ?? ALL_PRESETS;
  return pool.includes(id as CoverTypographyPresetId)
    ? (id as CoverTypographyPresetId)
    : pool[0];
}

export type CoverTextBand = {
  top: number;
  bottom: number;
};

export function resolveCoverAuthorY(
  canvasHeight: number,
  textBands: CoverTextBand[],
) {
  const authorHeight = Math.round(canvasHeight * 0.023);
  const gap = Math.round(canvasHeight * 0.0125);
  const minimumY = Math.round(canvasHeight * 0.03);
  const maximumY = canvasHeight - minimumY - authorHeight;
  const defaultY = Math.min(
    maximumY,
    Math.round(canvasHeight * 0.9296875),
  );
  const bands = textBands.filter(
    (band) =>
      Number.isFinite(band.top) &&
      Number.isFinite(band.bottom) &&
      band.bottom > band.top,
  );
  const overlapsBand = (y: number, band: CoverTextBand) =>
    y < band.bottom + gap && y + authorHeight > band.top - gap;
  const collisionsAt = (y: number) =>
    bands.filter((band) => overlapsBand(y, band));

  const initialCollisions = collisionsAt(defaultY);
  if (initialCollisions.length === 0) return defaultY;

  const below = Math.max(...initialCollisions.map((band) => band.bottom)) + gap;
  if (below <= maximumY && collisionsAt(below).length === 0) return below;

  let above =
    Math.min(...initialCollisions.map((band) => band.top)) -
    gap -
    authorHeight;
  let collisions = collisionsAt(above);
  while (collisions.length > 0 && above > minimumY) {
    above =
      Math.min(...collisions.map((band) => band.top)) - gap - authorHeight;
    collisions = collisionsAt(above);
  }
  return Math.max(minimumY, Math.min(maximumY, above));
}
