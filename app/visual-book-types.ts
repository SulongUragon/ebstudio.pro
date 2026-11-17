import type { CharacterRef } from "./character-refs";
import type { ActiveAIProvider } from "./book-types";

/** Visual books have one format. The field stays on saved projects so older ones still open. */
export type VisualProjectMode = "visual";
export type VisualBookKind = "illustrated-story" | "children-story" | "visual-guide" | "motivational" | "recipe-activity" | "book-teaser" | "lead-magnet" | "product-guide";
export type VisualPageCount = number;
export type VisualStyle = "cinematic-editorial" | "warm-storybook" | "dark-luxury" | "clean-modern" | "bold-color" | "ink-noir" | "notebook-reflection" | "warm-practical-guide";
export type VisualBookPage = { id: string; pageNumber: number; role: "cover" | "content" | "cta"; title: string; body: string; imagePrompt: string; imageData?: string; pullQuote?: string; ingredientsPage?: boolean; closingLayout?: VisualBookPage["layout"]; layout: "full-bleed" | "image-top" | "image-left" | "image-right" | "quote" | "fade-top" | "fade-bottom" };
/** The layout a page is actually drawn with: the last page keeps its closing design unless one is chosen. */
export function effectivePageLayout(page: Pick<VisualBookPage, "role" | "layout" | "closingLayout">) {
  return page.role === "cta" ? page.closingLayout : page.layout;
}
/** Fade layouts run wide art edge to edge and blend it into the paper; their art is drawn 3:2. */
export function isFadeLayout(layout: string | undefined) {
  return layout === "fade-top" || layout === "fade-bottom";
}
export type ArtLook = "photographic" | "painting" | "illustrated";
export type VisualBookBrief = { mode: VisualProjectMode; title: string; subtitle: string; author: string; kind: VisualBookKind; premise: string; audience: string; pageCount: VisualPageCount; visualStyle: VisualStyle; characterBible: string; palette: string; artLook?: ArtLook; ingredients?: string; imprint?: string };
export type VisualBookProject = VisualBookBrief & { id: string; createdAt: string; updatedAt: string; pages: VisualBookPage[]; providersUsed?: ActiveAIProvider[]; characterRefs?: CharacterRef[] };

export const VISUAL_BOOK_KINDS: Array<{ id: VisualBookKind; label: string; note: string }> = [
  { id: "illustrated-story", label: "Illustrated Story", note: "A complete visual short story." },
  { id: "children-story", label: "Children's Story", note: "Simple language and bright narrative art." },
  { id: "visual-guide", label: "Visual How-To", note: "A compact, useful step-by-step guide." },
  { id: "motivational", label: "Motivational", note: "Short emotional copy with strong imagery." },
  { id: "recipe-activity", label: "Recipe / Activity", note: "Instructions supported by useful visuals." },
  { id: "book-teaser", label: "Book Teaser", note: "A story companion and reader magnet." },
  { id: "lead-magnet", label: "Lead Magnet", note: "A fast-value download built to convert." },
  { id: "product-guide", label: "Product Guide", note: "A concise visual offer or service guide." },
];
export const VISUAL_STYLES: Array<{ id: VisualStyle; label: string }> = [
  { id: "cinematic-editorial", label: "Cinematic Editorial" }, { id: "warm-storybook", label: "Warm Storybook" },
  { id: "dark-luxury", label: "Dark Luxury" }, { id: "clean-modern", label: "Clean Modern" },
  { id: "bold-color", label: "Bold Color" }, { id: "ink-noir", label: "Ink Noir" },
  { id: "notebook-reflection", label: "Notebook Reflection" },
  { id: "warm-practical-guide", label: "Warm Practical Guide" },
];
export const ART_LOOKS: Array<{ id: ArtLook; label: string; note: string }> = [
  { id: "photographic", label: "Photographic", note: "Cinematic photographs of real people and places." },
  { id: "painting", label: "Fine-art painting", note: "Gallery oil and watercolor, never cartoon." },
  { id: "illustrated", label: "Illustrated", note: "Hand-drawn book illustration." },
];
/** Projects saved before the Art look setting get the look that suits their style. */
export function resolveArtLook(brief: Pick<VisualBookBrief, "artLook" | "visualStyle" | "kind">): ArtLook {
  if (brief.artLook === "photographic" || brief.artLook === "painting" || brief.artLook === "illustrated") return brief.artLook;
  if (brief.kind === "children-story") return "illustrated";
  return ["cinematic-editorial", "dark-luxury", "clean-modern"].includes(brief.visualStyle) ? "photographic" : "illustrated";
}
export const blankVisualBookBrief = (mode: VisualProjectMode = "visual"): VisualBookBrief => ({ mode, title: "", subtitle: "", author: "Sulong", kind: "illustrated-story", premise: "", audience: "", pageCount: 7, visualStyle: "cinematic-editorial", characterBible: "", palette: "" });

/** Comics and graphic stories were removed from the app; requests for them are refused before any AI is called. */
export const COMICS_REMOVED_MESSAGE = "Comics and graphic stories are no longer part of EB Studio Pro. Visual Mini eBooks are still available.";
export function isRetiredComicRequest(project: unknown) {
  return (project as { mode?: unknown } | null | undefined)?.mode === "comic";
}
