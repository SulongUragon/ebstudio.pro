import type { Manuscript } from "./book-types";

export type CoverTypographyPresetId =
  | "classic-gothic-serif"
  | "literary-tall-serif"
  | "stormglass-serif"
  | "engraved-gold"
  | "editorial-luxe"
  | "hand-set-mystery"
  | "minimal-authority"
  | "warm-storybook-serif"
  | "bold-commercial"
  | "clean-sans-premium"
  | "classic-gold"
  | "cinematic-ivory"
  | "modern-clean"
  | "dramatic-stacked"
  | "quiet-editorial";

export const TITLE_TYPOGRAPHY_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "classic-gothic-serif", label: "Classic Gothic Serif" },
  { id: "literary-tall-serif", label: "Literary Tall Serif" },
  { id: "stormglass-serif", label: "Stormglass Serif" },
  { id: "engraved-gold", label: "Engraved Gold" },
  { id: "editorial-luxe", label: "Editorial Luxe" },
  { id: "hand-set-mystery", label: "Hand-Set Mystery" },
  { id: "minimal-authority", label: "Minimal Authority" },
  { id: "warm-storybook-serif", label: "Warm Storybook Serif" },
  { id: "bold-commercial", label: "Bold Commercial" },
  { id: "clean-sans-premium", label: "Clean Sans Premium" },
] as const;

export type TitleTypographyId =
  (typeof TITLE_TYPOGRAPHY_OPTIONS)[number]["id"];

export const TITLE_PLACEMENT_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "top", label: "Top" },
  { id: "upper-third", label: "Upper Third" },
  { id: "center", label: "Center" },
  { id: "lower-third", label: "Lower Third" },
  { id: "bottom", label: "Bottom" },
  { id: "split-title", label: "Split Title" },
  { id: "frame-overlay", label: "Frame Overlay" },
] as const;

export type TitlePlacementId =
  (typeof TITLE_PLACEMENT_OPTIONS)[number]["id"];

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
  description?: string;
  titleGradient?: readonly [string, string, string];
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetY?: number;
};

const COVER_TYPOGRAPHY_PRESETS: Record<
  CoverTypographyPresetId,
  CoverTypographyPreset
> = {
  "classic-gothic-serif": {
    id: "classic-gothic-serif",
    label: "Classic Gothic Serif",
    fontName: "Cinzel",
    fontFamily: '"Cinzel", Georgia, "Times New Roman", serif',
    fontWeight: 500,
    uppercase: true,
    titleColor: "#f1e4c9",
    subtitleColor: "#eadfc8",
    authorColor: "#e8decd",
    titleAlignment: "center",
    titlePosition: 7,
    titleSize: 112,
    maxWidth: 1180,
    maxLines: 4,
    minSize: 56,
    lineHeight: 1.14,
    letterSpacing: 5,
    rule: false,
    description: "Elegant tall serif with controlled tracking, ivory-gold color, and restrained literary gravity.",
    shadowColor: "rgba(3, 9, 11, .8)",
    shadowBlur: 18,
    shadowOffsetY: 5,
  },
  "literary-tall-serif": {
    id: "literary-tall-serif",
    label: "Literary Tall Serif",
    fontName: "Cormorant Garamond",
    fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
    fontWeight: 500,
    uppercase: true,
    titleColor: "#f4ead7",
    subtitleColor: "#eee2ce",
    authorColor: "#e8decd",
    titleAlignment: "center",
    titlePosition: 9,
    titleSize: 120,
    maxWidth: 1100,
    maxLines: 5,
    minSize: 58,
    lineHeight: 1.06,
    letterSpacing: 8,
    rule: false,
    description: "Tall refined serif with generous spacing and a quiet literary hierarchy for atmospheric titles.",
    shadowColor: "rgba(3, 9, 11, .72)",
    shadowBlur: 16,
    shadowOffsetY: 4,
  },
  "stormglass-serif": {
    id: "stormglass-serif",
    label: "Stormglass Serif",
    fontName: "Cormorant Garamond",
    fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
    fontWeight: 600,
    uppercase: true,
    titleColor: "#efe1bd",
    subtitleColor: "#f0e5d1",
    authorColor: "#e8decd",
    titleAlignment: "center",
    titlePosition: 8,
    titleSize: 122,
    maxWidth: 1120,
    maxLines: 5,
    minSize: 58,
    lineHeight: 1.02,
    letterSpacing: 7,
    rule: false,
    description: "Rain-darkened gothic literary serif with expanded tracking, ivory-gold depth, and controlled shadow.",
    titleGradient: ["#fff7df", "#d8b66e", "#f4ead2"],
    shadowColor: "rgba(2, 8, 12, .88)",
    shadowBlur: 22,
    shadowOffsetY: 6,
  },
  "engraved-gold": {
    id: "engraved-gold",
    label: "Engraved Gold",
    fontName: "Cinzel",
    fontFamily: '"Cinzel", Georgia, "Times New Roman", serif',
    fontWeight: 600,
    uppercase: true,
    titleColor: "#d9b86f",
    subtitleColor: "#f0e3c9",
    authorColor: "#e8decd",
    titleAlignment: "center",
    titlePosition: 7,
    titleSize: 116,
    maxWidth: 1160,
    maxLines: 4,
    minSize: 58,
    lineHeight: 1.08,
    letterSpacing: 4,
    rule: false,
    description: "Readable engraved metallic serif with restrained bevel-like depth for prestige thrillers and fantasy.",
    titleGradient: ["#fff0bd", "#b88939", "#f2d78e"],
    shadowColor: "rgba(0, 0, 0, .86)",
    shadowBlur: 18,
    shadowOffsetY: 6,
  },
  "editorial-luxe": {
    id: "editorial-luxe",
    label: "Editorial Luxe",
    fontName: "Playfair Display",
    fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
    fontWeight: 700,
    uppercase: false,
    titleColor: "#fff6e6",
    subtitleColor: "#f3e7d5",
    authorColor: "#ece1d0",
    titleAlignment: "center",
    titlePosition: 8,
    titleSize: 110,
    maxWidth: 1260,
    maxLines: 4,
    minSize: 58,
    lineHeight: 1.04,
    letterSpacing: 1,
    rule: false,
    description: "High-contrast fashion-editorial serif with spacious, elegant hierarchy for memoir and literary romance.",
    shadowColor: "rgba(0, 0, 0, .7)",
    shadowBlur: 18,
    shadowOffsetY: 5,
  },
  "hand-set-mystery": {
    id: "hand-set-mystery",
    label: "Hand-Set Mystery",
    fontName: "Cormorant Garamond",
    fontFamily: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
    fontWeight: 600,
    uppercase: true,
    titleColor: "#f1e6d0",
    subtitleColor: "#eadfcd",
    authorColor: "#e8decd",
    titleAlignment: "left",
    titlePosition: 9,
    titleSize: 112,
    maxWidth: 1160,
    maxLines: 5,
    minSize: 56,
    lineHeight: 1.03,
    letterSpacing: 3,
    rule: true,
    description: "Controlled old-print mystery treatment with bookish character, never handwritten or childish.",
    shadowColor: "rgba(0, 0, 0, .76)",
    shadowBlur: 16,
    shadowOffsetY: 5,
  },
  "minimal-authority": {
    id: "minimal-authority",
    label: "Minimal Authority",
    fontName: "Montserrat",
    fontFamily: '"Montserrat", Arial, Helvetica, sans-serif',
    fontWeight: 800,
    uppercase: true,
    titleColor: "#fffdf7",
    subtitleColor: "#f0eadf",
    authorColor: "#eee6d9",
    titleAlignment: "left",
    titlePosition: 8,
    titleSize: 102,
    maxWidth: 1240,
    maxLines: 4,
    minSize: 56,
    lineHeight: 1.08,
    letterSpacing: 4,
    rule: true,
    description: "Clean, trusted business typography with strong spacing and restrained authority.",
    shadowColor: "rgba(0, 0, 0, .55)",
    shadowBlur: 14,
    shadowOffsetY: 4,
  },
  "warm-storybook-serif": {
    id: "warm-storybook-serif",
    label: "Warm Storybook Serif",
    fontName: "Playfair Display",
    fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
    fontWeight: 700,
    uppercase: false,
    titleColor: "#fff4d5",
    subtitleColor: "#fff0d6",
    authorColor: "#f4ead9",
    titleAlignment: "center",
    titlePosition: 8,
    titleSize: 108,
    maxWidth: 1240,
    maxLines: 4,
    minSize: 60,
    lineHeight: 1.08,
    letterSpacing: 1,
    rule: false,
    description: "Soft, friendly, polished serif that stays readable and avoids childish novelty styling.",
    shadowColor: "rgba(31, 24, 15, .62)",
    shadowBlur: 14,
    shadowOffsetY: 4,
  },
  "bold-commercial": {
    id: "bold-commercial",
    label: "Bold Commercial",
    fontName: "Bebas Neue",
    fontFamily: '"Bebas Neue", Impact, sans-serif',
    fontWeight: 400,
    uppercase: true,
    titleColor: "#fff2d5",
    subtitleColor: "#f5ead5",
    authorColor: "#eadfcd",
    titleAlignment: "center",
    titlePosition: 6,
    titleSize: 132,
    maxWidth: 1120,
    maxLines: 5,
    minSize: 62,
    lineHeight: 0.96,
    letterSpacing: 2,
    rule: false,
    description: "High-impact thumbnail-first display treatment for thrillers and commercial nonfiction without crowding.",
    shadowColor: "rgba(0, 0, 0, .82)",
    shadowBlur: 20,
    shadowOffsetY: 6,
  },
  "clean-sans-premium": {
    id: "clean-sans-premium",
    label: "Clean Sans Premium",
    fontName: "Montserrat",
    fontFamily: '"Montserrat", Arial, Helvetica, sans-serif',
    fontWeight: 700,
    uppercase: false,
    titleColor: "#fffdf7",
    subtitleColor: "#f1ebdf",
    authorColor: "#eee6d9",
    titleAlignment: "left",
    titlePosition: 8,
    titleSize: 100,
    maxWidth: 1280,
    maxLines: 4,
    minSize: 54,
    lineHeight: 1.12,
    letterSpacing: 2,
    rule: true,
    description: "Modern, clear premium sans with practical hierarchy for guides and nonfiction.",
    shadowColor: "rgba(0, 0, 0, .52)",
    shadowBlur: 12,
    shadowOffsetY: 4,
  },
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

export type CoverTitleDirectionContext = {
  mode?: "fiction" | "nonfiction";
  title?: string;
  genre?: string;
  premise?: string;
  topic?: string;
  creativeFinish?: string;
  style?: string;
};

export type CoverTitlePlacementPreset = {
  id: Exclude<TitlePlacementId, "auto">;
  label: string;
  description: string;
  anchor: "top" | "center" | "bottom";
  positionRatio: number;
  split: boolean;
  frame: boolean;
};

const TITLE_PLACEMENT_PRESETS: Record<
  Exclude<TitlePlacementId, "auto">,
  CoverTitlePlacementPreset
> = {
  top: {
    id: "top",
    label: "Top",
    description: "Top safe area with deliberate breathing room for artwork whose subject sits lower.",
    anchor: "top",
    positionRatio: 0.055,
    split: false,
    frame: false,
  },
  "upper-third": {
    id: "upper-third",
    label: "Upper Third",
    description: "Cinematic upper-third zone that balances a person, house, or focal image below.",
    anchor: "top",
    positionRatio: 0.155,
    split: false,
    frame: false,
  },
  center: {
    id: "center",
    label: "Center",
    description: "Vertically centered title zone for minimal object and typography-led covers.",
    anchor: "center",
    positionRatio: 0.5,
    split: false,
    frame: false,
  },
  "lower-third": {
    id: "lower-third",
    label: "Lower Third",
    description: "Lower-third zone below the primary subject while retaining a separate author safe area.",
    anchor: "top",
    positionRatio: 0.595,
    split: false,
    frame: false,
  },
  bottom: {
    id: "bottom",
    label: "Bottom",
    description: "Bottom title zone used only above the protected author and trim area.",
    anchor: "bottom",
    positionRatio: 0.855,
    split: false,
    frame: false,
  },
  "split-title": {
    id: "split-title",
    label: "Split Title",
    description: "Balanced title bands above and below the visual focal zone without orphan words.",
    anchor: "top",
    positionRatio: 0.08,
    split: true,
    frame: false,
  },
  "frame-overlay": {
    id: "frame-overlay",
    label: "Frame Overlay",
    description: "Premium title panel with a restrained frame for artwork that needs stronger separation.",
    anchor: "top",
    positionRatio: 0.16,
    split: false,
    frame: true,
  },
};

const TITLE_TYPOGRAPHY_IDS = new Set(
  TITLE_TYPOGRAPHY_OPTIONS.map((option) => option.id),
);
const TITLE_PLACEMENT_IDS = new Set(
  TITLE_PLACEMENT_OPTIONS.map((option) => option.id),
);

function optionKey(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolveTitleTypographyId(
  value: string | undefined,
): TitleTypographyId {
  const key = optionKey(value) || "auto";
  return TITLE_TYPOGRAPHY_IDS.has(key as TitleTypographyId)
    ? (key as TitleTypographyId)
    : "auto";
}

export function resolveTitlePlacementId(
  value: string | undefined,
): TitlePlacementId {
  const key = optionKey(value) || "auto";
  return TITLE_PLACEMENT_IDS.has(key as TitlePlacementId)
    ? (key as TitlePlacementId)
    : "auto";
}

export function inferCoverTitleTypography(
  context: CoverTitleDirectionContext,
): Exclude<TitleTypographyId, "auto"> {
  const finish = optionKey(context.creativeFinish);
  const text = [context.genre, context.title, context.premise, context.topic]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const finishMap: Record<string, Exclude<TitleTypographyId, "auto">> = {
    "rain-soaked-gothic": "stormglass-serif",
    "gothic-literary": "literary-tall-serif",
    "cinematic-mystery": "hand-set-mystery",
    "dark-academia": "classic-gothic-serif",
    "emotional-memoir": "editorial-luxe",
    "premium-nonfiction": "minimal-authority",
    "founder-authority": "minimal-authority",
    "warm-storybook": "warm-storybook-serif",
    "minimal-literary": "literary-tall-serif",
    "luxury-thriller": "engraved-gold",
    "dark-romance": "editorial-luxe",
    "epic-fantasy": "engraved-gold",
    "clean-how-to": "clean-sans-premium",
    "product-guide-premium": "minimal-authority",
  };
  if (finishMap[finish]) return finishMap[finish];
  if (/gothic|haunt|old house|manor|ancestral/.test(text)) return "classic-gothic-serif";
  if (/mystery|suspense|secret|disappearance/.test(text)) return "hand-set-mystery";
  if (/thriller|crime|espionage/.test(text)) return "bold-commercial";
  if (/fantasy|mythic|dragon|magic/.test(text)) return "engraved-gold";
  if (/romance|memoir|grief|personal story/.test(text)) return "editorial-luxe";
  if (/children|storybook|picture book|bedtime/.test(text)) return "warm-storybook-serif";
  if (/business|founder|leadership|strategy|operations/.test(text)) return "minimal-authority";
  if (/guide|how to|handbook|manual|workbook/.test(text)) return "clean-sans-premium";
  return context.mode === "nonfiction" ? "minimal-authority" : "literary-tall-serif";
}

export function resolveCoverTitleTypography(
  value: string | undefined,
  context: CoverTitleDirectionContext,
): Exclude<TitleTypographyId, "auto"> {
  const requested = resolveTitleTypographyId(value);
  return requested === "auto" ? inferCoverTitleTypography(context) : requested;
}

export function inferCoverTitlePlacement(
  context: CoverTitleDirectionContext,
): Exclude<TitlePlacementId, "auto"> {
  const finish = optionKey(context.creativeFinish);
  const style = optionKey(context.style);
  if (
    style === "photoreal-title" &&
    (finish === "rain-soaked-gothic" || finish === "cinematic-mystery")
  ) return "upper-third";
  if (style === "minimal-real-title") return "center";
  if (style === "fully-loaded-title") return "frame-overlay";
  if (finish === "minimal-literary") return "lower-third";
  if (finish === "dark-romance") return "lower-third";
  if (finish === "warm-storybook") return "top";
  if (finish === "premium-nonfiction" || finish === "founder-authority") return "top";
  if (finish === "epic-fantasy" || finish === "luxury-thriller") return "top";
  if (finish === "rain-soaked-gothic" || finish === "cinematic-mystery") return "upper-third";
  return style === "minimalist" ? "center" : "top";
}

export function resolveCoverTitlePlacement(
  value: string | undefined,
  context: CoverTitleDirectionContext,
): Exclude<TitlePlacementId, "auto"> {
  const requested = resolveTitlePlacementId(value);
  return requested === "auto" ? inferCoverTitlePlacement(context) : requested;
}

export function getCoverTitlePlacementPreset(
  id: string | undefined,
  context: CoverTitleDirectionContext = {},
) {
  const resolved = resolveCoverTitlePlacement(id, context);
  return TITLE_PLACEMENT_PRESETS[resolved];
}

export function resolveCoverTitleTop(
  canvasHeight: number,
  titleHeight: number,
  placement: CoverTitlePlacementPreset,
) {
  const safeTop = canvasHeight * 0.05;
  const safeBottom = canvasHeight * 0.87;
  const preferred = placement.anchor === "center"
    ? canvasHeight * placement.positionRatio - titleHeight / 2
    : placement.anchor === "bottom"
      ? canvasHeight * placement.positionRatio - titleHeight
      : canvasHeight * placement.positionRatio;
  return Math.max(safeTop, Math.min(safeBottom - titleHeight, preferred));
}

export function resolveNonCollidingCoverTextY(
  preferredY: number,
  textHeight: number,
  canvasHeight: number,
  occupiedBands: CoverTextBand[],
) {
  const gap = Math.round(canvasHeight * 0.018);
  const minimumY = Math.round(canvasHeight * 0.04);
  const maximumY = Math.round(canvasHeight * 0.88) - textHeight;
  const bands = occupiedBands.filter((band) => band.bottom > band.top);
  const collides = (y: number) => bands.some(
    (band) => y < band.bottom + gap && y + textHeight > band.top - gap,
  );
  const clampedPreferred = Math.max(minimumY, Math.min(maximumY, preferredY));
  if (!collides(clampedPreferred)) return clampedPreferred;
  const candidates = [
    minimumY,
    maximumY,
    ...bands.flatMap((band) => [band.bottom + gap, band.top - gap - textHeight]),
  ]
    .map((candidate) => Math.max(minimumY, Math.min(maximumY, candidate)))
    .filter((candidate) => !collides(candidate))
    .sort((a, b) => Math.abs(a - clampedPreferred) - Math.abs(b - clampedPreferred));
  return candidates[0] ?? clampedPreferred;
}

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

export function wrapBalancedCoverTitle(
  context: Pick<CanvasRenderingContext2D, "measureText">,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  const preferredLines = Math.min(
    maxLines,
    words.length >= 10 ? 4 : words.length >= 6 ? 3 : 2,
  );
  const lineCounts = Array.from(
    { length: Math.max(1, maxLines - preferredLines + 1) },
    (_, index) => preferredLines + index,
  );
  for (const lineCount of lineCounts) {
    const best: { value: { lines: string[]; score: number } | null } = {
      value: null,
    };
    const visit = (start: number, remaining: number, lines: string[]) => {
      if (remaining === 1) {
        const finalLine = words.slice(start).join(" ");
        if (!finalLine || context.measureText(finalLine).width > maxWidth) return;
        const candidate = [...lines, finalLine];
        const widths = candidate.map((line) => context.measureText(line).width);
        const average = widths.reduce((sum, width) => sum + width, 0) / widths.length;
        const orphanPenalty = candidate.reduce(
          (penalty, line) => penalty + (line.split(/\s+/).length === 1 ? maxWidth * maxWidth : 0),
          0,
        );
        const score = widths.reduce(
          (sum, width) => sum + (width - average) ** 2,
          orphanPenalty,
        );
        if (!best.value || score < best.value.score) {
          best.value = { lines: candidate, score };
        }
        return;
      }
      const finalStart = words.length - remaining + 1;
      for (let end = start + 1; end <= finalStart; end += 1) {
        const line = words.slice(start, end).join(" ");
        if (context.measureText(line).width > maxWidth) break;
        visit(end, remaining - 1, [...lines, line]);
      }
    };
    visit(0, lineCount, []);
    if (best.value) return best.value.lines;
  }

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export type CoverTextBand = {
  top: number;
  bottom: number;
};

export function resolveCoverAuthorY(
  canvasHeight: number,
  textBands: CoverTextBand[],
  options: { heightRatio?: number; defaultRatio?: number } = {},
) {
  const authorHeight = Math.round(canvasHeight * (options.heightRatio ?? 0.023));
  const gap = Math.round(canvasHeight * 0.0125);
  const minimumY = Math.round(canvasHeight * 0.03);
  const maximumY = canvasHeight - minimumY - authorHeight;
  const defaultY = Math.min(
    maximumY,
    Math.round(canvasHeight * (options.defaultRatio ?? 0.9296875)),
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
