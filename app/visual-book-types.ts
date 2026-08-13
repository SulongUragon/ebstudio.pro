import type { ActiveAIProvider } from "./book-types";

export type VisualProjectMode = "visual" | "comic";
export type VisualBookKind = "illustrated-story" | "children-story" | "visual-guide" | "motivational" | "recipe-activity" | "book-teaser" | "lead-magnet" | "product-guide";
export type ComicFormat = "classic" | "graphic-novel" | "romance" | "noir" | "manga" | "children" | "webtoon" | "comic-strip";
export type VisualPageCount = 5 | 7 | 10;
export type VisualStyle = "cinematic-editorial" | "warm-storybook" | "dark-luxury" | "clean-modern" | "bold-color" | "ink-noir";
export type ComicDialogue = { speaker: string; text: string };
export type ComicPanel = { id: string; order: number; scene: string; camera: string; dialogue: ComicDialogue[]; caption: string; soundEffect: string; imageData?: string };
export type VisualBookPage = { id: string; pageNumber: number; role: "cover" | "content" | "cta"; title: string; body: string; imagePrompt: string; imageData?: string; layout: "full-bleed" | "image-top" | "image-left" | "image-right" | "quote"; panels: ComicPanel[] };
export type VisualBookBrief = { mode: VisualProjectMode; title: string; subtitle: string; author: string; kind: VisualBookKind; comicFormat: ComicFormat; premise: string; audience: string; pageCount: VisualPageCount; visualStyle: VisualStyle; characterBible: string; palette: string };
export type VisualBookProject = VisualBookBrief & { id: string; createdAt: string; updatedAt: string; pages: VisualBookPage[]; providersUsed?: ActiveAIProvider[] };

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
export const COMIC_FORMATS: Array<{ id: ComicFormat; label: string; note: string }> = [
  { id: "classic", label: "Classic Comic", note: "One to four clean panels per page." },
  { id: "graphic-novel", label: "Graphic Novel", note: "Large cinematic panels and mature pacing." },
  { id: "romance", label: "Romance Comic", note: "Expressive close-ups and emotional tension." },
  { id: "noir", label: "Dark Noir", note: "High contrast, shadow, danger, and mystery." },
  { id: "manga", label: "Manga-Inspired", note: "Dynamic monochrome storytelling." },
  { id: "children", label: "Children's Comic", note: "Colorful, friendly, and easy to follow." },
  { id: "webtoon", label: "Webtoon", note: "Vertical scenes with generous breathing room." },
  { id: "comic-strip", label: "Comic Strip", note: "Fast three or four beat stories." },
];
export const VISUAL_STYLES: Array<{ id: VisualStyle; label: string }> = [
  { id: "cinematic-editorial", label: "Cinematic Editorial" }, { id: "warm-storybook", label: "Warm Storybook" },
  { id: "dark-luxury", label: "Dark Luxury" }, { id: "clean-modern", label: "Clean Modern" },
  { id: "bold-color", label: "Bold Color" }, { id: "ink-noir", label: "Ink Noir" },
];
export const blankVisualBookBrief = (mode: VisualProjectMode): VisualBookBrief => ({ mode, title: "", subtitle: "", author: "Sulong", kind: "illustrated-story", comicFormat: "graphic-novel", premise: "", audience: "", pageCount: 7, visualStyle: mode === "comic" ? "dark-luxury" : "cinematic-editorial", characterBible: "", palette: "" });
