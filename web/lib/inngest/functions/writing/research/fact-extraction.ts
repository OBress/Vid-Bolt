/**
 * Fact Extraction & Verification
 * ============================================================================
 * Extracts facts from web search results and assigns confidence levels.
 */

import { generateWithWebSearch, generateJSONWithWebSearch, type UrlCitation } from '@/lib/ai/openrouter';
import type { 
  VerifiedFact, 
  AttributableQuote, 
  TimelineEvent,
  KeyEntity,
  SourceCitation,
  ConfidenceLevel,
  ReliabilityTier,
} from '../types';
import { UNIVERSAL_PROMPTS } from '../prompts';
import { 
  generateFactId, 
  generateQuoteId, 
  generateTimelineId,
  assignConfidenceLevel,
} from '../utils';
import type { ResearchQuestion } from './topic-decomposition';

// ============================================================================
// TYPES
// ============================================================================

export interface ExtractedFacts {
  /** Verified facts */
  facts: VerifiedFact[];
  /** Attributable quotes */
  quotes: AttributableQuote[];
  /** Timeline events */
  timelineEvents: TimelineEvent[];
  /** Key entities */
  entities: KeyEntity[];
  /** All source citations */
  allCitations: SourceCitation[];
  /** Research gaps identified */
  gaps: string[];
}

export interface ExtractionOptions {
  /** Whether this is light (verification only) research */
  isLightResearch?: boolean;
  /** Source preferences from user */
  sourcePreferences?: string;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Extract and verify facts using web search.
 * 
 * @param userId - User ID for API calls
 * @param topic - Main topic being researched
 * @param questions - Research questions to answer
 * @param options - Extraction options
 * @returns Extracted and verified facts
 */
export async function extractAndVerifyFacts(
  userId: string,
  topic: string,
  questions: ResearchQuestion[],
  options: ExtractionOptions = {}
): Promise<ExtractedFacts> {
  const { isLightResearch = false, sourcePreferences } = options;

  const allFacts: VerifiedFact[] = [];
  const allQuotes: AttributableQuote[] = [];
  const allTimelineEvents: TimelineEvent[] = [];
  const allEntities: KeyEntity[] = [];
  const allCitations: SourceCitation[] = [];
  const gaps: string[] = [];

  // Process questions in batches to avoid overwhelming the API
  const batchSize = isLightResearch ? 3 : 5;
  const questionBatches = chunkArray(questions, batchSize);

  for (let batchIndex = 0; batchIndex < questionBatches.length; batchIndex++) {
    const batch = questionBatches[batchIndex];
    console.log(`[FactExtraction] Processing batch ${batchIndex + 1}/${questionBatches.length}`);

    // Build search query from batch questions
    const searchQuery = batch
      .flatMap(q => q.searchQueries.slice(0, 2))
      .join('. ');

    const userPrompt = `Research the following topic and questions:

TOPIC: ${topic}
${sourcePreferences ? `SOURCE PREFERENCES: ${sourcePreferences}` : ''}

QUESTIONS TO ANSWER:
${batch.map(q => `- [${q.category.toUpperCase()}] ${q.question}`).join('\n')}

Extract from the web search results:
1. Verified facts with sources
2. Notable quotes with attribution
3. Timeline events with dates
4. Key people, places, organizations

Return as JSON:
{
  "facts": [
    {
      "statement": "The factual claim",
      "sources": [{ "title": "Source", "url": "URL", "excerpt": "relevant text" }],
      "conflictingInfo": null
    }
  ],
  "quotes": [
    {
      "quote": "The exact quote",
      "speaker": "Person name",
      "speakerTitle": "Their role/title",
      "context": "When/why it was said",
      "sourceTitle": "Where it appeared"
    }
  ],
  "timeline": [
    {
      "date": "YYYY-MM-DD or approximate",
      "description": "What happened",
      "significance": "Why it matters"
    }
  ],
  "entities": [
    {
      "type": "person|location|organization",
      "name": "Entity name",
      "role": "Their role in the story",
      "details": "Key details"
    }
  ],
  "gaps": ["Questions that couldn't be answered"]
}`;

    try {
      const { data, citations } = await generateJSONWithWebSearch<{
        facts: Array<{
          statement: string;
          sources: Array<{ title: string; url?: string; excerpt?: string }>;
          conflictingInfo?: string;
        }>;
        quotes: Array<{
          quote: string;
          speaker: string;
          speakerTitle?: string;
          context?: string;
          sourceTitle?: string;
        }>;
        timeline: Array<{
          date: string;
          description: string;
          significance?: string;
        }>;
        entities: Array<{
          type: 'person' | 'location' | 'organization';
          name: string;
          role: string;
          details: string;
        }>;
        gaps: string[];
      }>(
        userId,
        UNIVERSAL_PROMPTS.factExtraction,
        userPrompt,
        { searchContextSize: isLightResearch ? 'low' : 'high' }
      );

      // Convert web citations to source citations
      const sourceCitations = convertCitationsToSources(citations);
      allCitations.push(...sourceCitations);

      // Process facts
      for (const fact of data.facts || []) {
        const factSources = fact.sources.map(s => ({
          title: s.title,
          url: s.url,
          excerpt: s.excerpt,
          reliabilityTier: estimateReliabilityTier(s.url) as ReliabilityTier,
        }));

        allFacts.push({
          id: generateFactId(allFacts.length),
          statement: fact.statement,
          sources: factSources,
          confidence: assignConfidenceLevel(factSources),
          notes: fact.conflictingInfo,
        });
      }

      // Process quotes
      for (const quote of data.quotes || []) {
        allQuotes.push({
          id: generateQuoteId(allQuotes.length),
          quote: quote.quote,
          speaker: quote.speaker,
          speakerTitle: quote.speakerTitle,
          context: quote.context,
          source: {
            title: quote.sourceTitle || 'Unknown source',
            reliabilityTier: 3 as ReliabilityTier,
          },
        });
      }

      // Process timeline events
      for (const event of data.timeline || []) {
        allTimelineEvents.push({
          id: generateTimelineId(allTimelineEvents.length),
          date: event.date,
          description: event.description,
          source: sourceCitations[0] || { title: 'Research', reliabilityTier: 3 as ReliabilityTier },
          significance: event.significance,
        });
      }

      // Process entities
      for (const entity of data.entities || []) {
        // Avoid duplicates
        if (!allEntities.some(e => e.name.toLowerCase() === entity.name.toLowerCase())) {
          allEntities.push(entity);
        }
      }

      // Collect gaps
      gaps.push(...(data.gaps || []));

    } catch (error) {
      console.error(`[FactExtraction] Error processing batch ${batchIndex + 1}:`, error);
      gaps.push(`Failed to research: ${batch.map(q => q.question).join(', ')}`);
    }
  }

  console.log(`[FactExtraction] Complete: ${allFacts.length} facts, ${allQuotes.length} quotes, ${allTimelineEvents.length} events`);

  return {
    facts: allFacts,
    quotes: allQuotes,
    timelineEvents: allTimelineEvents,
    entities: allEntities,
    allCitations,
    gaps,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert OpenRouter URL citations to SourceCitations
 */
function convertCitationsToSources(citations: UrlCitation[]): SourceCitation[] {
  return citations.map(c => ({
    url: c.url,
    title: c.title,
    excerpt: c.content,
    reliabilityTier: estimateReliabilityTier(c.url) as ReliabilityTier,
  }));
}

/**
 * Estimate reliability tier from URL domain
 */
function estimateReliabilityTier(url?: string): number {
  if (!url) return 5;

  const domain = extractDomain(url).toLowerCase();

  // Tier 1: Academic, government, official
  const tier1Patterns = [
    /\.gov\b/,
    /\.edu\b/,
    /jstor\.org/,
    /pubmed/,
    /nature\.com/,
    /science\.org/,
    /ieee\.org/,
    /acm\.org/,
  ];
  if (tier1Patterns.some(p => p.test(domain))) return 1;

  // Tier 2: Major news, established sources
  const tier2Domains = [
    'nytimes.com', 'washingtonpost.com', 'bbc.com', 'bbc.co.uk',
    'reuters.com', 'apnews.com', 'theguardian.com', 'wsj.com',
    'economist.com', 'npr.org', 'pbs.org', 'cnn.com', 'forbes.com',
    'bloomberg.com', 'ft.com', 'time.com', 'nationalgeographic.com',
  ];
  if (tier2Domains.some(d => domain.includes(d))) return 2;

  // Tier 3: Books, documentaries, credentialed authors
  const tier3Patterns = [
    /britannica/,
    /history\.com/,
    /smithsonian/,
    /discovery/,
    /amazon\.com\/.*dp\//,
  ];
  if (tier3Patterns.some(p => p.test(domain))) return 3;

  // Tier 5: Wikipedia (needs verification)
  if (domain.includes('wikipedia')) return 5;

  // Tier 4: Everything else (blogs, forums, etc.)
  return 4;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * Chunk array into smaller arrays
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Deduplicate facts by statement similarity
 */
export function deduplicateFacts(facts: VerifiedFact[]): VerifiedFact[] {
  const seen = new Map<string, VerifiedFact>();
  
  for (const fact of facts) {
    const normalized = fact.statement.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const existing = seen.get(normalized);
    
    if (existing) {
      // Merge sources
      existing.sources.push(...fact.sources);
      // Update confidence based on combined sources
      existing.confidence = assignConfidenceLevel(existing.sources);
    } else {
      seen.set(normalized, { ...fact });
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Sort facts by confidence level
 */
export function sortFactsByConfidence(facts: VerifiedFact[]): VerifiedFact[] {
  const confidenceOrder: Record<ConfidenceLevel, number> = {
    verified: 0,
    high: 1,
    medium: 2,
    low: 3,
    conflicted: 4,
    unverified: 5,
  };
  
  return [...facts].sort((a, b) => 
    confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
  );
}
