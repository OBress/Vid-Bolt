/**
 * Universal Script Generation Configuration
 * ============================================================================
 * Configurable settings for the script generation system.
 * 
 * TODO: Connect these settings to Supabase for per-user customization.
 * Settings marked with // CUSTOMIZABLE: can be stored in user preferences.
 */

import type { ScriptGenre, ConfidenceLevel } from './types';

// ============================================================================
// TIMING & DURATION SETTINGS
// ============================================================================

/**
 * Words per minute for duration calculations
 * // CUSTOMIZABLE: Store in user_settings.script_words_per_minute
 */
export const WORDS_PER_MINUTE = 150;

/**
 * Beat duration limits in seconds
 * // CUSTOMIZABLE: Store in user_settings.script_beat_duration
 * 
 * OPTIMIZATION: Longer beats = fewer LLM calls, more coherent sections.
 * Each beat should cover a single topic/section to minimize transitions.
 * At 150 WPM: 300 sec = ~750 words, 600 sec = ~1500 words
 */
export const BEAT_DURATION = {
  minSeconds: 120,   // 2 min = ~300 words min
  maxSeconds: 600,   // 10 min = ~1500 words max (well under 2k limit)
  defaultSeconds: 300, // 5 min = ~750 words per beat - sweet spot for quality
};

/**
 * Engagement timing thresholds
 * // CUSTOMIZABLE: Store in user_settings.script_engagement_timing
 */
export const ENGAGEMENT_TIMING = {
  /** Pattern interrupt interval in seconds */
  patternInterruptIntervalSeconds: 150, // 2.5 minutes
  /** First hook must appear within these seconds */
  hookDeadlineSeconds: 5,
  /** Commitment must be established by these seconds */
  commitmentDeadlineSeconds: 30,
  /** Major revelation position (0-1) */
  majorRevelationPosition: 0.4,
  /** Climax position (0-1) */
  climaxPosition: 0.77,
  /** Resolution start position (0-1) */
  resolutionPosition: 0.9,
};

/**
 * Content allocation percentages by section
 * // CUSTOMIZABLE: Store in user_settings.script_content_allocation
 */
export const DEFAULT_CONTENT_ALLOCATION = {
  openingPercent: 10,
  mainActsPercent: 75,
  conclusionPercent: 15,
};

// ============================================================================
// QUALITY THRESHOLDS
// ============================================================================

/**
 * Quality thresholds for validation
 * // CUSTOMIZABLE: Store in user_settings.script_quality_thresholds
 */
export const QUALITY_THRESHOLDS = {
  /** Maximum seconds without an engagement marker */
  maxSecondsWithoutEngagement: 60,
  /** Minimum pattern interrupts per minute */
  minPatternInterruptsPerMinute: 0.33, // 1 every 3 minutes
  /** Minimum confidence level for using facts in documentary mode */
  minFactConfidence: 'medium' as ConfidenceLevel,
  /** All open loops must close by this position (0-1) */
  openLoopsCloseByPosition: 0.95,
};

// ============================================================================
// RESEARCH SETTINGS
// ============================================================================

/**
 * Source reliability tier definitions
 * // CUSTOMIZABLE: Store in user_settings.script_source_tiers
 */
export const SOURCE_RELIABILITY_TIERS = {
  1: {
    name: 'Primary/Academic',
    description: 'Academic journals, official documents, court records',
    requiredForVerified: 3,
  },
  2: {
    name: 'Established News',
    description: 'Major news organizations, established experts',
    requiredForVerified: 3,
  },
  3: {
    name: 'Books/Documentaries',
    description: 'Books by credentialed authors, documentaries',
    requiredForHigh: 2,
  },
  4: {
    name: 'Informal',
    description: 'Blogs, forums, social media',
    requiredForMedium: 3,
  },
  5: {
    name: 'Unverified',
    description: 'Wikipedia (verify claims), unknown sources',
    useWithCaution: true,
  },
};

/**
 * Confidence level assignment rules
 * // CUSTOMIZABLE: Store in user_settings.script_confidence_rules
 */
export const CONFIDENCE_ASSIGNMENT_RULES = {
  verified: { minTier1Or2Sources: 3 },
  high: { minTier1Or2Sources: 2 },
  medium: { minTier1Or2Sources: 1, orMinTier3Sources: 2 },
  low: { minTier3Sources: 1, orAnyTier4Plus: true },
  conflicted: { sourcesDisagree: true },
  unverified: { couldNotVerify: true },
};

// ============================================================================
// WORD REPLACEMENTS
// ============================================================================

/**
 * Words that AI models tend to overuse and their natural alternatives.
 * Used both in prompts (as instructions) and for post-generation checking.
 * // CUSTOMIZABLE: Store in user_settings.script_word_replacements
 */
export const WORD_REPLACEMENTS: Record<string, string[]> = {
  // Movement/Action words
  'delve': ['explore', 'examine', 'investigate', 'look into', 'dig into'],
  'delving': ['exploring', 'examining', 'investigating', 'looking into'],
  'embark': ['start', 'begin', 'set out', 'kick off', 'launch'],
  'embarking': ['starting', 'beginning', 'setting out'],
  'unfold': ['happen', 'develop', 'take place', 'occur', 'play out'],
  'unfolding': ['happening', 'developing', 'taking place'],
  
  // Figurative/Abstract words
  'landscape': ['situation', 'environment', 'field', 'scene', 'world'],
  'tapestry': ['mix', 'combination', 'blend', 'fabric', 'patchwork'],
  'intricate': ['complex', 'detailed', 'elaborate', 'complicated'],
  'nestled': ['located', 'situated', 'tucked', 'sitting', 'placed'],
  'realm': ['area', 'field', 'domain', 'world', 'sphere'],
  'plethora': ['many', 'lots of', 'abundance', 'wealth of', 'range of'],
  'myriad': ['many', 'countless', 'numerous', 'a range of', 'variety of'],
  
  // Business/Formal jargon
  'pivotal': ['key', 'crucial', 'critical', 'important', 'vital'],
  'paradigm': ['model', 'framework', 'approach', 'way of thinking'],
  'synergy': ['combination', 'collaboration', 'working together'],
  'leverage': ['use', 'utilize', 'take advantage of', 'apply'],
  'facilitate': ['help', 'enable', 'make possible', 'allow', 'support'],
  'juxtaposition': ['contrast', 'comparison', 'tension', 'difference'],
  
  // Generic emphasis words
  'testament': ['proof', 'evidence', 'sign', 'indicator', 'example'],
  'underscore': ['highlight', 'emphasize', 'show', 'reveal', 'demonstrate'],
  'nuanced': ['subtle', 'complex', 'layered', 'sophisticated'],
  'robust': ['strong', 'solid', 'reliable', 'sturdy', 'healthy'],
  'holistic': ['complete', 'whole', 'comprehensive', 'overall'],
  
  // Hyperbolic words
  'exponential': ['rapid', 'dramatic', 'massive', 'significant'],
  'unprecedented': ['rare', 'unusual', 'never-before-seen', 'first-ever', 'historic'],
  'unparalleled': ['unmatched', 'exceptional', 'unique', 'remarkable'],
  'groundbreaking': ['innovative', 'pioneering', 'revolutionary', 'new'],
  'cutting-edge': ['advanced', 'modern', 'latest', 'state-of-the-art'],
  'game-changing': ['transformative', 'significant', 'major', 'important'],
  
  // Transition/Flow words  
  'seamlessly': ['smoothly', 'easily', 'naturally', 'effortlessly'],
  'intertwined': ['connected', 'linked', 'tied together', 'interlocked'],
  'catalyst': ['trigger', 'spark', 'cause', 'driver'],
  'cornerstone': ['foundation', 'basis', 'key element', 'pillar'],
  
  // Common AI-isms
  'captivating': ['interesting', 'engaging', 'compelling', 'fascinating'],
  'meticulous': ['careful', 'thorough', 'detailed', 'precise'],
  'profound': ['deep', 'significant', 'important', 'major'],
  'poignant': ['moving', 'touching', 'emotional', 'affecting'],
  'enigmatic': ['mysterious', 'puzzling', 'cryptic', 'unclear'],
  'ubiquitous': ['common', 'widespread', 'everywhere', 'prevalent'],
};

/**
 * Get word replacement suggestions
 */
export function getWordReplacements(word: string): string[] | undefined {
  return WORD_REPLACEMENTS[word.toLowerCase()];
}

// ============================================================================
// BANNED PHRASES
// ============================================================================

/**
 * Banned phrases by genre
 * These patterns are flagged and should be removed or rewritten.
 * // CUSTOMIZABLE: Store in user_settings.script_banned_phrases
 */
export const BANNED_PHRASES: Record<ScriptGenre, string[]> = {
  documentary: [
    // Vague hedging
    'some say',
    'many believe',
    'it is said that',
    'according to some',
    // Clickbait
    'you won\'t believe',
    'shocking truth',
    'what happened next',
    'mind-blowing',
    // Unnecessary intensifiers
    'very',
    'extremely',
    'incredibly',
    'absolutely',
    // Meta-commentary
    'in this video',
    'as we mentioned',
    'let me tell you',
    'I\'m going to show you',
    // AI-isms
    'delve',
    'tapestry',
    'intricate',
    'embark on a journey',
    'nestled',
    'landscape',
    'realm',
    'plethora',
  ],
  educational: [
    'you won\'t believe',
    'mind-blowing',
    'very',
    'extremely',
    'incredibly',
    'in this video',
    'let me tell you',
    'delve',
    'tapestry',
    'intricate',
    'nestled',
    'realm',
  ],
  narrative_fiction: [
    // Overused physical reactions
    'heart pounding',
    'breath caught',
    'blood ran cold',
    'eyes widened',
    'jaw dropped',
    // Cliché descriptions
    'ancient',
    'looming',
    'piercing eyes',
    'chiseled features',
    // Weak verbs
    'seemed to',
    // AI-isms
    'delve',
    'tapestry',
    'intricate',
    'nestled',
    'realm',
  ],
  historical_fiction: [
    'heart pounding',
    'breath caught',
    'eyes widened',
    'ancient',
    'looming',
    'delve',
    'tapestry',
    'intricate',
    'nestled',
  ],
  opinion_essay: [
    'some say',
    'many believe',
    'you won\'t believe',
    'shocking truth',
    'very',
    'extremely',
    'in this video',
    'delve',
    'tapestry',
    'realm',
  ],
  tutorial: [
    'you won\'t believe',
    'mind-blowing',
    'extremely',
    'incredibly',
    'delve',
    'tapestry',
    'realm',
  ],
  news: [
    'some say',
    'many believe',
    'you won\'t believe',
    'shocking truth',
    'very',
    'extremely',
    'incredibly',
    'delve',
    'tapestry',
    'realm',
  ],
};

// ============================================================================
// GENRE-SPECIFIC RULES
// ============================================================================

/**
 * Genre-specific configuration
 * // CUSTOMIZABLE: Store in user_settings.script_genre_config
 */
export const GENRE_CONFIG: Record<ScriptGenre, {
  requiresResearch: boolean;
  allowsResearch: boolean;
  requiresFactAttribution: boolean;
  requiresCharacterProfiles: boolean;
  allowsDialogue: boolean;
  contentAllocationOverride?: typeof DEFAULT_CONTENT_ALLOCATION;
}> = {
  documentary: {
    requiresResearch: true,
    allowsResearch: true,
    requiresFactAttribution: true,
    requiresCharacterProfiles: false,
    allowsDialogue: false,
  },
  educational: {
    requiresResearch: true,
    allowsResearch: true,
    requiresFactAttribution: true,
    requiresCharacterProfiles: false,
    allowsDialogue: false,
  },
  narrative_fiction: {
    requiresResearch: false,
    allowsResearch: false,
    requiresFactAttribution: false,
    requiresCharacterProfiles: true,
    allowsDialogue: true,
  },
  historical_fiction: {
    requiresResearch: true,
    allowsResearch: true,
    requiresFactAttribution: false, // Facts for accuracy, but dialogue is creative
    requiresCharacterProfiles: true,
    allowsDialogue: true,
  },
  opinion_essay: {
    requiresResearch: false,
    allowsResearch: true,
    requiresFactAttribution: true, // When using facts to support opinion
    requiresCharacterProfiles: false,
    allowsDialogue: false,
  },
  tutorial: {
    requiresResearch: false,
    allowsResearch: true,
    requiresFactAttribution: false,
    requiresCharacterProfiles: false,
    allowsDialogue: false,
    contentAllocationOverride: {
      openingPercent: 5,
      mainActsPercent: 85,
      conclusionPercent: 10,
    },
  },
  news: {
    requiresResearch: true,
    allowsResearch: true,
    requiresFactAttribution: true,
    requiresCharacterProfiles: false,
    allowsDialogue: false,
    contentAllocationOverride: {
      openingPercent: 15,
      mainActsPercent: 70,
      conclusionPercent: 15,
    },
  },
};

// ============================================================================
// YOUTUBE-SPECIFIC RULES
// ============================================================================

/**
 * YouTube optimization rules
 * // CUSTOMIZABLE: Store in user_settings.script_youtube_rules
 */
export const YOUTUBE_RULES = {
  /** The 5-second rule: First 5 seconds must hook */
  hookWindowSeconds: 5,
  /** The 30-second commitment: Viewer must understand value by 30s */
  commitmentWindowSeconds: 30,
  /** The 2-3 minute rhythm: Micro-payoffs at this interval */
  rhythmIntervalSeconds: 150,
  /** Anti-filler: Flag consecutive beats making same point */
  maxConsecutiveSamePointBeats: 1,
  /** Anti-filler: Flag extended transitions */
  maxTransitionDurationSeconds: 10,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get banned phrases for a specific genre
 */
export function getBannedPhrases(genre: ScriptGenre): string[] {
  return BANNED_PHRASES[genre] || [];
}

/**
 * Get genre configuration
 */
export function getGenreConfig(genre: ScriptGenre) {
  return GENRE_CONFIG[genre];
}

/**
 * Calculate target word count from duration
 */
export function calculateTargetWordCount(durationSeconds: number): number {
  return Math.round((durationSeconds / 60) * WORDS_PER_MINUTE);
}

/**
 * Calculate target beat count from duration
 */
export function calculateTargetBeatCount(durationSeconds: number): number {
  return Math.round(durationSeconds / BEAT_DURATION.defaultSeconds);
}

/**
 * Calculate duration from word count
 */
export function calculateDurationFromWords(wordCount: number): number {
  return Math.round((wordCount / WORDS_PER_MINUTE) * 60);
}
