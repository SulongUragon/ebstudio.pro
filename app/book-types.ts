export type Mode = "fiction" | "nonfiction";
export type AIProvider = "auto" | "openai" | "anthropic";
export type ActiveAIProvider = Exclude<AIProvider, "auto">;

export type BookBrief = {
  title: string;
  author: string;
  genre: string;
  characters: string;
  premise: string;
  topic: string;
  audience: string;
  keyPoints: string;
  chapterCount: number;
};

export type SectionKind = "introduction" | "chapter" | "conclusion";

export type SectionPlan = {
  kind: SectionKind;
  number?: number;
  title: string;
  purpose: string;
};

export type SectionContent = SectionPlan & {
  content: string;
  summary: string;
};

export type CoverDesign = {
  imageData: string;
  style: string;
  finish?: string;
  displayTitle?: string;
  displaySubtitle?: string;
  autoFitText?: boolean;
  titleFontSize?: number;
  subtitleFontSize?: number;
  createdAt: string;
};

export type Manuscript = {
  id: string;
  mode: Mode;
  title: string;
  subtitle: string;
  author: string;
  createdAt: string;
  brief: BookBrief;
  plan: SectionPlan[];
  sections: SectionContent[];
  providersUsed?: ActiveAIProvider[];
  cover?: CoverDesign;
};
