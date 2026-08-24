export type AuthorStyle = "uppercase" | "signature" | "typewriter";

export type Mode = "fiction" | "nonfiction";
export type AIProvider = "auto" | "openai" | "anthropic";
export type ActiveAIProvider = Exclude<AIProvider, "auto">;

export type BookBrief = {
  title: string;
  subtitle?: string;
  author: string;
  genre: string;
  characters: string;
  premise: string;
  topic: string;
  audience: string;
  keyPoints: string;
  chapterCount: number;
};

export type BookLength = "novella" | "standard" | "long";
export type SectionKind = "introduction" | "chapter" | "conclusion";

export type SectionPlan = {
  kind: SectionKind;
  number?: number;
  title: string;
  purpose: string;
  pov?: string;
};

export type SectionContent = SectionPlan & {
  content: string;
  summary: string;
};

export type BookImage = {
  id: string;
  sectionIndex: number;
  sectionTitle: string;
  imageData: string;
  prompt?: string;
  createdAt: string;
};

export type CoverDesign = {
  imageData: string;
  width?: number;
  height?: number;
  style: string;
  finish?: string;
  creativeFinish?: string;
  displayTitle?: string;
  displaySubtitle?: string;
  showTitle?: boolean;
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
  authorStyle?: AuthorStyle;
  typographyPreset?: string;
  titleTypography?: string;
  titlePlacement?: string;
  createdAt: string;
};

export type Manuscript = {
  id: string;
  mode: Mode;
  title: string;
  subtitle: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
  bookLength?: BookLength;
  brief: BookBrief;
  plan: SectionPlan[];
  sections: SectionContent[];
  providersUsed?: ActiveAIProvider[];
  companionOf?: { id: string; title: string; mode: Mode };
  cover?: CoverDesign;
  images?: BookImage[];
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
