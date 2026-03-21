/**
 * Universal Script Generation Types
 * ============================================================================
 * Type definitions for the universal script generation system supporting
 * any genre and duration with factual accuracy and engagement optimization.
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Supported script genres
 */
export const SCRIPT_GENRES = [
  'documentary',
  'educational',
  'narrative_fiction',
  'historical_fiction',
  'opinion_essay',
  'tutorial',
  'news',
] as const;
export type ScriptGenre = typeof SCRIPT_GENRES[number];

/**
 * Research toggle options
 * - 'full': Full research with maximum information extraction (acts as deep research)
 * - 'off': No research
 */
export const RESEARCH_TOGGLES = ['full', 'off'] as const;
export type ResearchToggle = typeof RESEARCH_TOGGLES[number];

/**
 * Stock media scraping levels
 * - 'none': Do not scrape stock media (skip step)
 * - 'standard_images': Standard amount of images only (via Serper)
 * - 'extensive_images': Extensive images only (via Serper)
 * - 'standard_images_video': Standard images + videos (future - not yet implemented)
 * - 'extensive_images_video': Extensive images + videos (future - not yet implemented)
 */
export const STOCK_MEDIA_LEVELS = ['none', 'standard_images', 'extensive_images', 'standard_images_video', 'extensive_images_video'] as const;
export type StockMediaLevel = typeof STOCK_MEDIA_LEVELS[number];

/**
 * Beat types for spine generation
 */
export const BEAT_TYPES = [
  'hook',
  'setup',
  'information',
  'evidence',
  'transition',
  'escalation',
  'climax',
  'resolution',
  'callback',
  'pattern_interrupt',
] as const;
export type BeatType = typeof BEAT_TYPES[number];

/**
 * Confidence levels for verified facts
 */
export const CONFIDENCE_LEVELS = [
  'verified',    // 3+ Tier 1-2 sources agree
  'high',        // 2+ Tier 1-2 sources agree
  'medium',      // Single Tier 1-2 or multiple Tier 3 sources
  'low',         // Single Tier 3 or Tier 4+ sources
  'conflicted',  // Sources disagree
  'unverified',  // Couldn't verify
] as const;
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];

/**
 * Source reliability tiers
 */
export const RELIABILITY_TIERS = [1, 2, 3, 4, 5] as const;
export type ReliabilityTier = typeof RELIABILITY_TIERS[number];

/**
 * Content types for segments
 */
export const CONTENT_TYPES = [
  'list_item',
  'comparison',
  'concept',
  'transition',
  'emotional_beat',
  'dialogue',
  'action',
  'description',
] as const;
export type ContentType = typeof CONTENT_TYPES[number];

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Duration range specified by user
 */
export interface DurationRange {
  minMinutes: number;
  maxMinutes: number;
}

/**
 * Universal script generation input
 */
export interface UniversalScriptInput {
  /** Free-form topic/concept description */
  topic: string;
  /** Script genre - determines structure and rules */
  genre: ScriptGenre;
  /** Min/max duration in minutes */
  durationRange: DurationRange;
  /** Research depth toggle */
  researchToggle: ResearchToggle;
  /** Stock media scraping level */
  stockMediaLevel?: StockMediaLevel;
  
  // Optional inputs
  /** Tone/style preferences */
  toneStyle?: string;
  /** Target audience description */
  targetAudience?: string;
  /** Specific angle or thesis */
  angle?: string;
  /** Elements that must be included */
  mustInclude?: string[];
  /** Elements to avoid */
  mustAvoid?: string[];
  /** Source preferences */
  sourcePreferences?: string;
  /** Existing reference materials */
  referenceMaterials?: string;
  
  // Project settings (from media project configuration)
  /** Point of view for narration (1st, 2nd, 3rd person) */
  pov?: '1st' | '2nd' | '3rd';
  /** Protagonist/narrator gender */
  protagonistGender?: 'male' | 'female' | 'any';
  /** OpenRouter model to use for generation */
  openrouterModel?: string;
  /** Quality/review model to use for scoring and rewrites */
  qualityReviewModel?: string;
  /** Content category/niche */
  contentNiche?: string;

  /** User's script style customization (from ScriptAdvancedSettings) */
  styleConfig?: ScriptStyleConfig;
}

/**
 * Script style configuration carried through the writing pipeline.
 * Sourced from project settings → ScriptAdvancedSettings.
 */
export interface ScriptStyleConfig {
  /** Custom banned phrases — merged with genre defaults in validation layer */
  customBannedPhrases?: string[];
  /** Custom word → alternatives mappings — checked post-generation */
  customWordReplacements?: Record<string, string[]>;
  /** Per-phase system prompt overrides (prepended to default prompts) */
  systemPromptOverrides?: {
    expansion?: string;
    quality?: string;
    rewrite?: string;
    transition?: string;
  };
  /** Custom engagement timing for spine generation */
  engagementTiming?: {
    patternInterruptIntervalSeconds?: number;
    hookDeadlineSeconds?: number;
    commitmentDeadlineSeconds?: number;
  };
}

// ============================================================================
// RESEARCH DOSSIER TYPES
// ============================================================================

/**
 * Individual verified fact with source attribution
 */
export interface VerifiedFact {
  /** Unique identifier (e.g., FACT-001) */
  id: string;
  /** The factual statement */
  statement: string;
  /** Sources supporting this fact */
  sources: SourceCitation[];
  /** Confidence level */
  confidence: ConfidenceLevel;
  /** Additional notes */
  notes?: string;
  /** Primary source ID linking to main source (e.g., SRC-001) */
  primarySourceId?: string;
  /** Exact text location in primary source */
  textRangeInSource?: {
    start: number;
    end: number;
  };
}

/**
 * Source citation
 */
export interface SourceCitation {
  /** Unique source ID (e.g., SRC-001) - for Valyu attribution */
  id?: string;
  /** URL or reference */
  url?: string;
  /** Source title */
  title: string;
  /** Author/publication */
  author?: string;
  /** Access/publication date */
  date?: string;
  /** Reliability tier */
  reliabilityTier: ReliabilityTier;
  /** Relevant excerpt */
  excerpt?: string;
  /** Full source content for hover preview - from Valyu */
  fullContent?: string;
  /** Publication type (academic, news, web, etc.) */
  publicationType?: string;
}

/**
 * Attributable quote
 */
export interface AttributableQuote {
  /** Unique identifier (e.g., QUOTE-001) */
  id: string;
  /** Full quote text */
  quote: string;
  /** Speaker name */
  speaker: string;
  /** Speaker's title/role */
  speakerTitle?: string;
  /** Context of the quote */
  context?: string;
  /** Source citation */
  source: SourceCitation;
  /** Date spoken/written */
  date?: string;
}

/**
 * Timeline event
 */
export interface TimelineEvent {
  /** Unique identifier (e.g., TIMELINE-001) */
  id: string;
  /** Event date/time */
  date: string;
  /** Event description */
  description: string;
  /** Source citation */
  source: SourceCitation;
  /** Significance to the story */
  significance?: string;
}

/**
 * Key entity (person or location)
 */
export interface KeyEntity {
  /** Entity type */
  type: 'person' | 'location' | 'organization';
  /** Entity name */
  name: string;
  /** Role/significance */
  role: string;
  /** Additional details */
  details: string;
  /** First appearance in timeline */
  firstAppearance?: string;
}

/**
 * Theory or interpretation
 */
export interface Theory {
  /** Unique identifier (e.g., THEORY-001) */
  id: string;
  /** Theory name */
  name: string;
  /** Summary */
  summary: string;
  /** Supporting evidence (fact IDs) */
  supportingEvidence: string[];
  /** Contradicting evidence (fact IDs) */
  contradictingEvidence: string[];
  /** Notable proponents */
  proponents?: string[];
  /** Current acceptance status */
  currentStatus: 'accepted' | 'debated' | 'rejected' | 'fringe';
}

/**
 * Research gap
 */
export interface ResearchGap {
  /** What couldn't be found */
  description: string;
  /** Impact on the content */
  impact: 'high' | 'medium' | 'low';
  /** Handling recommendation */
  recommendation: string;
}

/**
 * Complete research dossier
 */
export interface ResearchDossier {
  /** Metadata */
  metadata: {
    topic: string;
    researchDepth: ResearchToggle;
    factCount: number;
    quoteCount: number;
    overallConfidence: number; // 0-100
    generatedAt: string;
  };
  /** Verified facts */
  facts: VerifiedFact[];
  /** Conflicting information with both positions */
  conflicts: Array<{
    topic: string;
    positions: Array<{ position: string; sources: SourceCitation[] }>;
    resolution?: string;
  }>;
  /** Attributable quotes */
  quotes: AttributableQuote[];
  /** Timeline of events */
  timeline: TimelineEvent[];
  /** Key entities */
  entities: KeyEntity[];
  /** Theories and interpretations */
  theories: Theory[];
  /** Research gaps */
  gaps: ResearchGap[];
  /** Works cited */
  worksCited: SourceCitation[];
  /** Full source documents from Valyu (for hover preview) */
  sourceDocuments?: Array<{
    id: string;
    url: string;
    title: string;
    content: string;
    publicationDate?: string;
    author?: string;
    reliabilityTier: ReliabilityTier;
    accessedAt: string;
  }>;
}

// ============================================================================
// RESEARCH DOSSIER V2 TYPES (Optimized for Breaking News)
// ============================================================================

/**
 * Narrative context for AI script writing
 * Contains everything the AI needs to understand an event it has zero training data on
 */
export interface NarrativeContext {
  /** 1-2 sentence attention grabber for the video */
  hook: string;
  /** 3-5 sentence complete overview of the event */
  summary: string;
  /** Background context the AI lacks from training data */
  background: string;
  /** What events led to this (chronological) */
  priorEvents: string[];
  /** Jargon/term definitions */
  keyTerms: Record<string, string>;
}

/**
 * Chronological story beat with full attribution
 * Represents a single development in the story timeline
 */
export interface KeyDevelopment {
  /** Unique identifier (e.g., DEV-001) */
  id: string;
  /** When this happened (ISO timestamp or descriptive) */
  timestamp: string;
  /** What happened */
  what: string;
  /** Entity names involved in this development */
  who: string[];
  /** Why this development matters to the story */
  significance: string;
  /** Source IDs that verify this development */
  sourceIds: string[];
}

/**
 * Enhanced entity with rich profile for script writing
 * Extends KeyEntity with quotes and actions for deeper character development
 */
export interface KeyEntityV2 extends KeyEntity {
  /** 1-2 sentence background/bio */
  bio: string;
  /** Quote IDs associated with this entity */
  quoteIds: string[];
  /** What this entity did in this story */
  actions: string[];
}

/**
 * Research Dossier v2 - Optimized for Breaking News Script Writing
 * 
 * Extends the base dossier with narrative context and story structure
 * that enables AI to write 100% factual scripts about events it has
 * zero prior knowledge of.
 */
export interface ResearchDossierV2 extends ResearchDossier {
  /** Narrative context for script writing */
  narrative?: NarrativeContext;
  /** Chronological story developments (beats) */
  keyDevelopments?: KeyDevelopment[];
  /** Enhanced entities with full profiles */
  entitiesV2?: KeyEntityV2[];
  /** What we couldn't verify (for transparency) */
  verificationGaps?: string[];
  /** Dossier version for compatibility */
  version?: 'v1' | 'v2';
}

// ============================================================================
// SCOPING TYPES
// ============================================================================

/**
 * Content density analysis
 */
export interface ContentDensityAnalysis {
  /** Fact count score */
  factCountScore: 'lean' | 'mid' | 'rich';
  /** Narrative complexity */
  narrativeComplexity: 'single_thread' | 'multiple_threads' | 'complex';
  /** Theory count */
  theoryCount: number;
  /** Timeline span */
  timelineSpan: 'single_event' | 'days' | 'months' | 'years' | 'decades';
  /** Character count */
  characterCount: number;
  /** Visual scene count */
  visualSceneCount: number;
}

/**
 * Duration decision output
 */
export interface DurationDecision {
  /** Recommended duration in seconds */
  recommendedDurationSeconds: number;
  /** Target word count */
  targetWordCount: number;
  /** Beat count */
  beatCount: number;
  /** Reasoning for decision */
  reasoning: string;
  /** Content allocation percentages */
  contentAllocation: {
    openingPercent: number;
    mainActsPercent: number;
    conclusionPercent: number;
  };
}

// ============================================================================
// SPINE/BEAT TYPES
// ============================================================================

/**
 * Engagement markers for a beat
 */
export interface EngagementMarkers {
  /** Opens a question/curiosity gap */
  opensLoop: boolean;
  /** Closes a previously opened question */
  closesLoop: boolean;
  /** Loop ID being opened/closed */
  loopId?: string;
  /** Is a pattern interrupt */
  isPatternInterrupt: boolean;
  /** Callbacks to earlier content */
  callbackToBeatIndex?: number;
}

/**
 * Individual beat in the spine
 */
export interface Beat {
  /** Beat index (0-based) */
  index: number;
  
  /** Timing */
  timing: {
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
  };
  
  /** Classification */
  classification: {
    type: BeatType;
    section: string; // e.g., "Act 1", "Chapter 2"
    engagementFunction: string; // What keeps viewer watching
  };
  
  /** Content summary (2-4 sentences) */
  contentSummary: string;
  
  /** Research references */
  researchReferences: {
    factIds: string[];
    quoteIds: string[];
    timelineIds: string[];
    theoryIds: string[];
  };
  
  /** Key points to convey */
  keyPoints: string[];
  
  /** Tone and energy */
  toneEnergy: {
    mood: string;
    pacing: 'slow' | 'medium' | 'fast';
    energyRelativeToPrevious: 'lower' | 'same' | 'higher';
  };
  
  /** Transition notes */
  transitions: {
    fromPrevious: string;
    toNext: string;
  };
  
  /** Engagement markers */
  engagement: EngagementMarkers;
}

/**
 * Complete spine structure
 */
export interface Spine {
  /** Video/script title */
  title?: string;
  /** Total beat count */
  beatCount: number;
  /** Total duration in seconds */
  totalDurationSeconds: number;
  /** Section breakdown */
  sections: Array<{
    name: string;
    startBeatIndex: number;
    endBeatIndex: number;
  }>;
  /** All beats */
  beats: Beat[];
  /** Open loops tracking */
  openLoops: Array<{
    id: string;
    openedAtBeatIndex: number;
    closedAtBeatIndex?: number;
    question: string;
  }>;
}

// ============================================================================
// ASSET REGISTRY TYPES
// ============================================================================

/**
 * Character profile for visual consistency
 */
export interface CharacterProfile {
  /** Unique identifier (e.g., CHAR-001) */
  id: string;
  /** Character name */
  name: string;
  /** Role in the story */
  role: string;
  
  /** Immutable physical characteristics */
  physicalCharacteristics: {
    demographics: {
      age: string;
      gender: string;
      ethnicity?: string;
      nationality?: string;
    };
    bodyStructure: {
      height: string;
      build: string;
      posture: string;
      gait?: string;
    };
    faceStructure: {
      faceShape: string;
      forehead?: string;
      cheekbones?: string;
      jaw?: string;
      nose: string;
      ears?: string;
    };
    faceFeatures: {
      eyeColor: string;
      eyeShape: string;
      eyebrows: string;
      mouthDescription: string;
      skinTone: string;
      skinTexture?: string;
      notableFeatures?: string;
    };
    hair: {
      color: string;
      texture: string;
      length: string;
      style: string;
      facialHair?: string;
    };
    distinguishingFeatures?: string[];
  };
  
  /** Characteristic expressions */
  expressions: {
    neutral: string;
    happy?: string;
    concerned?: string;
    angry?: string;
    afraid?: string;
    thinking?: string;
  };
  
  /** Typical wardrobe */
  wardrobe: {
    defaultOutfit: string;
    variants?: Array<{ context: string; outfit: string }>;
  };
  
  /** Visual generation instructions */
  visualInstructions: {
    consistencyAnchors: string[]; // MUST appear in every image
    prohibitions: string[]; // NEVER include
    styleNotes: string;
  };
  
  /** Beat-specific variants */
  beatVariants?: Array<{
    beatIndices: number[];
    changesFromDefault: string;
    notes: string;
  }>;
}

/**
 * Location profile for visual consistency
 */
export interface LocationProfile {
  /** Unique identifier (e.g., LOC-001) */
  id: string;
  /** Location name */
  name: string;
  /** Location type */
  type: string;
  /** Era/time period */
  era?: string;
  /** Scale */
  scale: string;
  /** One-sentence essence */
  essence: string;
  
  /** Structural details */
  structuralDetails: {
    architectureStyle?: string;
    materials: string;
    shape?: string;
    condition: string;
    dimensions?: string;
    keyElements: string[];
  };
  
  /** Environmental details */
  environmentalDetails: {
    groundFloor: string;
    walls?: string;
    ceilingSky: string;
    vegetation?: string;
    weatherAtmosphere?: string;
  };
  
  /** Lighting conditions */
  lighting: {
    natural: string;
    artificial?: string;
    mood: string;
  };
  
  /** Ambient details */
  ambientDetails: {
    soundsImplied?: string;
    smellsImplied?: string;
    objectsDebris?: string;
    movementActivity?: string;
  };
  
  /** Visual generation instructions */
  visualInstructions: {
    consistencyAnchors: string[];
    prohibitions: string[];
    styleNotes: string;
  };
  
  /** Required view variants */
  requiredVariants: Array<{
    viewDescription: string;
    framing: string;
    lighting: string;
    beatIndices: number[];
  }>;
}

/**
 * Object profile for visual consistency
 */
export interface ObjectProfile {
  /** Unique identifier (e.g., OBJ-001) */
  id: string;
  /** Object name */
  name: string;
  /** Object type */
  type: string;
  
  /** Physical description */
  physicalDescription: {
    dimensions: string;
    relatableComparison: string; // e.g., "about the size of a shoebox"
    weightImplied?: string;
    shape: string;
    materials: string;
    color: string;
    condition: string;
    detailedDescription: string;
    notableFeatures?: string[];
  };
  
  /** Interaction notes */
  interactionNotes: {
    howHandled?: string;
    howMovesOrBehaves?: string;
    scaleReferences?: string;
  };
  
  /** Visual generation instructions */
  visualInstructions: {
    consistencyAnchors: string[];
    prohibitions: string[];
    styleNotes: string;
    requiredVariants?: Array<{
      context: string;
      changes: string;
    }>;
  };
}

/**
 * Complete asset registry
 */
export interface AssetRegistry {
  characters: CharacterProfile[];
  locations: LocationProfile[];
  objects: ObjectProfile[];
}

// ============================================================================
// SCRIPT EXPANSION TYPES
// ============================================================================

/**
 * Expanded beat content
 */
export interface ExpandedBeat {
  /** Beat index */
  beatIndex: number;
  
  /** Full narration script */
  narration: string;
  
  /** Visual callouts */
  visualCallouts: Array<{
    assetId: string; // CHAR-001, LOC-001, OBJ-001
    context: string;
  }>;
  
  /** Audio/music notes */
  audioNotes: {
    musicMood?: string;
    soundEffects?: string[];
    ambientSounds?: string;
  };
  
  /** On-screen text overlays */
  onScreenText?: Array<{
    text: string;
    timing: { startSeconds: number; endSeconds: number };
    style?: string;
  }>;
  
  /** Pacing notes */
  pacingNotes: {
    pauses?: Array<{ afterWord: string; durationMs: number }>;
    emphases?: string[];
    speedChanges?: Array<{ section: string; speed: 'slower' | 'faster' }>;
  };
  
  /** Word count */
  wordCount: number;
  
  /** Facts used (for verification) */
  factsUsed: string[];
  
  /** Quality review score (1-10) */
  qualityScore?: number;
}

/**
 * Continuity state for tracking between beats
 */
export interface ContinuityState {
  /** Overall story summary */
  storySummary: string;
  /** What has been covered */
  coveredContent: string[];
  /** Key facts established */
  establishedFacts: string[];
  /** Characters introduced */
  introducedCharacters: string[];
  /** Narrative promises made */
  narrativePromises: string[];
  /** Tone established */
  establishedTone: string;
  /** Facts used (to avoid repetition) */
  usedFactIds: string[];
  
  // Language pattern tracking for repetition prevention
  /** Distinctive phrases already used */
  usedPhrases: string[];
  /** Sentence openers already used (first 3 words) */
  usedOpeners: string[];
  /** Transition phrases already used */
  usedTransitions: string[];
}

// ============================================================================
// FINAL OUTPUT TYPES
// ============================================================================

/**
 * Quality validation results
 */
export interface QualityValidation {
  /** Overall pass/fail */
  passed: boolean;
  /** Factual accuracy check */
  factualAccuracy: {
    passed: boolean;
    issues: string[];
  };
  /** Consistency check */
  consistency: {
    passed: boolean;
    issues: string[];
  };
  /** Engagement check */
  engagement: {
    passed: boolean;
    issues: string[];
  };
  /** Completeness check */
  completeness: {
    passed: boolean;
    issues: string[];
  };
  /** Anti-filler detection */
  antiFillerCheck: {
    passed: boolean;
    flaggedSections: string[];
  };
  /** Visual animatability check (dead zone detection) */
  visualAnimatability?: {
    passed: boolean;
    deadZones: Array<{
      /** Starting sentence index in the full script */
      sentenceIndex: number;
      /** Number of consecutive abstract sentences */
      sentenceCount: number;
      /** Preview of the flagged text */
      preview: string;
    }>;
  };
}

/**
 * Complete universal script output
 */
export interface UniversalScriptOutput {
  /** Research dossier (if generated) */
  researchDossier?: ResearchDossier;
  /** Duration decision */
  durationDecision: DurationDecision;
  /** Spine structure */
  spine: Spine;
  /** Asset registry */
  assetRegistry: AssetRegistry;
  /** Expanded beats */
  expandedBeats: ExpandedBeat[];
  /** Final assembled script */
  finalScript: string;
  /** Quality validation results */
  qualityValidation: QualityValidation;
  /** Beat timing sheet */
  beatTimingSheet: Array<{
    beatIndex: number;
    startSeconds: number;
    endSeconds: number;
    type: BeatType;
    summary: string;
  }>;
  /** Visual callout list (ordered by appearance) */
  visualCalloutList: Array<{
    beatIndex: number;
    assetId: string;
    assetType: 'character' | 'location' | 'object';
    context: string;
  }>;
  /** Works cited (if research conducted) */
  worksCited?: SourceCitation[];
}
