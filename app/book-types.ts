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
  width?: number;
  height?: number;
  style: string;
  finish?: string;
  displayTitle?: string;
  displaySubtitle?: string;
  autoFitText?: boolean;
  titleFontSize?: number;
  subtitleFontSize?: number;
  sourceImageData?: string;
  titlePosition?: number;
  subtitlePosition?: number;
  titleAlignment?: "left" | "center" | "right";
  subtitleAlignment?: "left" | "center" | "right";
  titleColor?: string;
  subtitleColor?: string;
  authorColor?: string;
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
  optimization?: {
    sourceFileName: string;
    mode: "packaging" | "polish" | "viral" | "relaunch";
    originalTitle: string;
    originalText: string;
    audit: {
      score: number;
      positioning: string;
      strengths: string[];
      weaknesses: string[];
      title: string;
      subtitle: string;
      audience: string;
      recommendations: string[];
    };
  };
};
