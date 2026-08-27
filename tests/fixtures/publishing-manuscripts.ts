import type { Manuscript, Mode, SectionContent } from "../../app/book-types";

export const PUBLISHING_QA_COVER_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";

const FICTION_TITLES = [
  "Prologue: The Quiet House Before the First Knock",
  "The Message Beneath the Door and the Promise It Carried",
  "A Map Drawn from Memory, Rainwater, and One Unanswered Question",
  "The Archive <Left Open> & the Witness Who Said \"Nothing\"",
  "What the Blue Room Remembered After Everyone Else Forgot",
  "The Long Walk Back Through Streets That No Longer Knew Her Name",
  "An Honest Conversation at the Edge of a Beautiful and Dangerous Choice",
  "The Night the Evidence Changed Its Meaning Without Changing Its Shape",
  "A Doorway Wide Enough for Truth but Too Narrow for the Old Story",
  "Epilogue: Morning Arrives Without Asking Permission",
] as const;

const NONFICTION_TITLES = [
  "Introduction: Why Reliable Creative Work Needs a Publishing System",
  "Define the Reader, the Promise, and the Decision the Book Must Support",
  "Build a Manuscript Architecture That Can Survive Real Revision",
  "Separate Useful Evidence from Noise, Assumptions & <Unverified Claims>",
  "Turn Dense Drafts into Readable Chapters Without Losing the Meaning",
  "Create Review Gates for Accuracy, Voice, Structure, and Reader Trust",
  "Prepare DOCX, EPUB, PDF, Cover, and Bundle Files Without Format Drift",
  "Run a Practical Preflight Before Uploading Anything to a Storefront",
  "Use Feedback, Corrections, and Version Notes to Protect the Final Release",
  "Conclusion: Publish with Confidence, Then Improve the System Deliberately",
] as const;

function fictionContent(title: string, sectionIndex: number) {
  const passages = Array.from({ length: 9 }, (_, passageIndex) => {
    const clue = passageIndex + 1;
    if (passageIndex % 3 === 1) {
      return `\"Tell me what changed,\" Elena said. Tomas looked toward the rain-dark window before he answered. \"Clue ${clue} did not change the facts. It changed which fact we were finally willing to believe.\" Neither of them moved until the silence felt like part of the testimony.`;
    }
    if (passageIndex % 3 === 2) {
      return `The notebook recorded scene ${sectionIndex + 1}.${clue} in careful detail: the time on the kitchen clock, the damp mark beside the stairs, and the sentence someone had crossed out twice. Elena separated observation from fear, then wrote the next question in the margin so the story could move without pretending certainty.`;
    }
    return `By the time Elena reached passage ${clue}, the house had become less a place than a sequence of choices. She followed the evidence from room to room, tested each explanation against what she could see, and refused the easier answer whenever it required her to ignore a contradiction.`;
  });
  const specialCharacters = sectionIndex === 3
    ? "The card read <Left Open> & \"Return Before Midnight\". Elena copied the symbols exactly because changing one character would change the evidence."
    : "Every object kept its ordinary name, but its meaning depended on who was brave enough to describe it honestly.";
  return [
    `# ${title}`,
    passages.slice(0, 4).join("\n\n"),
    "***",
    "### What the Evidence Could Not Say",
    specialCharacters,
    passages.slice(4).join("\n\n"),
    `Chapter ending ${sectionIndex + 1}: Elena closed the notebook only after the final thought reached a natural conclusion.`,
  ].join("\n\n");
}

function nonfictionContent(title: string, sectionIndex: number) {
  const lessons = Array.from({ length: 7 }, (_, lessonIndex) => {
    const lesson = lessonIndex + 1;
    return `Lesson ${sectionIndex + 1}.${lesson} begins with a practical constraint. A publishing system must preserve the author's meaning, help the reader navigate the material, and make errors visible before release. The operator records the decision, the evidence behind it, and the next review point so another person can repeat the process without guessing.`;
  });
  const edgeCase = sectionIndex === 3
    ? "Treat 5 < 7, quality > speed, and evidence & judgment as text that must remain readable instead of becoming accidental markup. The phrase <Unverified Claims> must also survive safely."
    : "Treat every formatting choice as a reader-facing decision with a clear purpose, a review method, and a safe fallback.";
  return [
    `# ${title}`,
    lessons.slice(0, 3).join("\n\n"),
    "### Practical Lesson & Review Gate",
    edgeCase,
    "- Confirm the chapter promise before polishing sentences.\n- Check headings, paragraph breaks, and navigation in the exported file.\n- Record any exception that a later reviewer must understand.",
    "1. Name the publishing risk.\n2. Choose the smallest safe correction.\n3. Re-export and verify the actual file.",
    lessons.slice(3).join("\n\n"),
    `Action step ${sectionIndex + 1}: write one complete publishing decision, assign its reviewer, and define the evidence required to approve it.`,
  ].join("\n\n");
}

function makeSections(
  titles: readonly string[],
  content: (title: string, sectionIndex: number) => string,
): SectionContent[] {
  return titles.map((title, index) => ({
    kind: index === 0 ? "introduction" : index === titles.length - 1 ? "conclusion" : "chapter",
    ...(index > 0 && index < titles.length - 1 ? { number: index } : {}),
    title,
    purpose: index === 0 ? "Orient the reader" : index === titles.length - 1 ? "Resolve the promise" : `Advance section ${index}`,
    ...(index > 0 && index < titles.length - 1
      ? {
          openerDeck: `A precise turning point changes the meaning of chapter ${index} without repeating its title.`,
          openerImagePrompt: `A chapter-specific cinematic scene for section ${index} with clean lower-third negative space and no readable text.`,
          openerVisualMood: "Deep navy, muted forest green, low-key light, and restrained emotional tension.",
        }
      : {}),
    content: content(title, index),
    summary: `Section ${index + 1} completes its assigned publishing role.`,
  }));
}

function makeManuscript(options: {
  id: string;
  mode: Mode;
  title: string;
  subtitle: string;
  author: string;
  genre: string;
  topic: string;
  audience: string;
  keyPoints: string;
  sections: SectionContent[];
}): Manuscript {
  return {
    id: options.id,
    mode: options.mode,
    title: options.title,
    subtitle: options.subtitle,
    author: options.author,
    createdAt: "2026-08-24T00:00:00.000Z",
    brief: {
      title: options.title,
      subtitle: options.subtitle,
      author: options.author,
      genre: options.genre,
      characters: options.mode === "fiction" ? "Elena, Tomas, and the witness" : "",
      premise: options.mode === "fiction" ? "A recovered notebook changes the meaning of an old disappearance." : "",
      topic: options.topic,
      audience: options.audience,
      keyPoints: options.keyPoints,
      chapterCount: options.sections.filter((section) => section.kind === "chapter").length,
    },
    plan: options.sections.map(({ content: _content, summary: _summary, ...plan }) => plan),
    sections: options.sections,
    cover: {
      imageData: PUBLISHING_QA_COVER_JPEG,
      sourceImageData: PUBLISHING_QA_COVER_JPEG,
      width: 1600,
      height: 2560,
      style: "cinematic",
      finish: "satin",
      displayTitle: options.title,
      displaySubtitle: options.subtitle,
      createdAt: "2026-08-24T00:00:00.000Z",
    },
  };
}

export function createLongFictionManuscript(): Manuscript {
  const sections = makeSections(FICTION_TITLES, fictionContent);
  return makeManuscript({
    id: "33333333-4444-4555-8666-777777777777",
    mode: "fiction",
    title: "The House That Remembered Every Promise We Tried to Forget Before the Last Train Crossed the Sleeping City",
    subtitle: "",
    author: "Alexandra Rowan-Santiago",
    genre: "Literary mystery",
    topic: "",
    audience: "Adult readers who enjoy reflective mysteries",
    keyPoints: "",
    sections,
  });
}

export function createLongNonfictionManuscript(): Manuscript {
  const sections = makeSections(NONFICTION_TITLES, nonfictionContent);
  return makeManuscript({
    id: "44444444-5555-4666-8777-888888888888",
    mode: "nonfiction",
    title: "Building a Calm, Repeatable Publishing System for Creators Who Need Better Decisions, Stronger Drafts, Safer Review Gates, and Reliable Long-Form Delivery Across Every Reader, Storefront, and Device Without Wasting the Work Already Done",
    subtitle: "A practical field guide to manuscript architecture, export verification, publishing readiness, and sustainable release operations for independent authors and small creative teams",
    author: "Jordan Avery Mendoza",
    genre: "Business and writing reference",
    topic: "Reliable long-form publishing operations",
    audience: "Independent authors, creator-operators, and small publishing teams",
    keyPoints: "Architecture, review gates, export QA, storefront preflight, and release learning",
    sections,
  });
}
