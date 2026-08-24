import type { Mode } from "./book-types";
import {
  getCoverTitlePlacementPreset,
  getCoverTypographyPreset,
  resolveCoverTitlePlacement,
  resolveCoverTitleTypography,
} from "./cover-utils";
import type { VisualBookKind, VisualStyle } from "./visual-book-types";

export type CreativeGenre =
  | "literary-mystery"
  | "gothic-mystery"
  | "thriller"
  | "fantasy"
  | "romance"
  | "children-story"
  | "science-fiction"
  | "horror"
  | "historical-fiction"
  | "literary-fiction"
  | "self-help"
  | "business"
  | "memoir"
  | "spiritual-reflection"
  | "productivity"
  | "guide-how-to"
  | "lead-magnet"
  | "product-service-guide"
  | "general-nonfiction";

export type CreativeContext = {
  mode: Mode;
  title: string;
  subtitle?: string;
  author?: string;
  genre?: string;
  topic?: string;
  premise?: string;
  audience?: string;
  keyPoints?: string;
  kind?: string;
};

export const COVER_TEXT_MODE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "app-typography", label: "App Typography" },
  { id: "integrated-typography", label: "Integrated Typography" },
] as const;

export type CoverTextModeId =
  (typeof COVER_TEXT_MODE_OPTIONS)[number]["id"];

export type ResolvedCoverTextMode = Exclude<CoverTextModeId, "auto">;

export type VisualDirectionPreset = {
  label: string;
  mood: string;
  lighting: string;
  composition: string;
  subject: string;
  background: string;
  palette: string;
  typography: string;
  avoid: string;
  bestFor: string;
};

export const CREATIVE_COVER_FINISH_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "rain-soaked-gothic", label: "Rain-Soaked Gothic" },
  { id: "gothic-literary", label: "Gothic Literary" },
  { id: "cinematic-mystery", label: "Cinematic Mystery" },
  { id: "dark-academia", label: "Dark Academia" },
  { id: "emotional-memoir", label: "Emotional Memoir" },
  { id: "premium-nonfiction", label: "Premium Nonfiction" },
  { id: "founder-authority", label: "Founder Authority" },
  { id: "warm-storybook", label: "Warm Storybook" },
  { id: "minimal-literary", label: "Minimal Literary" },
  { id: "luxury-thriller", label: "Luxury Thriller" },
  { id: "dark-romance", label: "Dark Romance" },
  { id: "epic-fantasy", label: "Epic Fantasy" },
  { id: "clean-how-to", label: "Clean How-To" },
  { id: "product-guide-premium", label: "Product Guide Premium" },
] as const;

export type CreativeCoverFinishId =
  (typeof CREATIVE_COVER_FINISH_OPTIONS)[number]["id"];

export type CreativeCoverFinishPreset = {
  id: Exclude<CreativeCoverFinishId, "auto">;
  label: string;
  mood: string;
  composition: string;
  lighting: string;
  background: string;
  palette: string;
  typography: string;
  authorTypography: string;
  authorTreatment: "spaced-small-caps" | "classic" | "clean-authority" | "warm" | "grand";
  bestGenres: string;
  avoid: string;
};

const CREATIVE_COVER_FINISH_PRESETS: Record<
  Exclude<CreativeCoverFinishId, "auto">,
  CreativeCoverFinishPreset
> = {
  "rain-soaked-gothic": {
    id: "rain-soaked-gothic", label: "Rain-Soaked Gothic",
    mood: "literary, haunting, restrained, and visibly rain-darkened",
    composition: "a solitary foreground figure or symbolic object, an old house or window in the midground, and storm depth behind it",
    lighting: "cool storm light anchored by one warm glowing window or lamp",
    background: "wet glass, rain, mist, aged architecture, and uncluttered shadow",
    palette: "deep navy and teal shadows, forest green, ivory, muted gold, and one amber or burgundy accent",
    typography: "elegant cream, ivory, or muted-gold literary serif with generous breathing room",
    authorTypography: "premium spaced small caps, centered near the bottom in readable muted ivory",
    authorTreatment: "spaced-small-caps",
    bestGenres: "literary gothic mystery, family secrets, inheritance, grief, memory, and atmospheric suspense",
    avoid: "cartoon horror, gore, lightning overload, cheap haunted-house clichés, duplicate titles, internal labels, and crop bands",
  },
  "gothic-literary": {
    id: "gothic-literary", label: "Gothic Literary",
    mood: "quietly haunted, emotionally restrained, literary, and intimate",
    composition: "an atmospheric house, old room, threshold, or memory-bearing subject with deliberate negative space",
    lighting: "one dim warm practical light against cool teal, navy, or charcoal shadow",
    background: "old rooms, weathered architecture, dim lamps, mist, and family-history detail",
    palette: "dark teal, navy, charcoal, forest green, cream, and restrained warm amber",
    typography: "high-contrast elegant serif with calm hierarchy",
    authorTypography: "quiet spaced small caps with refined tracking and a safe bottom margin",
    authorTreatment: "spaced-small-caps",
    bestGenres: "gothic fiction, literary mystery, family secrets, grief, and memory-led fiction",
    avoid: "cheap horror clichés, theatrical ghosts, gore, distressed novelty type, and visual melodrama",
  },
  "cinematic-mystery": {
    id: "cinematic-mystery", label: "Cinematic Mystery",
    mood: "suspenseful, intelligent, premium, and unresolved",
    composition: "one strong foreground subject, clue-bearing midground, obscured background, and protected title zone",
    lighting: "high-contrast motivated light with one revealing highlight",
    background: "rain, glass, haze, architecture, or night depth used with restraint",
    palette: "navy, teal, forest green, charcoal, cream, and one amber accent",
    typography: "sharp premium serif or restrained cinematic display face",
    authorTypography: "subtle centered spaced small caps, cinematic and readable",
    authorTreatment: "spaced-small-caps",
    bestGenres: "mystery, suspense, psychological thriller, crime, and literary intrigue",
    avoid: "police-tape clichés, generic detectives, random clues, clutter, and lurid color",
  },
  "dark-academia": {
    id: "dark-academia", label: "Dark Academia",
    mood: "scholarly, secretive, tactile, and atmospheric",
    composition: "one architectural or scholarly focal point with formal depth and disciplined negative space",
    lighting: "candlelight or window light shaped through rain and shadow",
    background: "libraries, stone halls, rain-streaked windows, old books, and restrained academic detail",
    palette: "muted brown, navy, forest green, parchment, charcoal, and antique brass",
    typography: "refined classical serif with bookish authority",
    authorTypography: "classic small caps with measured tracking and academic restraint",
    authorTreatment: "classic",
    bestGenres: "campus mystery, literary suspense, historical secrets, and intellectual thrillers",
    avoid: "cluttered book piles, illegible background writing, costume parody, and sepia overload",
  },
  "emotional-memoir": {
    id: "emotional-memoir", label: "Emotional Memoir",
    mood: "intimate, truthful, warm, and emotionally controlled",
    composition: "one honest portrait, place, or meaningful object with generous breathing room",
    lighting: "soft natural light with one memory-bearing warm highlight",
    background: "tactile real-world context softened into supporting depth",
    palette: "warm cream, natural tones, deep green, navy, and muted amber",
    typography: "restrained literary serif or clean humanist sans",
    authorTypography: "personal, clean, elevated, and readable without severe spacing",
    authorTreatment: "classic",
    bestGenres: "memoir, grief, family history, personal growth, and reflective nonfiction",
    avoid: "performative sadness, melodrama, generic inspirational portraits, and false nostalgia",
  },
  "premium-nonfiction": {
    id: "premium-nonfiction", label: "Premium Nonfiction",
    mood: "credible, intelligent, clear, and outcome-focused",
    composition: "one strong central concept, disciplined grid, and generous editorial space",
    lighting: "clean dimensional editorial light",
    background: "white, cream, navy, or tactile minimal field with precise depth",
    palette: "deep green, navy, warm white, muted ink, and restrained mint",
    typography: "confident modern serif and sans hierarchy with a readable outcome-led subtitle",
    authorTypography: "clean professional authority treatment with moderate tracking",
    authorTreatment: "clean-authority",
    bestGenres: "self-help, productivity, education, business, and practical guides",
    avoid: "generic icons, stock handshakes, hype, crowded benefits, and empty corporate polish",
  },
  "founder-authority": {
    id: "founder-authority", label: "Founder Authority",
    mood: "decisive, modern, trusted, and premium",
    composition: "one credible founder, operational object, or outcome signal with sharp hierarchy",
    lighting: "controlled executive-editorial contrast with clean edge definition",
    background: "minimal architectural, operational, or abstract business depth",
    palette: "navy, deep green, charcoal, warm white, and one restrained metallic or blue accent",
    typography: "authoritative modern sans with a refined serif accent",
    authorTypography: "clean, confident authority line with restrained spacing",
    authorTreatment: "clean-authority",
    bestGenres: "business authority, founder stories, strategy, operations, and professional services",
    avoid: "fake corporate stock scenes, handshakes, money imagery, dashboards, and aggressive hype",
  },
  "warm-storybook": {
    id: "warm-storybook", label: "Warm Storybook",
    mood: "inviting, imaginative, emotionally clear, and tasteful",
    composition: "one clear character or setting performing one understandable story beat",
    lighting: "soft warm daylight or gentle practical light",
    background: "simple illustrated environment with a few meaningful details",
    palette: "warm cream, green, clear blue, sunny gold, and restrained coral",
    typography: "friendly high-legibility serif or rounded sans",
    authorTypography: "simple, warm, friendly, and easy to read",
    authorTreatment: "warm",
    bestGenres: "children's stories, family narratives, gentle fiction, and illustrated learning",
    avoid: "babyish clip art, chaotic props, muddy color, severe cinematic spacing, and tiny type",
  },
  "minimal-literary": {
    id: "minimal-literary", label: "Minimal Literary",
    mood: "quiet, intelligent, emotionally weighted, and refined",
    composition: "one symbolic object with abundant breathing room and intentional asymmetry",
    lighting: "precise soft light with tactile shadow",
    background: "sparse paper, wall, landscape, or material field with subtle depth",
    palette: "cream, muted ink, navy, forest green, and one restrained accent",
    typography: "elegant literary serif with disciplined scale",
    authorTypography: "small refined spaced caps, centered or grid-aligned safely",
    authorTreatment: "spaced-small-caps",
    bestGenres: "literary fiction, essays, poetry-adjacent prose, and quiet memoir",
    avoid: "empty symbolism, oversized decoration, novelty type, and template-like minimalism",
  },
  "luxury-thriller": {
    id: "luxury-thriller", label: "Luxury Thriller",
    mood: "intense, controlled, sleek, and expensive",
    composition: "one dominant threat, object, or silhouette with severe hierarchy and negative space",
    lighting: "deep blacks cut by a narrow metallic or cold highlight",
    background: "minimal night, architecture, smoke, or texture with cinematic depth",
    palette: "black, midnight navy, steel, muted gold, ivory, and one restrained danger accent",
    typography: "bold high-contrast title treatment with clean supporting type",
    authorTypography: "bold but controlled spaced caps below the action-safe zone",
    authorTreatment: "spaced-small-caps",
    bestGenres: "thrillers, espionage, crime, high-stakes suspense, and prestige action",
    avoid: "messy action collage, explosions, cheap metallic effects, and overcrowded typography",
  },
  "dark-romance": {
    id: "dark-romance", label: "Dark Romance",
    mood: "moody, intimate, sensual, and emotionally restrained",
    composition: "one silhouette, fabric detail, candle, rain window, or charged distance between figures",
    lighting: "soft shadow with warm candle or window highlights",
    background: "dark interior, rain, fabric, or architecture kept atmospheric rather than explicit",
    palette: "deep navy, charcoal, burgundy, forest green, ivory, and muted rose-gold",
    typography: "elegant serif with controlled sensuality",
    authorTypography: "elegant restrained spaced caps, never oversized",
    authorTreatment: "spaced-small-caps",
    bestGenres: "dark romance, romantic suspense, gothic romance, and emotionally intense fiction",
    avoid: "explicit imagery, melodramatic poses, rose clutter, cheap script type, and visual coercion",
  },
  "epic-fantasy": {
    id: "epic-fantasy", label: "Epic Fantasy",
    mood: "mythic, cinematic, immersive, and emotionally legible",
    composition: "one heroic symbol or figure against large-scale landscape and magical depth",
    lighting: "motivated magical light with readable atmospheric scale",
    background: "distinctive world architecture, landscape, sky, or elemental phenomenon",
    palette: "deep blue, forest green, charcoal, luminous gold, and one magical accent",
    typography: "ornate-but-readable serif with protected hierarchy",
    authorTypography: "grand clean small caps with restrained scale below the main artwork",
    authorTreatment: "grand",
    bestGenres: "epic fantasy, mythic adventure, portal fantasy, and high-concept speculative fiction",
    avoid: "overloaded armies, generic castles, unreadable ornament, and franchise imitation",
  },
  "clean-how-to": {
    id: "clean-how-to", label: "Clean How-To",
    mood: "practical, organized, bright, and trustworthy",
    composition: "one clear visual metaphor with simple hierarchy and direct subtitle support",
    lighting: "clean soft light with crisp separation",
    background: "bright cream, white, navy, or simple working context",
    palette: "navy, deep green, cream, white, and one useful accent",
    typography: "high-legibility sans or modern serif with clear instructional hierarchy",
    authorTypography: "clean readable professional line with minimal tracking",
    authorTreatment: "clean-authority",
    bestGenres: "how-to, productivity, education, workbooks, and practical self-help",
    avoid: "tool collages, tiny benefit lists, generic arrows, and busy instructional diagrams",
  },
  "product-guide-premium": {
    id: "product-guide-premium", label: "Product Guide Premium",
    mood: "direct, high-trust, polished, and commercially useful",
    composition: "one product, service outcome, or offer concept with disciplined editorial hierarchy",
    lighting: "premium clean studio or editorial light",
    background: "minimal brand-compatible environment with confident spacing",
    palette: "deep green, navy, warm white, charcoal, and one controlled product accent",
    typography: "modern offer-led hierarchy with a clear promise and restrained supporting copy",
    authorTypography: "credible professional attribution that never overpowers the offer",
    authorTreatment: "clean-authority",
    bestGenres: "product guides, service guides, lead magnets, offers, and customer education",
    avoid: "fake mockups, price-badge clutter, stock icons, excessive claims, and author dominance",
  },
};

const VISUAL_DIRECTION_PRESETS: Record<string, VisualDirectionPreset> = {
  "cinematic-editorial": {
    label: "Cinematic Editorial",
    mood: "emotionally precise, cinematic, restrained, and commercially polished",
    lighting: "one motivated key light with shaped shadow, atmospheric depth, and controlled highlights",
    composition: "one dominant focal subject with clear foreground, midground, and background separation plus a quiet title zone",
    subject: "specific to the book's central conflict or promise, never a generic genre stand-in",
    background: "story-relevant environment with selective detail and enough restraint to preserve hierarchy",
    palette: "deep navy, forest green, muted teal, warm cream, and one restrained emotional accent",
    typography: "genre-aware premium serif or disciplined editorial sans, readable at thumbnail size",
    avoid: "stock-photo posing, flat lighting, crowded symbolism, decorative filler, and competing focal points",
    bestFor: "literary fiction, mystery, memoir, premium narrative nonfiction, and book teasers",
  },
  "warm-storybook": {
    label: "Warm Storybook",
    mood: "inviting, emotionally legible, imaginative, and tasteful rather than sugary",
    lighting: "soft directional daylight or warm practical light with gentle dimensional modeling",
    composition: "one clear character or emotional action staged in a simple readable scene",
    subject: "expressive, age-appropriate, and grounded in a concrete story beat",
    background: "tactile illustrated environment with a few meaningful details and uncluttered depth",
    palette: "warm cream, leaf green, clear blue, muted coral, and natural golden light",
    typography: "friendly high-legibility serif or rounded sans with confident spacing",
    avoid: "neon overload, babyish decoration, chaotic props, generic smiling poses, and muddy color",
    bestFor: "children's stories, gentle memoir, family narratives, and warm instructional books",
  },
  "dark-luxury": {
    label: "Dark Luxury",
    mood: "controlled, elegant, mysterious, and premium",
    lighting: "deep shaped shadow with a narrow luminous edge or metallic highlight",
    composition: "minimal dominant subject, strong negative space, and deliberate asymmetry",
    subject: "one sophisticated person, object, or symbol carrying the book's emotional tension",
    background: "near-black or deep navy environment with subtle tactile depth",
    palette: "charcoal, deep forest green, navy, muted gold or copper, and restrained cream",
    typography: "high-contrast serif paired with a minimal sans, using metallic color sparingly",
    avoid: "cheap gradients, glossy plastic effects, ornamental overload, and unrelated luxury props",
    bestFor: "dark fiction, prestige thrillers, authority books, premium offers, and dramatic memoir",
  },
  "clean-modern": {
    label: "Clean Modern",
    mood: "clear, confident, intelligent, and contemporary",
    lighting: "crisp soft light with controlled contrast and clean tonal separation",
    composition: "strong grid, generous negative space, one decisive visual idea, and immediate hierarchy",
    subject: "a precise symbol, object, or human moment directly tied to the reader outcome",
    background: "minimal editorial field with subtle depth rather than an empty default backdrop",
    palette: "deep green, navy, warm white, muted ink, and one quiet supporting accent",
    typography: "confident editorial sans or modern serif with disciplined scale and spacing",
    avoid: "template-like icon piles, generic corporate stock imagery, visual noise, and weak contrast",
    bestFor: "business, productivity, self-help, practical guides, and lead magnets",
  },
  "bold-color": {
    label: "Bold Color",
    mood: "energetic, memorable, decisive, and commercially sharp",
    lighting: "graphic directional light with strong silhouette separation",
    composition: "one oversized focal shape or subject balanced by a protected title area",
    subject: "simple enough to recognize instantly and specific enough to belong only to this book",
    background: "controlled color field or simplified environment with purposeful depth",
    palette: "saturated green and blue anchored by dark navy, cream, and one limited contrasting accent",
    typography: "bold display type with a clean supporting face, never busy or novelty-driven",
    avoid: "rainbow palettes, equal-weight colors, small scattered elements, and poster-like clutter",
    bestFor: "creator guides, lead magnets, youth nonfiction, energetic how-to books, and commercial concepts",
  },
  "ink-noir": {
    label: "Ink Noir",
    mood: "tense, tactile, shadowed, and psychologically focused",
    lighting: "hard directional light, deep blacks, selective pale highlights, and rain or haze when story-relevant",
    composition: "dramatic silhouette or close focal detail with angular depth and controlled negative space",
    subject: "a morally or emotionally charged figure, object, or location rendered with expressive linework",
    background: "architectural shadow, weather, or sparse environmental clues rather than decorative texture",
    palette: "black ink, deep navy, muted green, parchment, and one restrained red-brown accent only when meaningful",
    typography: "sharp literary serif or restrained condensed display face with generous safe margins",
    avoid: "comic parody, random splatter, illegible darkness, pulp clichés, and excessive distressed effects",
    bestFor: "noir, crime, suspense, horror, graphic storytelling, and dark literary fiction",
  },
  "notebook-reflection": {
    label: "Notebook Reflection",
    mood: "human, reflective, tactile, intimate, and premium rather than childish",
    lighting: "soft natural desk light with gentle paper shadow and restrained warmth",
    composition: "layered journal page with one pinned photograph, purposeful field notes, and calm reading order",
    subject: "a truthful memory object, reflective portrait, place, or creative artifact tied to the page's meaning",
    background: "warm cream lined paper with subtle blue rules, tape or paperclip detail, and intentional breathing room",
    palette: "cream, deep forest green, navy blue, muted ink, and subtle kraft-paper warmth",
    typography: "readable editorial serif or sans with a small system-font handwritten note accent",
    avoid: "scrapbook clutter, childish doodles, fake handwriting overload, messy overlap, and novelty stationery",
    bestFor: "memoir, self-help, reflective guides, workbooks, personal growth, and creator lead magnets",
  },
  "real-person": {
    label: "Real Person",
    mood: "believable, emotionally specific, intimate, and editorial",
    lighting: "naturalistic cinematic portrait light with realistic skin tone and shaped environmental depth",
    composition: "one person as the unmistakable focal subject with a meaningful environment and clean title space",
    subject: "authentic expression, credible wardrobe, natural posture, realistic anatomy, and story-specific identity",
    background: "a location that reveals context without becoming a second subject",
    palette: "genre-led natural color graded toward navy, green, cream, and one controlled emotional accent",
    typography: "premium genre-appropriate type positioned away from the face and readable at thumbnail size",
    avoid: "plastic skin, uncanny eyes, malformed hands, glamour clichés, generic poses, and crowded groups",
    bestFor: "memoir, romance, literary fiction, founder books, and character-led commercial covers",
  },
  "minimal-object": {
    label: "Minimal Object",
    mood: "quiet, intelligent, symbolic, and premium",
    lighting: "precise studio or window light that reveals tactile material detail",
    composition: "one or two physical objects with generous negative space and disciplined scale",
    subject: "a book-specific object carrying the central tension or promise",
    background: "clean tactile surface with controlled shadow and no decorative filler",
    palette: "restrained app-palette green and navy with cream, charcoal, or natural material tones",
    typography: "clean editorial hierarchy with confident spacing",
    avoid: "generic desk props, icon collages, floating objects, fake mockups, and empty symbolism",
    bestFor: "premium nonfiction, literary fiction, business, productivity, and practical guides",
  },
  "fully-loaded": {
    label: "Fully Loaded",
    mood: "immersive, cinematic, high-stakes, and commercially bold",
    lighting: "one coherent dramatic light system linking every layer",
    composition: "foreground hero, story-rich midground, atmospheric background, and a protected title zone",
    subject: "multiple story-specific elements arranged around one dominant emotional focal point",
    background: "layered world-building with controlled depth and no unrelated spectacle",
    palette: "genre-led cinematic color with deep navy or charcoal anchoring the full scene",
    typography: "large unmistakable display title with simplified supporting copy",
    avoid: "random montage, equal-weight elements, collage seams, unreadable scale, and franchise imitation",
    bestFor: "fantasy, science fiction, thrillers, epic fiction, and high-concept commercial stories",
  },
  "signature-editorial": {
    label: "Signature Editorial",
    mood: "premium, concept-led, emotionally specific, and restrained",
    lighting: "sculpted editorial light with sophisticated depth and tactile finish",
    composition: "one memorable symbol or subject, strong hierarchy, and generous safe space",
    subject: "derived directly from the title and central promise rather than a category cliché",
    background: "deep atmospheric field or precise setting detail with quiet dimensional texture",
    palette: "dark forest green, deep navy, charcoal, warm parchment, muted gold, and restrained copper",
    typography: "classic premium serif or editorial sans with excellent thumbnail recognition",
    avoid: "neon color, generic category icons, rainbow palettes, ornamental clutter, and fake publisher marks",
    bestFor: "premium fiction, authority nonfiction, signature series, and commercially positioned releases",
  },
  "gothic-literary": {
    label: "Gothic Literary",
    mood: "rain-soaked, intimate, haunted by memory, emotionally quiet, and deeply atmospheric",
    lighting: "cool storm light with one warm glowing window or lamp as the emotional counterpoint",
    composition: "solitary foreground subject, old house or symbolic architecture in the midground, and weather-darkened depth behind it",
    subject: "a person or object carrying grief, secrecy, inheritance, memory, or return",
    background: "aged architecture, wet paths, shadowed rooms, rain, mist, or restrained overgrowth",
    palette: "deep navy and teal shadows, forest green, cream or muted gold type, and one burgundy or warm amber accent",
    typography: "elegant literary serif with cream or muted gold color and generous breathing room",
    avoid: "horror-poster gore, haunted-house clichés, crowded ghost imagery, bright fantasy color, and melodrama",
    bestFor: "gothic mystery, literary suspense, family secrets, grief stories, and memory-driven fiction",
  },
  "cinematic-mystery": {
    label: "Cinematic Mystery",
    mood: "suspenseful, intelligent, restrained, and visually unresolved",
    lighting: "high-contrast motivated light with shadowed negative space and a single revealing highlight",
    composition: "one dramatic subject in the foreground, a clue-bearing location in the midground, and obscured depth beyond",
    subject: "a person, object, threshold, or trace that poses a precise visual question",
    background: "rain, haze, glass, architecture, or night environment used only when relevant",
    palette: "navy, muted teal, forest green, charcoal, cream, and one controlled amber accent",
    typography: "sharp premium serif or restrained condensed face with strong thumbnail clarity",
    avoid: "police-tape clichés, generic detectives, random clues, action-poster clutter, and lurid color",
    bestFor: "mystery, suspense, psychological thriller, crime, and secret-driven literary fiction",
  },
  "emotional-memoir": {
    label: "Emotional Memoir",
    mood: "intimate, truthful, restrained, and emotionally present",
    lighting: "soft natural light with honest texture and one warm memory-bearing highlight",
    composition: "one portrait, place, or tactile object with quiet environmental context and generous breathing room",
    subject: "specific human detail that suggests lived experience without staging sentimentality",
    background: "real domestic, geographic, or archival context softened into supporting depth",
    palette: "warm cream, deep green, navy, natural skin tones, and muted amber",
    typography: "literary serif with restrained supporting sans and calm spacing",
    avoid: "performative sadness, generic inspirational poses, excessive blur, false nostalgia, and visual melodrama",
    bestFor: "memoir, grief, family history, personal growth, and reflective narrative nonfiction",
  },
  "premium-nonfiction": {
    label: "Premium Nonfiction",
    mood: "clear, credible, confident, and useful",
    lighting: "clean editorial light with subtle dimensionality and no decorative drama",
    composition: "one strong symbol or outcome-focused object, spacious hierarchy, and disciplined grid",
    subject: "a precise representation of the reader problem, method, or desired result",
    background: "minimal editorial field with subtle tactile depth",
    palette: "deep green, navy, warm white, muted ink, and a restrained mint or cream accent",
    typography: "authoritative modern serif or sans pairing with clear outcome-led hierarchy",
    avoid: "generic arrows, target icons, stock handshakes, motivational clichés, and crowded benefit lists",
    bestFor: "self-help, guides, productivity, business, practical education, and lead magnets",
  },
  "founder-business-authority": {
    label: "Founder/Business Authority",
    mood: "decisive, modern, trustworthy, and premium",
    lighting: "sharp editorial contrast with clean edge definition and controlled depth",
    composition: "one authority signal or outcome symbol with a confident title zone and minimal supporting detail",
    subject: "a credible founder portrait, product-relevant object, or concrete business transformation",
    background: "architectural, operational, or abstract depth kept disciplined and professional",
    palette: "navy, deep green, charcoal, warm white, and one restrained metallic or electric-blue accent",
    typography: "confident modern sans with a refined serif accent, optimized for thumbnail trust",
    avoid: "fake dashboards, stock boardrooms, handshakes, money rain, vague tech glow, and aggressive hype",
    bestFor: "business authority, founder stories, operations, product strategy, and professional services",
  },
  "children-warm-storybook": {
    label: "Children's Warm Storybook",
    mood: "bright, safe, curious, emotionally clear, and tasteful",
    lighting: "warm daylight with soft dimensional form and clear facial readability",
    composition: "one lovable character performing one understandable action in a simple scene",
    subject: "age-appropriate character design with expressive but believable emotion",
    background: "colorful story world simplified enough to support the action",
    palette: "clear green and blue, warm cream, sunny gold, and restrained coral",
    typography: "large friendly high-legibility lettering with ample spacing",
    avoid: "visual chaos, frightening detail, babyish clip art, tiny type, and overloaded rainbow color",
    bestFor: "children's fiction, educational stories, family activities, and early-reader books",
  },
};

const STYLE_ALIASES: Record<string, string> = {
  cinematic: "cinematic-editorial",
  "cinematic editorial": "cinematic-editorial",
  minimalist: "clean-modern",
  illustrated: "warm-storybook",
  "photoreal-title": "real-person",
  "real person": "real-person",
  "minimal-real-title": "minimal-object",
  "minimal object": "minimal-object",
  "fully-loaded-title": "fully-loaded",
  "fully loaded": "fully-loaded",
  "eb-signature": "signature-editorial",
  "eb signature": "signature-editorial",
  "gothic literary": "gothic-literary",
  "cinematic mystery": "cinematic-mystery",
  "emotional memoir": "emotional-memoir",
  "premium nonfiction": "premium-nonfiction",
  "founder business authority": "founder-business-authority",
  "children's warm storybook": "children-warm-storybook",
};

const COPY_FRAMEWORKS: Record<CreativeGenre, string> = {
  "literary-mystery": "Tone: intelligent, atmospheric, and emotionally precise. Subtitle: name the emotional terrain and mystery without explaining the plot. Blurb order: character and situation, destabilizing discovery, central question, personal stakes, reading-experience promise. Chapter names should carry image, tension, or consequence rather than generic plot labels.",
  "gothic-mystery": "Tone: intimate, rain-darkened, psychologically specific, and restrained. Subtitle: connect memory, place, grief, inheritance, or secrecy in one cover-readable line. Blurb order: return or confinement, uncanny disturbance, buried family conflict, emotional cost, promise of a slow-burning revelation. Chapter names should evoke rooms, weather, objects, thresholds, and consequences without becoming purple prose.",
  thriller: "Tone: urgent, precise, and credible. Subtitle or tagline: state the impossible pressure or dangerous choice without spoilers. Blurb order: capable protagonist, immediate disruption, escalating threat, closing trap, high-stakes reading promise. Chapter names should be short, active, and consequence-led.",
  fantasy: "Tone: immersive, concrete, and wonder-driven. Subtitle: signal the world-defining conflict or emotional quest without lore dumping. Blurb order: protagonist and world, rule-breaking event, opposing force, personal sacrifice, promise of discovery. Chapter names should use distinctive places, objects, vows, or reversals.",
  romance: "Tone: emotionally specific, intimate, and tension-led. Subtitle or tagline: identify the relationship obstacle or emotional contradiction, not a generic promise of love. Blurb order: lead one, lead two, forced collision, inner barriers, cost of choosing each other, emotional reading promise. Chapter names should track desire, resistance, vulnerability, and choice.",
  "children-story": "Tone: warm, clear, vivid, and age-appropriate. Subtitle: simple emotional adventure or learning promise. Blurb order: lovable character, understandable want, playful problem, brave choice, reassuring payoff. Chapter names should be concrete, memorable, and easy to read aloud.",
  "science-fiction": "Tone: conceptually sharp, human, and cinematic. Subtitle: connect the speculative idea to a human cost. Blurb order: protagonist and future condition, technological or social disruption, widening consequence, moral choice, promise of thought-provoking scale. Chapter names should combine precise world detail with tension.",
  horror: "Tone: controlled, unsettling, sensory, and psychologically credible. Subtitle: suggest the source of dread without explaining it. Blurb order: ordinary vulnerability, first violation, pattern of danger, inescapable cost, promise of escalating unease. Chapter names should be spare and ominously concrete.",
  "historical-fiction": "Tone: period-grounded, intimate, and consequential. Subtitle: locate the human conflict in its era without sounding academic. Blurb order: character and historical setting, disruptive event, social or political pressure, personal stakes, immersive reading promise. Chapter names should feel period-aware but immediately clear.",
  "literary-fiction": "Tone: observant, emotionally exact, and restrained. Subtitle: name the human tension, relationship, or place with specificity. Blurb order: character and condition, destabilizing change, deepening contradiction, emotional cost, promise of a resonant experience. Chapter names should carry image and consequence without vague abstraction.",
  "self-help": "Tone: empathetic, credible, practical, and calm. Subtitle: name the reader, desired outcome, and realistic path without promising a miracle. Description order: lived problem, who the book is for, specific transformation, usable method, grounded practical promise. Chapter names should move from recognition to practice to durable change.",
  business: "Tone: authoritative, outcome-led, specific, and evidence-conscious. Subtitle: state the business audience, operational result, and approach. Description order: costly problem, decision-maker, measurable direction, framework, practical implementation promise. Chapter names should name decisions, systems, leverage points, and outcomes.",
  memoir: "Tone: intimate, truthful, reflective, and unsentimental. Subtitle: identify the lived experience, emotional question, or defining place without overexplaining. Description order: life context, rupture, deeper question, personal stakes, promise of insight through honest story. Chapter names should use memory-bearing places, objects, moments, or realizations.",
  "spiritual-reflection": "Tone: contemplative, grounded, humane, and invitational. Subtitle: name the inner need and reflective practice without claiming certainty. Description order: spiritual tension, intended reader, perspective or practice, emotional shift, gentle practical promise. Chapter names should feel spacious, concrete, and sincere.",
  productivity: "Tone: direct, credible, practical, and low-hype. Subtitle: name the audience, friction removed, and usable system. Description order: daily bottleneck, who feels it, operating method, realistic outcome, immediate application. Chapter names should describe actions, constraints, systems, and review points.",
  "guide-how-to": "Tone: clear, useful, structured, and reassuring. Subtitle: state what the reader will accomplish, for whom, and within what practical scope. Description order: task or problem, intended user, sequence or method, concrete deliverables, confident practical promise. Chapter names should follow the actual workflow.",
  "lead-magnet": "Tone: concise, high-value, specific, and conversion-aware without hype. Subtitle: state the narrow outcome and exact audience. Description order: urgent pain point, immediate relevance, compact method, quick usable win, next logical action. Section names should be scannable and benefit-led.",
  "product-service-guide": "Tone: clear, trustworthy, benefit-led, and operational. Subtitle: name the user, use case, and result. Description order: customer problem, solution fit, how it works, proof or safeguards without invented claims, practical next step. Section names should map to decisions, features, workflow, and outcomes.",
  "general-nonfiction": "Tone: specific, credible, clear, and useful. Subtitle: communicate audience, outcome, and approach. Description order: problem, intended reader, transformation, method, trust-building limitation, practical promise. Chapter names should form a deliberate learning progression.",
};

export const COVER_ARTIFACT_GUARD =
  "Render the exact title once and only once. Never invent or render template placeholders, generic author/title/subtitle/tagline labels, lorem-ipsum copy, sample-copy labels, fake book-cover labels, or duplicate author lines. Do not add a second title, ghost title, background lettering, random readable background text, fake readable text, internal product or edition labels, publisher marks, logos, watermarks, random cropped title bands, decorative word fragments, borders, mockups, books, or devices. Keep image detail away from the title, subtitle, and author zones. Prevent author and subtitle overlap, never make the real author credit tiny or unreadable, and never place text in the generated image background unless the app typography layer intentionally owns it. Avoid distorted typography, malformed anatomy, low-resolution artifacts, generic stock-photo posing, and overcrowded composition.";

export const COVER_ARTWORK_NO_TEXT_GUARD =
  "IMAGE-ONLY ARTWORK. No text, no letters, no words, no typography, no title, no subtitle, no author name, no book-cover text, no text overlay, no signage, no labels, no watermark, no publisher mark, no readable symbols, no embedded words, no ghost text, and no placeholder text anywhere in the image. Leave clean visual safe areas for the separate app typography layer.";

export const INTEGRATED_COVER_TEXT_GUARD =
  "Render only these exact words as cover text. Preserve every supplied word and its spelling exactly. Use one title treatment, no duplicate title, no duplicate author, no extra readable text, no template or placeholder text, no internal product or edition labels, no invented publisher names, no fake publisher marks, no fake award seals, no logo, no watermark, no random background text, no ghost lettering, and no cropped text bands.";

const COVER_PLACEHOLDER_VALUE = /^(?:author name|your name|book title|title|subtitle|tagline|placeholder|lorem ipsum|sample text)$/i;

export function rejectCoverPlaceholderArtifacts(text: string | undefined) {
  return COVER_PLACEHOLDER_VALUE.test(String(text ?? "").trim());
}

export function stripCoverPlaceholderText(text: string | undefined) {
  const clean = String(text ?? "").trim().replace(/\s+/g, " ");
  return rejectCoverPlaceholderArtifacts(clean) ? "" : clean;
}

export function validateCoverPromptForPlaceholders(prompt: string) {
  const explicitTemplateArtifact = /\b(?:author name|your name|book title|lorem ipsum|sample text)\b/i;
  const standaloneTemplateLabel = /(?:^|\n)\s*(?:title|subtitle|tagline|placeholder)\s*(?::|$)/im;
  return !explicitTemplateArtifact.test(prompt) && !standaloneTemplateLabel.test(prompt);
}

export function sanitizeCoverArtworkDirection(text: string | undefined) {
  const clean = String(text ?? "").trim().slice(0, 900);
  if (!clean) return "";
  const textInstruction = /\b(?:title|subtitle|author|text|typograph\w*|lettering|words?|labels?|signage|watermark)\b/i;
  return clean
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => sentence.trim() && !textInstruction.test(sentence))
    .join(" ")
    .trim();
}

export function sanitizeIntegratedTypographyPrompt(text: string | undefined) {
  return sanitizeCoverArtworkDirection(text)
    .replace(/\b(?:EB Studio Pro|KDP Edition)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateCoverArtworkPrompt(prompt: string) {
  const required = [
    /IMAGE-ONLY ARTWORK/i,
    /no text/i,
    /no letters/i,
    /no words/i,
    /no typography/i,
    /no title/i,
    /no subtitle/i,
    /no author name/i,
    /no watermark/i,
  ];
  const unsafePositiveInstruction = [
    /render\s+(?:the\s+)?(?:title|subtitle|author)/i,
    /(?:title|subtitle|author)\s+(?:at|near|along)\s+(?:the\s+)?(?:top|bottom|image)/i,
    /(?:serif|sans|display)\s+title/i,
  ];
  return required.every((pattern) => pattern.test(prompt)) &&
    unsafePositiveInstruction.every((pattern) => !pattern.test(prompt));
}

export function validateIntegratedTypographyPrompt(prompt: string) {
  const required = [
    /complete customer-facing book cover/i,
    /render only these exact words as cover text/i,
    /preserve every supplied word and its spelling exactly/i,
    /no duplicate title/i,
    /no duplicate author/i,
    /no extra readable text/i,
    /no watermark/i,
    /no internal product or edition labels/i,
    /no fake publisher marks/i,
    /no random background text/i,
  ];
  const mixedModeInstruction = [
    /IMAGE-ONLY ARTWORK/i,
    /the app adds all official typography afterward/i,
  ];
  return required.every((pattern) => pattern.test(prompt)) &&
    mixedModeInstruction.every((pattern) => !pattern.test(prompt));
}

export function validateCoverTextModePayload(value: unknown) {
  return value === undefined || value === null || COVER_TEXT_MODE_OPTIONS.some(
    (option) => option.id === value,
  );
}

function normalize(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function contextText(context: CreativeContext) {
  return [
    context.title,
    context.subtitle,
    context.genre,
    context.topic,
    context.premise,
    context.audience,
    context.keyPoints,
    context.kind,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function inferCreativeGenre(context: CreativeContext): CreativeGenre {
  const text = contextText(context);
  if (context.mode === "fiction") {
    if (/gothic|haunt|old house|mansion|manor|remembered rain|family secret|ancestral|inheritance/.test(text)) return "gothic-mystery";
    if (/literary mystery|quiet mystery|mystery|secret|disappearance|missing/.test(text)) return "literary-mystery";
    if (/thriller|conspiracy|assassin|killer|pursuit|chase|hostage/.test(text)) return "thriller";
    if (/horror|terror|nightmare|demon|possession|monster/.test(text)) return "horror";
    if (/science fiction|sci-fi|space|planet|android|cyber|time travel|dystop/.test(text)) return "science-fiction";
    if (/fantasy|magic|dragon|kingdom|witch|sorcer|fae|mythic/.test(text)) return "fantasy";
    if (/romance|romantic|romantasy|love story|second chance|enemies to lovers/.test(text)) return "romance";
    if (/children|childrens|kid|picture book|middle grade|bedtime/.test(text)) return "children-story";
    if (/historical|victorian|regency|world war|century|colonial/.test(text)) return "historical-fiction";
    return "literary-fiction";
  }
  if (/memoir|my life|grief|bereavement|personal story|lived experience/.test(text)) return "memoir";
  if (/spiritual|reflection|faith|prayer|meaning|meditation/.test(text)) return "spiritual-reflection";
  if (/lead magnet|free guide|client attraction|creator|coach/.test(text)) return "lead-magnet";
  if (/product guide|service guide|customer guide|\boffer\b|\bproduct\b/.test(text)) return "product-service-guide";
  if (/business|founder|leadership|sales|marketing|operations|revenue|company/.test(text)) return "business";
  if (/productivity|focus|time management|workflow|habit|planning/.test(text)) return "productivity";
  if (/self-help|personal growth|confidence|healing|mindset|boundaries/.test(text)) return "self-help";
  if (/guide|how to|handbook|manual|workbook|step by step/.test(text)) return "guide-how-to";
  return "general-nonfiction";
}

function inferredPremiumPreset(genre: CreativeGenre) {
  if (genre === "gothic-mystery") return "gothic-literary";
  if (["literary-mystery", "thriller", "horror"].includes(genre)) return "cinematic-mystery";
  if (genre === "memoir") return "emotional-memoir";
  if (genre === "business") return "founder-business-authority";
  if (["self-help", "productivity", "guide-how-to", "lead-magnet", "product-service-guide", "general-nonfiction"].includes(genre)) return "premium-nonfiction";
  if (genre === "children-story") return "children-warm-storybook";
  return "cinematic-editorial";
}

const CREATIVE_FINISH_ALIASES: Record<string, CreativeCoverFinishId> = {
  auto: "auto",
  "rain soaked gothic": "rain-soaked-gothic",
  "rain-soaked-gothic": "rain-soaked-gothic",
  "gothic literary": "gothic-literary",
  "gothic-literary": "gothic-literary",
  "cinematic mystery": "cinematic-mystery",
  "cinematic-mystery": "cinematic-mystery",
  "dark academia": "dark-academia",
  "dark-academia": "dark-academia",
  "emotional memoir": "emotional-memoir",
  "emotional-memoir": "emotional-memoir",
  "premium nonfiction": "premium-nonfiction",
  "premium-nonfiction": "premium-nonfiction",
  "founder authority": "founder-authority",
  "founder-authority": "founder-authority",
  "founder business authority": "founder-authority",
  "founder/business authority": "founder-authority",
  "founder-business-authority": "founder-authority",
  "warm storybook": "warm-storybook",
  "warm-storybook": "warm-storybook",
  "minimal literary": "minimal-literary",
  "minimal-literary": "minimal-literary",
  "luxury thriller": "luxury-thriller",
  "luxury-thriller": "luxury-thriller",
  "dark romance": "dark-romance",
  "dark-romance": "dark-romance",
  "epic fantasy": "epic-fantasy",
  "epic-fantasy": "epic-fantasy",
  "clean how to": "clean-how-to",
  "clean-how-to": "clean-how-to",
  "product guide premium": "product-guide-premium",
  "product-guide-premium": "product-guide-premium",
};

export function resolveCreativeCoverFinishId(value: string | undefined): CreativeCoverFinishId {
  const normalized = normalize(value);
  const key = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return CREATIVE_FINISH_ALIASES[normalized] ?? CREATIVE_FINISH_ALIASES[key] ?? "auto";
}

export function inferCreativeCoverFinish(context: CreativeContext): Exclude<CreativeCoverFinishId, "auto"> {
  const genre = inferCreativeGenre(context);
  const text = contextText(context);
  if (genre === "gothic-mystery") {
    return /rain|storm|thunder|window|wet|mist/.test(text)
      ? "rain-soaked-gothic"
      : "gothic-literary";
  }
  if (genre === "literary-mystery") return "cinematic-mystery";
  if (genre === "thriller" || genre === "horror") return "luxury-thriller";
  if (genre === "fantasy") return "epic-fantasy";
  if (genre === "romance") return "dark-romance";
  if (genre === "children-story") return "warm-storybook";
  if (genre === "memoir" || genre === "spiritual-reflection") return "emotional-memoir";
  if (genre === "business") return "founder-authority";
  if (genre === "guide-how-to" || genre === "productivity") return "clean-how-to";
  if (genre === "product-service-guide" || genre === "lead-magnet") return "product-guide-premium";
  if (context.mode === "nonfiction") return "premium-nonfiction";
  return "minimal-literary";
}

export function getCreativeCoverFinishPreset(
  value: string | undefined,
  context: CreativeContext,
) {
  const requested = resolveCreativeCoverFinishId(value);
  const id = requested === "auto" ? inferCreativeCoverFinish(context) : requested;
  return CREATIVE_COVER_FINISH_PRESETS[id];
}

const INTEGRATED_AUTO_FINISHES = new Set<CreativeCoverFinishPreset["id"]>([
  "rain-soaked-gothic",
  "gothic-literary",
  "cinematic-mystery",
  "dark-academia",
  "luxury-thriller",
  "dark-romance",
  "epic-fantasy",
]);

const APP_TYPOGRAPHY_AUTO_FINISHES = new Set<CreativeCoverFinishPreset["id"]>([
  "premium-nonfiction",
  "founder-authority",
  "clean-how-to",
  "product-guide-premium",
]);

export function resolveCoverTextMode(input: CreativeContext & {
  coverTextMode?: string;
  creativeFinish?: string;
  customDirection?: string;
}): ResolvedCoverTextMode {
  if (input.coverTextMode === "integrated-typography") return "integrated-typography";
  if (input.coverTextMode === "app-typography") return "app-typography";

  const customDirection = normalize(input.customDirection);
  if (/\b(?:no|without|avoid)\s+(?:any\s+)?(?:text|letters|words|typography)\s+(?:in|inside|on)\s+(?:the\s+)?(?:image|artwork|background)\b/.test(customDirection)) {
    return "app-typography";
  }
  if (/\b(?:integrated title|integrated typography|typography in (?:the )?artwork|title in (?:the )?(?:image|artwork))\b/.test(customDirection)) {
    return "integrated-typography";
  }

  const finish = getCreativeCoverFinishPreset(input.creativeFinish, input).id;
  if (APP_TYPOGRAPHY_AUTO_FINISHES.has(finish) || input.mode !== "fiction") {
    return "app-typography";
  }
  if (INTEGRATED_AUTO_FINISHES.has(finish)) return "integrated-typography";
  return "app-typography";
}

export function shouldOverlayCoverText(input: CreativeContext & {
  coverTextMode?: string;
  creativeFinish?: string;
  customDirection?: string;
}) {
  return resolveCoverTextMode(input) === "app-typography";
}

export function describeCreativeCoverFinish(
  value: string | undefined,
  context: CreativeContext,
  includeTypography = true,
) {
  const preset = getCreativeCoverFinishPreset(value, context);
  return [
    `Creative cover finish: ${preset.label}.`,
    `Market mood: ${preset.mood}.`,
    `Cover composition: ${preset.composition}.`,
    `Finish lighting: ${preset.lighting}.`,
    `Finish background: ${preset.background}.`,
    `Finish palette: ${preset.palette}.`,
    includeTypography ? `Title typography: ${preset.typography}.` : "",
    includeTypography ? `Author typography: ${preset.authorTypography}.` : "",
    `Best genres: ${preset.bestGenres}.`,
    `Finish exclusions: ${preset.avoid}.`,
  ].filter(Boolean).join(" ");
}

export function formatPremiumCoverAuthor(
  author: string,
  value: string | undefined,
  context: CreativeContext,
) {
  const preset = getCreativeCoverFinishPreset(value, context);
  const clean = stripCoverPlaceholderText(author);
  if (!clean) return "";
  if (preset.authorTreatment !== "spaced-small-caps" && preset.authorTreatment !== "grand") {
    return clean.toUpperCase();
  }
  return clean
    .toUpperCase()
    .split(" ")
    .map((word) => Array.from(word).join(" "))
    .join("   ");
}

export function getVisualDirectionPreset(style: string | undefined) {
  const key = normalize(style).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const alias = STYLE_ALIASES[normalize(style)] ?? STYLE_ALIASES[key] ?? key;
  return VISUAL_DIRECTION_PRESETS[alias] ?? VISUAL_DIRECTION_PRESETS["cinematic-editorial"];
}

export function describeVisualDirection(style: string | undefined, includeTypography = true) {
  const preset = getVisualDirectionPreset(style);
  return [
    `Preset: ${preset.label}.`,
    `Mood: ${preset.mood}.`,
    `Lighting: ${preset.lighting}.`,
    `Composition: ${preset.composition}.`,
    `Subject treatment: ${preset.subject}.`,
    `Background treatment: ${preset.background}.`,
    `Color palette: ${preset.palette}.`,
    includeTypography ? `Typography direction: ${preset.typography}.` : "",
    `Avoid: ${preset.avoid}.`,
    `Best use: ${preset.bestFor}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildCopywritingGuidance(context: CreativeContext) {
  const genre = inferCreativeGenre(context);
  return `Creative category: ${genre.replace(/-/g, " ")}. ${COPY_FRAMEWORKS[genre]} Copy must be specific, emotionally clear, commercially usable, and genre-aware. Avoid generic filler, empty hype, repeated title wording, robotic summaries, cliché-heavy promises, and vague journey-of-discovery language. Never invent facts, credentials, research, statistics, or plot events.`;
}

function titleAwareSymbols(context: CreativeContext, genre: CreativeGenre) {
  const text = contextText(context);
  const cues: string[] = [];
  if (/rain|storm|downpour|monsoon/.test(text)) cues.push("make visible rain, wet surfaces, and rain-streaked atmosphere part of the composition rather than merely implied");
  if (/house|home|room|mansion|manor/.test(text)) cues.push("use an old house, charged room, doorway, or window as meaningful architecture rather than generic scenery");
  if (/memory|remember|grief|loss|inherit/.test(text)) cues.push("use one memory-bearing detail such as a lit window, threshold, photograph, key, or weathered object");
  if (/garden|green|blue|flower|tree|vine/.test(text)) cues.push("make the garden or plant life an active symbolic layer with deliberate green and blue color relationships");
  if (/war|conflict|battle|argument|division/.test(text)) cues.push("express conflict through distance, opposing light, divided space, or one strained human gesture rather than literal warfare unless the premise requires it");
  if (/book|writer|letter|journal|notebook/.test(text)) cues.push("use paper, handwriting tools, or a book-related object only when it carries the story's actual tension");
  if (genre === "gothic-mystery") cues.push("include one warm glowing window or lamp against deep navy and teal storm light");
  return cues.length
    ? cues.join("; ")
    : "derive one unmistakable visual symbol from the exact title and premise, then make it carry the emotional conflict";
}

function subjectDirection(context: CreativeContext, genre: CreativeGenre) {
  const text = contextText(context);
  if (genre === "gothic-mystery") {
    const woman = /woman|daughter|mother|sister|widow|\bshe\b|\bher\b/.test(text);
    return `${woman ? "a solitary believable woman" : "one solitary believable adult figure or memory-bearing object"} in the foreground, emotionally restrained rather than theatrically posed`;
  }
  if (genre === "memoir") return "one honest portrait, place, or tactile object that feels lived-in and emotionally specific";
  if (genre === "business") return "one credible founder, operational object, or outcome symbol directly tied to the book's promise";
  if (genre === "children-story") return "one clear, appealing character performing a single understandable story action";
  if (["self-help", "productivity", "guide-how-to", "lead-magnet", "product-service-guide", "general-nonfiction"].includes(genre)) return "one precise object, symbol, or human moment that makes the reader outcome immediately understandable";
  return "one emotionally charged person, object, or place that belongs specifically to this book";
}

type CoverPromptInput = CreativeContext & {
  style?: string;
  finishDirection: string;
  creativeFinish?: string;
  customDirection?: string;
  coverTextMode?: string;
  titleTypography?: string;
  titlePlacement?: string;
};

export function buildCoverTypographyLayout(input: CreativeContext & {
  creativeFinish?: string;
  style?: string;
  titleTypography?: string;
  titlePlacement?: string;
  coverTextMode?: string;
  customDirection?: string;
}) {
  const resolvedTextMode = resolveCoverTextMode({
    ...input,
    coverTextMode: input.coverTextMode ?? "app-typography",
  });
  if (resolvedTextMode === "integrated-typography") {
    return "INTEGRATED TYPOGRAPHY METADATA ONLY. The generated cover owns the single final title, subtitle, and author treatment. Disable the app text overlay for preview and final customer-facing output. Preserve the generated cover image without adding a second text layer.";
  }

  const preset = getCreativeCoverFinishPreset(input.creativeFinish, input);
  const directionContext = {
    mode: input.mode,
    title: input.title,
    genre: input.genre,
    premise: input.premise,
    topic: input.topic,
    creativeFinish: preset.id,
    style: input.style,
  };
  const titleTypography = resolveCoverTitleTypography(
    input.titleTypography,
    directionContext,
  );
  const typography = getCoverTypographyPreset(titleTypography);
  const titlePlacement = resolveCoverTitlePlacement(
    input.titlePlacement,
    directionContext,
  );
  const placement = getCoverTitlePlacementPreset(
    titlePlacement,
    directionContext,
  );
  const title = stripCoverPlaceholderText(input.title);
  const subtitle = stripCoverPlaceholderText(input.subtitle);
  const author = formatPremiumCoverAuthor(input.author ?? "", preset.id, input);
  return [
    "APP TYPOGRAPHY LAYER ONLY. Never send these instructions to the artwork image model.",
    `Title typography preset: ${typography.label}. ${typography.description ?? preset.typography}`,
    `Title placement preset: ${placement.label}. ${placement.description}`,
    title ? `Official title: “${title}”. Render it once with balanced complete lines, refined tracking, readable contrast, and no ellipsis or cropping.` : "Omit the title because no valid title was supplied.",
    subtitle ? `Official subtitle: “${subtitle}”. Keep it complete, readable, and separate from the title.` : "Omit the subtitle.",
    author ? `Official author: “${author}”. Render once using ${preset.authorTypography}.` : "Omit the author line.",
    "Keep title, subtitle, and author in separate safe zones with no overlap, duplication, cropping, or placeholder text. Preserve trim-safe margins and move text to the nearest safe zone if the selected layout would collide.",
  ].join(" ");
}

export function buildAppTypographyCoverPrompt(input: CoverPromptInput) {
  const genre = inferCreativeGenre(input);
  const selectedPreset = getVisualDirectionPreset(input.style);
  const genrePreset = getVisualDirectionPreset(inferredPremiumPreset(genre));
  const creativeFinishPreset = getCreativeCoverFinishPreset(input.creativeFinish, input);
  const premise = input.mode === "fiction"
    ? input.premise || "Use the title and genre as the authoritative story context."
    : input.topic || input.keyPoints || "Use the title and reader promise as the authoritative subject context.";
  const custom = sanitizeCoverArtworkDirection(input.customDirection);
  const customBlock = custom
    ? `Author scene request, highest priority for visual content: ${custom}\nHonor every safe visual element and exclusion. The image-only rule always overrides requests for readable text.`
    : "No custom scene request was supplied. Build the concept from the title, premise, genre, and audience.";

  return `Create original image-only front-cover artwork for a premium ${input.mode === "fiction" ? "fiction" : "non-fiction"} book. This generation produces the artwork layer only; the app adds all official typography afterward.

Story and market context:
Creative category: ${genre.replace(/-/g, " ")}
Premise or reader promise: ${premise}
Target reader: ${input.audience || "General readers"}

Selected visual direction:
${describeVisualDirection(selectedPreset.label, false)}

Genre-specific elevation:
${describeVisualDirection(genrePreset.label, false)}

Market/design finish:
${describeCreativeCoverFinish(creativeFinishPreset.id, input, false)}

Title-aware symbols: ${titleAwareSymbols(input, genre)}.
Emotional subject: ${subjectDirection(input, genre)}.
Foreground: place the emotional subject or primary symbolic object here with immediate thumbnail recognition.
Midground: show the specific location, relationship, method, or story evidence that gives the title meaning.
Background: use restrained atmosphere and depth that support the concept without becoming a second cover.
Lighting and palette: combine the genre-specific elevation and selected market/design finish, keep one motivated light source, and reserve one warm or contrasting accent for emotional focus.
Artwork layout: protect generous clean visual space near the top and bottom for the app-owned typography layer, but place no readable marks in those areas.
Surface/print finish: ${input.finishDirection}.

${customBlock}

Compose for a 5:8 portrait cover. Keep all important subjects inside the central 85% safe area. Preserve uncluttered negative space and strong image recognition at thumbnail size.

	${COVER_ARTWORK_NO_TEXT_GUARD}`;
}

export function buildIntegratedTypographyCoverPrompt(input: CoverPromptInput) {
  const genre = inferCreativeGenre(input);
  const selectedPreset = getVisualDirectionPreset(input.style);
  const genrePreset = getVisualDirectionPreset(inferredPremiumPreset(genre));
  const creativeFinishPreset = getCreativeCoverFinishPreset(input.creativeFinish, input);
  const premise = input.mode === "fiction"
    ? input.premise || "Use the supplied genre and story context as the authoritative concept."
    : input.topic || input.keyPoints || "Use the supplied reader promise as the authoritative subject context.";
  const title = stripCoverPlaceholderText(input.title);
  const subtitle = stripCoverPlaceholderText(input.subtitle);
  const author = stripCoverPlaceholderText(input.author);
  const exactText = [title, subtitle, author]
    .filter(Boolean)
    .map((value) => `“${value}”`)
    .join("\n");
  const directionContext = {
    mode: input.mode,
    title,
    genre: input.genre,
    premise: input.premise,
    topic: input.topic,
    creativeFinish: creativeFinishPreset.id,
    style: input.style,
  };
  const typography = getCoverTypographyPreset(resolveCoverTitleTypography(
    input.titleTypography,
    directionContext,
  ));
  const placement = getCoverTitlePlacementPreset(resolveCoverTitlePlacement(
    input.titlePlacement,
    directionContext,
  ), directionContext);
  const custom = sanitizeIntegratedTypographyPrompt(input.customDirection);
  const customBlock = custom
    ? `Author scene request, highest priority for visual content: ${custom}\nHonor every safe visual element and exclusion. The exact-cover-text rules override any request for other readable words.`
    : "No custom scene request was supplied. Build the concept from the story, genre, and audience.";

  return `Create an original complete customer-facing book cover for a premium ${input.mode === "fiction" ? "fiction" : "non-fiction"} book. Generate the finished cover as one integrated image with its official typography already designed into the artwork. The app text overlay will remain disabled.

Story and market context:
Creative category: ${genre.replace(/-/g, " ")}
Premise or reader promise: ${premise}
Target reader: ${input.audience || "General readers"}

Selected visual direction:
${describeVisualDirection(selectedPreset.label, true)}

Genre-specific elevation:
${describeVisualDirection(genrePreset.label, true)}

Market/design finish:
${describeCreativeCoverFinish(creativeFinishPreset.id, input, true)}

Exact cover text:
Render only these exact words as cover text:
${exactText}

Typography composition:
Use ${typography.label} for the title treatment and ${placement.label} for its primary placement. Preserve the wording and spelling exactly; capitalization, scale, tracking, and line breaks may serve the design without changing any word. Treat the author with ${creativeFinishPreset.authorTypography}. Keep one readable title treatment, one subtitle treatment only when supplied, and one author treatment only when supplied.

Title-aware symbols: ${titleAwareSymbols(input, genre)}.
Emotional subject: ${subjectDirection(input, genre)}.
Foreground: place the emotional subject or primary symbolic object here with immediate thumbnail recognition.
Midground: show the specific location, relationship, method, or story evidence that gives the concept meaning.
Background: use restrained atmosphere and depth, with no readable environmental lettering or decorative word fragments.
Lighting and palette: combine the genre-specific elevation and selected market/design finish, keep one motivated light source, and reserve one warm or contrasting accent for emotional focus.
Surface/print finish: ${input.finishDirection}.

${customBlock}

Compose for a 5:8 portrait cover. Keep all important subjects and every official text line inside the central 85% safe area. Maintain readable hierarchy at thumbnail size and protect all cover text from trim, cropping, collision, distortion, or ghost duplication.

${INTEGRATED_COVER_TEXT_GUARD}`;
}

export function buildCoverPrompt(input: CoverPromptInput) {
  const resolvedTextMode = resolveCoverTextMode({
    ...input,
    coverTextMode: input.coverTextMode ?? "app-typography",
  });
  return resolvedTextMode === "integrated-typography"
    ? buildIntegratedTypographyCoverPrompt(input)
    : buildAppTypographyCoverPrompt(input);
}

export function buildVisualArtworkDirection(context: CreativeContext, style: string | undefined) {
  const genre = inferCreativeGenre(context);
  const selected = getVisualDirectionPreset(style);
  const genrePreset = getVisualDirectionPreset(inferredPremiumPreset(genre));
  return `${describeVisualDirection(selected.label, false)} Genre-aware layer: ${describeVisualDirection(genrePreset.label, false)} Title-aware visual cues: ${titleAwareSymbols(context, genre)}. Keep the scene premium, readable, and specific to this book.`;
}

export function buildAskEBCreativeGuidance(context: CreativeContext) {
  const recommendedFinish = getCreativeCoverFinishPreset("auto", context);
  const titleTypography = getCoverTypographyPreset(resolveCoverTitleTypography("auto", {
    mode: context.mode,
    title: context.title,
    genre: context.genre,
    premise: context.premise,
    topic: context.topic,
    creativeFinish: recommendedFinish.id,
  }));
  return `${buildCopywritingGuidance(context)} Infer the most precise genre or subgenre supported by the title and premise. For fiction subtitles, write one atmospheric, emotionally specific, cover-readable sentence fragment or sentence without repeating the title. For non-fiction subtitles, state the outcome, intended reader, and credible method in one cover-readable line. When writing a blurb, follow the genre framework above instead of producing a generic summary. When suggesting a cover, recommend a Cover Style, surface Cover Finish, Creative Cover Finish, Title Typography, and Title Placement; the current best-fit Creative Cover Finish is ${recommendedFinish.label}, with ${titleTypography.label} as the title treatment. Specify one focal subject, foreground, midground, background, motivated lighting, restrained palette, title typography, title placement, author treatment, and explicit negative constraints. For gothic or cinematic fiction, recommend premium spaced small caps for the author; for nonfiction or business, recommend a clean authority treatment; for children's stories, recommend a simple warm readable author line. For a visual mini-book setup, recommend one existing mini-book type and one existing visual direction that can be applied immediately. Prefer fewer decisive fields over generic filler.`;
}

export function resolveVisualStyleId(value: string): VisualStyle | null {
  const key = normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const exact: Record<string, VisualStyle> = {
    "cinematic-editorial": "cinematic-editorial",
    "cinematic-mystery": "cinematic-editorial",
    "gothic-literary": "cinematic-editorial",
    "emotional-memoir": "cinematic-editorial",
    "warm-storybook": "warm-storybook",
    "children-s-warm-storybook": "warm-storybook",
    "children-warm-storybook": "warm-storybook",
    "dark-luxury": "dark-luxury",
    "clean-modern": "clean-modern",
    "premium-nonfiction": "clean-modern",
    "founder-business-authority": "clean-modern",
    "bold-color": "bold-color",
    "ink-noir": "ink-noir",
    "notebook-reflection": "notebook-reflection",
  };
  return exact[key] ?? null;
}

export function resolveVisualBookKindId(value: string): VisualBookKind | null {
  const key = normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const aliases: Record<string, VisualBookKind> = {
    "illustrated-story": "illustrated-story",
    "children-s-story": "children-story",
    "children-story": "children-story",
    "visual-how-to": "visual-guide",
    "visual-guide": "visual-guide",
    motivational: "motivational",
    "recipe-activity": "recipe-activity",
    "book-teaser": "book-teaser",
    "lead-magnet": "lead-magnet",
    "product-guide": "product-guide",
    "service-guide": "product-guide",
  };
  return aliases[key] ?? null;
}
