import type { ComicFormat, VisualBookBrief, VisualBookKind } from "./visual-book-types";

/**
 * A storytelling playbook for each Mini Book Type and Comic Format. The type
 * the author picks decides how the book hooks, paces, turns pages, and ends,
 * so two types never produce the same shaped book.
 */
export type VisualPlaybook = {
  label: string;
  /** How the first content page earns the reader's attention. */
  hook: string;
  /** The arc from first page to last, scaled to any page count. */
  shape: string;
  /** How a page ends so the reader wants the next one. */
  pageTurn: string;
  /** Sentence, panel, and dialogue rhythm. */
  voice: string;
  /** What the final page must do. */
  ending: string;
};

export const VISUAL_KIND_PLAYBOOKS: Record<VisualBookKind, VisualPlaybook> = {
  "illustrated-story": {
    label: "Illustrated Story",
    hook: "Open inside a scene already in motion: one person, one place, one small specific action that hints something is wrong or about to change. No backstory first.",
    shape: "Opening image, a want, a complication that costs something, a quiet low point, a choice, then an echo of the opening image changed in meaning. Plant one recurring object or image early and let it return at least twice with new weight.",
    pageTurn: "End each page on an unanswered question, an interrupted action, or a detail the reader needs explained. Never end a middle page on a summary.",
    voice: "Concrete sensory detail over abstraction. Let one sentence per page be short enough to land like a held breath. Show feeling through action and objects, not by naming the emotion.",
    ending: "End on a resonant image or action that answers the opening, not on a stated moral. The reader should feel the meaning without being told it.",
  },
  "children-story": {
    label: "Children's Story",
    hook: "Meet a lovable character with one clear wish or worry in the first two sentences, in words a child would use.",
    shape: "Wish, three tries that grow bigger or funnier (the rule of three), a moment when it seems it will not work, a surprising kind or clever solution, and a warm return home or to calm.",
    pageTurn: "End pages with a question the child can answer aloud, a guess-what-happens-next beat, or the first half of a rhythm that the next page completes.",
    voice: "Read-aloud rhythm with short sentences. Give the story one refrain line that repeats with a small change each time. Use playful sound words and concrete nouns. Nothing frightening stays unresolved.",
    ending: "A cozy, earned ending that repeats the refrain one last time with a happy twist, and leaves a gentle feeling rather than a lecture.",
  },
  "visual-guide": {
    label: "Visual How-To",
    hook: "Show the finished result and the single biggest frustration it removes, so the reader immediately knows why to keep going.",
    shape: "Result first, what you need, then one clear step per page in the order a beginner would do them, a common mistake and its fix, and a final check that proves it worked.",
    pageTurn: "End each step with what the reader should now see or have, and one line that sets up why the next step matters.",
    voice: "Direct second person, one action verb leading each instruction. Include a specific tip, quantity, or timing on every page, and say why it matters in a few words.",
    ending: "A quick recap of the steps as a checklist feel, the most likely next thing to try, and an encouraging line that the reader can now do this alone.",
  },
  motivational: {
    label: "Motivational",
    hook: "Name a private feeling the reader has but rarely says out loud, in one plain sentence, before offering any encouragement.",
    shape: "Recognition of the struggle, a reframe that changes how it looks, one small proof from an ordinary moment, a single action small enough for today, and a line worth saving.",
    pageTurn: "End pages with a turn of thought that makes the reader pause, or a short question that points at their own life.",
    voice: "Honest and grounded, never preachy. No cliches, no shouting, no promises of guaranteed success. Each page builds to one quotable line of twelve words or fewer.",
    ending: "One small, concrete step the reader can take in the next ten minutes, followed by a closing line that feels like a hand on the shoulder.",
  },
  "recipe-activity": {
    label: "Recipe / Activity",
    hook: "Lead with the finished dish or result, the craving or occasion it fits, and the total time and difficulty in plain words.",
    shape: "The payoff, what you need grouped so it is easy to gather, steps in true working order with one step per page, a doneness or success check, and a way to serve, share, or vary it.",
    pageTurn: "End each step with the sensory cue that says it is ready (color, smell, texture, sound) and a hint of what comes next.",
    voice: "Friendly and exact. Give real quantities, times, and temperatures where the author supplied them, and never invent ones they did not. Add one helpful swap or shortcut where it fits.",
    ending: "The moment of enjoying or sharing it, one variation to try next time, and a warm invitation to make it their own.",
  },
  "book-teaser": {
    label: "Book Teaser",
    hook: "Open on the most intriguing moment or question of the larger book, with the lead character in real tension.",
    shape: "A striking scene, who this person is and what they want, the force against them, a glimpse of what is at stake, and a stop at the highest point of curiosity. Reveal the promise of the book, never its resolution.",
    pageTurn: "End every page by raising the stakes or opening a new question. Give away atmosphere and desire, hold back answers.",
    voice: "Match the tone of the full book. Use vivid, specific moments rather than summary, and let one line of dialogue or thought carry the character's voice.",
    ending: "Cut off at a cliffhanger or irresistible open question, then a clear, honest invitation to read the full book.",
  },
  "lead-magnet": {
    label: "Lead Magnet",
    hook: "State the reader's costly problem in their own words and promise one specific, believable result this short book delivers.",
    shape: "Problem and promise, why the usual approach fails, then one quick win per page that the reader can use at once, a simple way to put the wins together, and a natural bridge to the next step with the author.",
    pageTurn: "End each page with the result the reader gets from that win and a one-line reason the next win builds on it.",
    voice: "Clear, generous, and specific. Every page gives real value that works without buying anything. No hype, no invented statistics, testimonials, or credentials.",
    ending: "A short recap of what the reader can now do, then one clear call to action that follows from the value just delivered, stated without pressure.",
  },
  "product-guide": {
    label: "Product Guide",
    hook: "Start with the situation the customer is in before the product, and the outcome they want, before naming any feature.",
    shape: "The customer's situation, the outcome, how the product or service gets them there in a few plain steps, what makes it different in practice, what to expect after choosing it, and how to start.",
    pageTurn: "End each page by answering one likely question and raising the next natural one, the way a good conversation would.",
    voice: "Benefit first, then the feature that delivers it. Plain confident language, concrete use cases, and only claims the author supplied. Never invent prices, guarantees, reviews, or numbers.",
    ending: "A simple, low-friction next step (how to buy, book, or ask a question) and a reassurance about what happens after they take it.",
  },
};

export const COMIC_FORMAT_PLAYBOOKS: Record<ComicFormat, VisualPlaybook> = {
  classic: {
    label: "Classic Comic",
    hook: "Open on action or a bold situation in the first panel, with the hero's goal clear by the end of the first content page.",
    shape: "Setup with a clear goal, rising trouble, a setback, a turn where the hero uses something planted earlier, and a clean payoff.",
    pageTurn: "End each page on a mini cliffhanger panel: a reveal, a threat arriving, or a decision about to be made.",
    voice: "Two to four panels per page with one clear action each. Snappy dialogue under fifteen words a bubble, captions only for time and place, and a sound effect where impact matters.",
    ending: "A satisfying final panel that pays off the goal, with a closing line or small visual button that makes the reader smile or sit up.",
  },
  "graphic-novel": {
    label: "Graphic Novel",
    hook: "Open with a wide, atmospheric establishing panel and a single line of narration that carries a secret, regret, or question.",
    shape: "A quiet opening, an inciting disturbance, deepening conflict shown through character choices, a silent or near-silent emotional low point, and a resolution that changes the lead.",
    pageTurn: "End pages on a held image or an unfinished line, trusting the reader to feel the weight before turning.",
    voice: "One to three large panels per page. Sparse, literary captions and subtext-heavy dialogue. Use at least one wordless panel in the story where the art alone carries the emotion.",
    ending: "An ending that is earned and a little open, closing on an image that mirrors or reverses the first panel.",
  },
  romance: {
    label: "Romance Comic",
    hook: "Open with the two leads colliding (a meeting, a clash, or an awkward reunion) and an instant spark of tension.",
    shape: "Spark, growing closeness through small shared moments, a misunderstanding or fear that pulls them apart, a vulnerable honest moment, and a heartfelt coming together.",
    pageTurn: "End pages on a charged look, an almost-touch, an interrupted confession, or a line that could be read two ways.",
    voice: "Two to three panels per page with frequent close-ups on faces and hands. Dialogue with subtext and gentle banter, plus short inner-thought captions that show what a character cannot say aloud.",
    ending: "A warm emotional payoff that is earned by the honesty before it, keeping affection tender and non-explicit.",
  },
  noir: {
    label: "Dark Noir",
    hook: "Open with a hard-boiled first-person caption over a shadowed scene, and a problem that walks in the door.",
    shape: "A case or trouble arrives, each page uncovers a clue that complicates it, a betrayal or reversal, a confrontation in the dark, and a bittersweet truth.",
    pageTurn: "End each page on a new question, a new danger, or a detail that does not fit what the lead believed.",
    voice: "Two to three panels per page. Short, dry narration captions in the lead's voice, clipped dialogue where people hide what they mean, and silence used as tension.",
    ending: "The truth comes out but costs something. Close on a wry or weary final caption rather than a clean victory.",
  },
  manga: {
    label: "Manga-Inspired",
    hook: "Open with a striking moment of motion or emotion, and a lead whose determination or flaw shows at once.",
    shape: "An ordinary beat disrupted, a challenge that tests the lead's flaw, a moment of doubt, a burst of resolve, and a decisive emotional or physical breakthrough.",
    pageTurn: "Place a quiet, small panel just before a big reveal, and end pages on the reveal or on a reaction close-up.",
    voice: "Vary panel count sharply: several quick small beats, then one large impact panel. Lean on reaction close-ups, brief inner monologue, expressive sound effects, and minimal dialogue during action.",
    ending: "A cathartic final beat that shows growth, closing on the lead's expression or a quiet aftermath panel.",
  },
  children: {
    label: "Children's Comic",
    hook: "Open with a friendly character in a funny or curious situation that a child understands in one glance.",
    shape: "A simple problem, two playful attempts that go wrong in funny ways, a helpful friend or clever idea, and a happy solution everyone shares.",
    pageTurn: "End pages on a silly surprise or a 'what will happen?' moment that makes a child want to turn the page.",
    voice: "One to three big clear panels per page. Very short bubbles of simple words, fun sound effects, and visual gags a non-reader can follow. Kind humor only, nothing scary left unresolved.",
    ending: "A cheerful ending with a small laugh and a gentle feeling of friendship or bravery, without a lecture.",
  },
  webtoon: {
    label: "Webtoon",
    hook: "Open on a single arresting vertical moment with a hook line that makes scrolling irresistible.",
    shape: "Hook, quick setup of who and what is at stake, escalating beats with one twist, an emotional peak, and a strong episode-style ending.",
    pageTurn: "Make the last panel of every page a cliffhanger, a reveal, or a line that reframes the scene.",
    voice: "One story beat per panel, with room to breathe between beats. Short modern dialogue, inner thoughts in brief captions, and dramatic pauses created by a wordless panel before key moments.",
    ending: "A punchy closing panel that resolves this episode's question while leaving one thread that makes the reader want more.",
  },
  "comic-strip": {
    label: "Comic Strip",
    hook: "Establish the situation and the character's attitude in the very first panel, with no warm-up.",
    shape: "Each page is a self-contained gag built as setup, build, and punchline, while the pages together follow one light running theme with a callback at the end.",
    pageTurn: "The final panel of each page is the punchline or twist. Never explain the joke after it lands.",
    voice: "Three or four panels per page. Tight dialogue with the fewest possible words, a beat panel before the punchline when timing needs it, and humor that comes from character.",
    ending: "The last page calls back to the first gag with a twist, ending the set on its strongest laugh.",
  },
};

/** The playbook for the type or format the author picked. */
export function visualPlaybookFor(project: Pick<VisualBookBrief, "mode" | "kind" | "comicFormat">): VisualPlaybook {
  return project.mode === "comic"
    ? COMIC_FORMAT_PLAYBOOKS[project.comicFormat] ?? COMIC_FORMAT_PLAYBOOKS["graphic-novel"]
    : VISUAL_KIND_PLAYBOOKS[project.kind] ?? VISUAL_KIND_PLAYBOOKS["illustrated-story"];
}

/** Prompt text that makes the chosen type shape the whole book. */
export function visualPlaybookBlock(project: Pick<VisualBookBrief, "mode" | "kind" | "comicFormat">) {
  const playbook = visualPlaybookFor(project);
  return `READER ENGAGEMENT PLAYBOOK for ${playbook.label}. Follow it closely; it is what makes this type different from every other type.
Hook: ${playbook.hook}
Story shape: ${playbook.shape} Scale these beats to the page count so none is skipped and none is padded.
Page endings: ${playbook.pageTurn}
Voice and rhythm: ${playbook.voice}
Final page: ${playbook.ending}
The playbook never overrides the author's title, premise, facts, or the word and panel limits given below.`;
}
