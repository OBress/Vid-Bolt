/**
 * Genre Templates
 * ============================================================================
 * Genre-specific structural templates and requirements for spine generation.
 */

import type { ScriptGenre, BeatType } from '../types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Genre-specific template for spine generation
 */
export interface GenreTemplate {
  /** Genre name */
  genre: ScriptGenre;
  /** Template name */
  name: string;
  /** High-level structural description */
  description: string;
  /** Required structural elements */
  requirements: string[];
  /** Recommended beat type sequence (flexible) */
  recommendedStructure: BeatStructure[];
  /** Beat types that should be emphasized */
  emphasizedBeatTypes: BeatType[];
  /** Beat types to use sparingly or avoid */
  minimizedBeatTypes: BeatType[];
  /** Special rules for this genre */
  specialRules: string[];
}

/**
 * Beat structure recommendation
 */
export interface BeatStructure {
  /** Section name */
  section: string;
  /** Position range (0-1) */
  positionRange: { start: number; end: number };
  /** Recommended beat types for this section */
  beatTypes: BeatType[];
  /** Percentage of total beats in this section */
  beatPercentage: number;
}

// ============================================================================
// GENRE TEMPLATES
// ============================================================================

const DOCUMENTARY_TEMPLATE: GenreTemplate = {
  genre: 'documentary',
  name: 'Documentary/Explainer',
  description: 'Evidence-based storytelling with factual accuracy',
  requirements: [
    'Open with strongest hook, not chronological start',
    'Every claim needs research dossier reference',
    'Include evidence beats after major claims',
    'Expert quotes should feel earned, not forced',
    'Build to revelation, not information dump',
    'Maintain epistemic humility - acknowledge uncertainty',
  ],
  recommendedStructure: [
    {
      section: 'Opening',
      positionRange: { start: 0, end: 0.12 },
      beatTypes: ['hook', 'setup'],
      beatPercentage: 12,
    },
    {
      section: 'Act 1 - Context',
      positionRange: { start: 0.12, end: 0.35 },
      beatTypes: ['information', 'evidence', 'transition'],
      beatPercentage: 23,
    },
    {
      section: 'Act 2 - Investigation',
      positionRange: { start: 0.35, end: 0.75 },
      beatTypes: ['information', 'evidence', 'escalation', 'pattern_interrupt'],
      beatPercentage: 40,
    },
    {
      section: 'Act 3 - Revelation',
      positionRange: { start: 0.75, end: 0.90 },
      beatTypes: ['climax', 'evidence'],
      beatPercentage: 15,
    },
    {
      section: 'Conclusion',
      positionRange: { start: 0.90, end: 1.0 },
      beatTypes: ['resolution', 'callback'],
      beatPercentage: 10,
    },
  ],
  emphasizedBeatTypes: ['evidence', 'information'],
  minimizedBeatTypes: ['transition'],
  specialRules: [
    'Attribution required for statistics and quotes',
    'No speculation without clearly marking it',
    'Sources should be mentioned naturally in narration',
  ],
};

const EDUCATIONAL_TEMPLATE: GenreTemplate = {
  genre: 'educational',
  name: 'Educational/Tutorial',
  description: 'Clear explanation with progressive complexity',
  requirements: [
    'Start with "why should I care" hook',
    'Assume no prior knowledge unless specified',
    'Use analogies and examples liberally',
    'Check comprehension with recap beats',
    'Build complexity gradually',
    'End with clear takeaways',
  ],
  recommendedStructure: [
    {
      section: 'Hook',
      positionRange: { start: 0, end: 0.08 },
      beatTypes: ['hook'],
      beatPercentage: 8,
    },
    {
      section: 'Foundation',
      positionRange: { start: 0.08, end: 0.30 },
      beatTypes: ['setup', 'information'],
      beatPercentage: 22,
    },
    {
      section: 'Core Concepts',
      positionRange: { start: 0.30, end: 0.70 },
      beatTypes: ['information', 'evidence', 'pattern_interrupt'],
      beatPercentage: 40,
    },
    {
      section: 'Advanced/Application',
      positionRange: { start: 0.70, end: 0.85 },
      beatTypes: ['escalation', 'information'],
      beatPercentage: 15,
    },
    {
      section: 'Summary & Takeaways',
      positionRange: { start: 0.85, end: 1.0 },
      beatTypes: ['resolution', 'callback'],
      beatPercentage: 15,
    },
  ],
  emphasizedBeatTypes: ['information', 'evidence'],
  minimizedBeatTypes: ['escalation', 'climax'],
  specialRules: [
    'Use visual aids and examples for complex concepts',
    'Recap key points periodically',
    'End each major section with a summary',
  ],
};

const NARRATIVE_FICTION_TEMPLATE: GenreTemplate = {
  genre: 'narrative_fiction',
  name: 'Narrative Fiction',
  description: 'Character-driven storytelling with emotional arc',
  requirements: [
    'Character introductions need physical description beats',
    'Dialogue beats include blocking/action',
    'Emotional beats need environmental reflection',
    'Foreshadowing must be planted visibly',
    'Show don\'t tell where possible',
    'Climax has clear visual payoff',
  ],
  recommendedStructure: [
    {
      section: 'Opening Hook',
      positionRange: { start: 0, end: 0.10 },
      beatTypes: ['hook', 'setup'],
      beatPercentage: 10,
    },
    {
      section: 'Act 1 - Setup',
      positionRange: { start: 0.10, end: 0.25 },
      beatTypes: ['setup', 'information'],
      beatPercentage: 15,
    },
    {
      section: 'Act 2 - Rising Action',
      positionRange: { start: 0.25, end: 0.75 },
      beatTypes: ['escalation', 'information', 'pattern_interrupt', 'callback'],
      beatPercentage: 50,
    },
    {
      section: 'Act 3 - Climax',
      positionRange: { start: 0.75, end: 0.90 },
      beatTypes: ['climax', 'escalation'],
      beatPercentage: 15,
    },
    {
      section: 'Resolution',
      positionRange: { start: 0.90, end: 1.0 },
      beatTypes: ['resolution', 'callback'],
      beatPercentage: 10,
    },
  ],
  emphasizedBeatTypes: ['escalation', 'climax', 'callback'],
  minimizedBeatTypes: ['evidence'],
  specialRules: [
    'First appearance of character includes physical description',
    'Maintain consistent character voice in dialogue',
    'Environment reflects emotional state',
  ],
};

const HISTORICAL_FICTION_TEMPLATE: GenreTemplate = {
  genre: 'historical_fiction',
  name: 'Historical Fiction',
  description: 'Historically accurate storytelling with creative elements',
  requirements: [
    'Research facts for historical accuracy',
    'Mark what\'s historical vs creative invention',
    'Period details must be accurate',
    'Creative dialogue for historical figures clearly framed',
    'Distinguish speculation from fact',
  ],
  recommendedStructure: [
    {
      section: 'Opening',
      positionRange: { start: 0, end: 0.12 },
      beatTypes: ['hook', 'setup'],
      beatPercentage: 12,
    },
    {
      section: 'Historical Context',
      positionRange: { start: 0.12, end: 0.30 },
      beatTypes: ['information', 'evidence', 'setup'],
      beatPercentage: 18,
    },
    {
      section: 'Main Narrative',
      positionRange: { start: 0.30, end: 0.75 },
      beatTypes: ['information', 'escalation', 'evidence', 'pattern_interrupt'],
      beatPercentage: 45,
    },
    {
      section: 'Climax',
      positionRange: { start: 0.75, end: 0.90 },
      beatTypes: ['climax', 'escalation'],
      beatPercentage: 15,
    },
    {
      section: 'Resolution & Legacy',
      positionRange: { start: 0.90, end: 1.0 },
      beatTypes: ['resolution', 'information'],
      beatPercentage: 10,
    },
  ],
  emphasizedBeatTypes: ['evidence', 'information', 'escalation'],
  minimizedBeatTypes: [],
  specialRules: [
    'Clearly distinguish historical fact from dramatization',
    'Include sources/citations for major historical claims',
    'Period-appropriate language and details',
  ],
};

const OPINION_ESSAY_TEMPLATE: GenreTemplate = {
  genre: 'opinion_essay',
  name: 'Opinion/Essay',
  description: 'Argument-driven content with personal perspective',
  requirements: [
    'Thesis stated clearly early',
    'Acknowledge counterarguments',
    'Evidence supports opinion, not replaces it',
    'Personal voice appropriate',
    'Call to action or reflection at end',
  ],
  recommendedStructure: [
    {
      section: 'Hook & Thesis',
      positionRange: { start: 0, end: 0.15 },
      beatTypes: ['hook', 'setup'],
      beatPercentage: 15,
    },
    {
      section: 'Arguments',
      positionRange: { start: 0.15, end: 0.60 },
      beatTypes: ['information', 'evidence', 'escalation'],
      beatPercentage: 45,
    },
    {
      section: 'Counterarguments',
      positionRange: { start: 0.60, end: 0.75 },
      beatTypes: ['information', 'evidence', 'pattern_interrupt'],
      beatPercentage: 15,
    },
    {
      section: 'Synthesis',
      positionRange: { start: 0.75, end: 0.90 },
      beatTypes: ['climax', 'escalation'],
      beatPercentage: 15,
    },
    {
      section: 'Conclusion & Call to Action',
      positionRange: { start: 0.90, end: 1.0 },
      beatTypes: ['resolution'],
      beatPercentage: 10,
    },
  ],
  emphasizedBeatTypes: ['evidence', 'information'],
  minimizedBeatTypes: ['callback', 'transition'],
  specialRules: [
    'Personal opinion clearly distinguished from fact',
    'Steelman opposing views before refuting',
    'End with actionable insight or reflection',
  ],
};

const TUTORIAL_TEMPLATE: GenreTemplate = {
  genre: 'tutorial',
  name: 'Tutorial/How-To',
  description: 'Step-by-step instructional content',
  requirements: [
    'Start with clear goal statement',
    'Prerequisites stated upfront',
    'Steps clearly numbered/organized',
    'Visual demonstrations for each step',
    'Troubleshooting common issues',
    'End with next steps or resources',
  ],
  recommendedStructure: [
    {
      section: 'Introduction',
      positionRange: { start: 0, end: 0.10 },
      beatTypes: ['hook', 'setup'],
      beatPercentage: 10,
    },
    {
      section: 'Prerequisites',
      positionRange: { start: 0.10, end: 0.20 },
      beatTypes: ['information'],
      beatPercentage: 10,
    },
    {
      section: 'Main Steps',
      positionRange: { start: 0.20, end: 0.80 },
      beatTypes: ['information', 'evidence', 'pattern_interrupt'],
      beatPercentage: 60,
    },
    {
      section: 'Wrap-up & Tips',
      positionRange: { start: 0.80, end: 1.0 },
      beatTypes: ['resolution', 'information'],
      beatPercentage: 20,
    },
  ],
  emphasizedBeatTypes: ['information', 'evidence'],
  minimizedBeatTypes: ['escalation', 'climax', 'callback'],
  specialRules: [
    'Each step is clearly numbered',
    'Include visual aids for complex steps',
    'Mention common mistakes to avoid',
  ],
};

const NEWS_TEMPLATE: GenreTemplate = {
  genre: 'news',
  name: 'News/Report',
  description: 'Objective reporting with source attribution',
  requirements: [
    'Lead with the most important information',
    'Who, what, when, where, why covered early',
    'Multiple sources for balance',
    'Clear attribution for all claims',
    'Background context provided',
    'Implications and what\'s next',
  ],
  recommendedStructure: [
    {
      section: 'Lead',
      positionRange: { start: 0, end: 0.15 },
      beatTypes: ['hook', 'setup'],
      beatPercentage: 15,
    },
    {
      section: 'Details',
      positionRange: { start: 0.15, end: 0.50 },
      beatTypes: ['information', 'evidence'],
      beatPercentage: 35,
    },
    {
      section: 'Context',
      positionRange: { start: 0.50, end: 0.70 },
      beatTypes: ['information', 'evidence'],
      beatPercentage: 20,
    },
    {
      section: 'Reactions/Implications',
      positionRange: { start: 0.70, end: 0.90 },
      beatTypes: ['information', 'evidence'],
      beatPercentage: 20,
    },
    {
      section: 'Conclusion',
      positionRange: { start: 0.90, end: 1.0 },
      beatTypes: ['resolution'],
      beatPercentage: 10,
    },
  ],
  emphasizedBeatTypes: ['information', 'evidence'],
  minimizedBeatTypes: ['escalation', 'climax', 'callback'],
  specialRules: [
    'Inverted pyramid structure',
    'Attribution for every claim',
    'Balance multiple viewpoints',
  ],
};

// ============================================================================
// TEMPLATE REGISTRY
// ============================================================================

const GENRE_TEMPLATES: Record<ScriptGenre, GenreTemplate> = {
  documentary: DOCUMENTARY_TEMPLATE,
  educational: EDUCATIONAL_TEMPLATE,
  narrative_fiction: NARRATIVE_FICTION_TEMPLATE,
  historical_fiction: HISTORICAL_FICTION_TEMPLATE,
  opinion_essay: OPINION_ESSAY_TEMPLATE,
  tutorial: TUTORIAL_TEMPLATE,
  news: NEWS_TEMPLATE,
};

/**
 * Get the template for a genre
 */
export function getGenreTemplate(genre: ScriptGenre): GenreTemplate {
  return GENRE_TEMPLATES[genre];
}

/**
 * Get recommended beat types for a position in a genre
 */
export function getRecommendedBeatTypesForPosition(
  genre: ScriptGenre,
  position: number
): BeatType[] {
  const template = GENRE_TEMPLATES[genre];
  
  for (const structure of template.recommendedStructure) {
    if (position >= structure.positionRange.start && position < structure.positionRange.end) {
      return structure.beatTypes;
    }
  }
  
  return ['information']; // Default fallback
}

/**
 * Get section name for a position in a genre
 */
export function getSectionNameForPosition(
  genre: ScriptGenre,
  position: number
): string {
  const template = GENRE_TEMPLATES[genre];
  
  for (const structure of template.recommendedStructure) {
    if (position >= structure.positionRange.start && position < structure.positionRange.end) {
      return structure.section;
    }
  }
  
  return 'Main';
}
