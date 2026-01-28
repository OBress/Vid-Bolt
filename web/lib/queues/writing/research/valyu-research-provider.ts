/**
 * Valyu Research Provider
 * ============================================================================
 * Replaces OpenRouter web search with Valyu APIs for comprehensive research.
 * 
 * Research Toggle Mapping:
 * - 'deep'  → Valyu DeepResearch (standard mode, ~10-15 min)
 * - 'full'  → Valyu Search with multiple queries (~3-5 min)
 * - 'light' → Valyu Search with single query (~1 min)
 */

import { 
  valyuSearch, 
  performDeepResearch 
} from '@/lib/valyu';
import type { 
  ValyuSearchResult, 
  ValyuDeepResearchResult,
  MappedValyuSource,
} from '@/lib/valyu/types';
import type { 
  VerifiedFact, 
  AttributableQuote, 
  TimelineEvent,
  KeyEntity,
  SourceCitation,
  ReliabilityTier,
} from '../types';
import { 
  generateFactId, 
  generateQuoteId, 
  generateTimelineId,
  generateSourceId,
  assignConfidenceLevel,
} from '../utils';
import type { ResearchQuestion } from './topic-decomposition';
import type { ExtractedFacts } from './fact-extraction';

// ============================================================================
// TYPES
// ============================================================================

export interface ValyuResearchOptions {
  userId: string;
  topic: string;
  questions: ResearchQuestion[];
  researchToggle: 'deep' | 'full' | 'light';
  sourcePreferences?: string;
  onProgress?: (status: string, elapsedMs: number) => void;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Perform research using Valyu APIs based on research toggle
 * 
 * @param options - Research configuration
 * @returns Extracted facts in the standard format
 */
export async function performValyuResearch(
  options: ValyuResearchOptions
): Promise<ExtractedFacts> {
  const { userId, topic, questions, researchToggle, sourcePreferences, onProgress } = options;

  console.log(`[ValyuResearch] Starting ${researchToggle} research for: "${topic.substring(0, 50)}..."`);
  console.log(`[ValyuResearch] Questions to answer: ${questions.length}`);

  switch (researchToggle) {
    case 'deep':
      return performDeepModeResearch(userId, topic, questions, sourcePreferences, onProgress);
    case 'full':
      return performFullModeResearch(userId, topic, questions, sourcePreferences);
    case 'light':
      return performLightModeResearch(userId, topic, questions);
  }
}

// ============================================================================
// RESEARCH MODE IMPLEMENTATIONS
// ============================================================================

/**
 * Deep Research - Valyu DeepResearch API (standard mode)
 * Estimated time: 10-15 minutes
 * 
 * Uses Valyu's comprehensive async research with structured output.
 */
async function performDeepModeResearch(
  userId: string,
  topic: string,
  questions: ResearchQuestion[],
  sourcePreferences?: string,
  onProgress?: (status: string, elapsedMs: number) => void
): Promise<ExtractedFacts> {
  console.log('[ValyuResearch] Starting DeepResearch (fast mode)...');

  // Build comprehensive research query
  const researchQuery = buildDeepResearchQuery(topic, questions, sourcePreferences);

  // Perform deep research - using 'fast' mode for quicker results (~5-10 min)
  const result = await performDeepResearch(researchQuery, 'fast', {
    strategy: buildResearchStrategy(sourcePreferences),
    maxWaitMs: 12 * 60 * 1000, // 12 minutes timeout
    onProgress,
  });

  // Transform to ExtractedFacts
  return transformDeepResearchToFacts(result, topic);
}

/**
 * Full Research - Multiple Valyu Search calls
 * Estimated time: 3-5 minutes
 * 
 * Performs multiple targeted searches to gather comprehensive information.
 */
async function performFullModeResearch(
  userId: string,
  topic: string,
  questions: ResearchQuestion[],
  sourcePreferences?: string
): Promise<ExtractedFacts> {
  console.log('[ValyuResearch] Starting Full Research (optimized broad-query search)...');

  const allResults: ValyuSearchResult[] = [];
  const processedUrls = new Set<string>();

  // VALYU OPTIMIZED: Use fewer, broader queries with more results each
  // - Same total retrievals (3×25 ≈ 8×10)
  // - 3x faster (fewer API calls)
  // - Better Valyu semantic ranking with comprehensive queries
  const searchQueries = questions
    .slice(0, 3)  // Only top 3 priority questions
    .map(q => q.searchQueries[0]); // Primary query only

  // Execute searches sequentially (to avoid rate limiting)
  for (let i = 0; i < searchQueries.length; i++) {
    const query = searchQueries[i];
    console.log(`[ValyuResearch] Search ${i + 1}/${searchQueries.length}: "${query.substring(0, 50)}..."`);

    try {
      const response = await valyuSearch({
        query: `${topic}: ${query}`,
        search_type: 'web',
        max_num_results: 20,  // Valyu max limit is 20
        response_length: 'large',
      });

      // Deduplicate by URL
      for (const result of response.results) {
        if (!processedUrls.has(result.url)) {
          processedUrls.add(result.url);
          allResults.push(result);
        }
      }

      // Small delay between requests
      if (i < searchQueries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`[ValyuResearch] Search failed for query: ${query}`, error);
    }
  }

  console.log(`[ValyuResearch] Total unique results: ${allResults.length}`);

  // Transform to ExtractedFacts (pass userId for LLM extraction)
  return transformSearchResultsToFacts(userId, allResults, topic);
}

/**
 * Light Research - Single Valyu Search call
 * Estimated time: ~1 minute
 * 
 * Quick verification search for fact-checking.
 */
async function performLightModeResearch(
  userId: string,
  topic: string,
  questions: ResearchQuestion[]
): Promise<ExtractedFacts> {
  console.log('[ValyuResearch] Starting Light Research (optimized single query)...');

  // VALYU OPTIMIZED: Use comprehensive query with more results
  const comprehensiveQuery = `Comprehensive overview of ${topic} including key facts, history, notable figures, recent developments, and expert perspectives`;
  
  const response = await valyuSearch({
    query: comprehensiveQuery,
    search_type: 'web',
    max_num_results: 20,  // Valyu max limit
    response_length: 'medium',
  });

  console.log(`[ValyuResearch] Found ${response.results.length} results`);

  return transformSearchResultsToFacts(userId, response.results, topic);
}

// ============================================================================
// QUERY BUILDERS
// ============================================================================

/**
 * Build a comprehensive query for DeepResearch
 */
function buildDeepResearchQuery(
  topic: string,
  questions: ResearchQuestion[],
  sourcePreferences?: string
): string {
  const questionsList = questions
    .slice(0, 10) // Limit to top 10 questions
    .map(q => `- ${q.question}`)
    .join('\n');

  let query = `
Comprehensive research on: ${topic}

Key questions to investigate:
${questionsList}

Research requirements:
1. Find verified facts with credible sources
2. Identify notable quotes from experts or key figures
3. Establish a timeline of key events
4. Identify important people, places, and organizations
5. Note any conflicting information or debates
`.trim();

  if (sourcePreferences) {
    query += `\n\nSource preferences: ${sourcePreferences}`;
  }

  return query;
}

/**
 * Build research strategy for DeepResearch
 */
function buildResearchStrategy(sourcePreferences?: string): string {
  let strategy = `
You are researching for a documentary/educational video production.

Focus on:
- Verified, factual information from credible sources
- Expert quotes and firsthand accounts
- Chronological sequence of events
- Key figures, locations, and organizations
- Multiple perspectives where relevant

For each fact or claim, cite the source with URL.
Prioritize academic sources, major news outlets, and official sources.
`.trim();

  if (sourcePreferences) {
    strategy += `\n\nAdditional source preferences: ${sourcePreferences}`;
  }

  return strategy;
}

// ============================================================================
// TRANSFORMERS
// ============================================================================

/**
 * Transform Valyu DeepResearch results to ExtractedFacts
 */
function transformDeepResearchToFacts(
  result: ValyuDeepResearchResult,
  topic: string
): ExtractedFacts {
  const facts: VerifiedFact[] = [];
  const quotes: AttributableQuote[] = [];
  const timelineEvents: TimelineEvent[] = [];
  const entities: KeyEntity[] = [];
  const allCitations: SourceCitation[] = [];
  const rawSourceContent: string[] = [];

  // Map sources to citations
  const sourceMap = new Map<string, SourceCitation>();
  
  for (let i = 0; i < result.sources.length; i++) {
    const src = result.sources[i];
    const sourceId = generateSourceId(i);
    const citation: SourceCitation = {
      id: sourceId,
      url: src.url,
      title: src.title,
      excerpt: src.snippet,
      reliabilityTier: estimateReliabilityTier(src.url),
      author: src.author,
      date: src.publication_date,
      fullContent: src.snippet, // Use snippet as full content for deep research
    };
    sourceMap.set(src.url, citation);
    allCitations.push(citation);

    // Store raw content for writer
    rawSourceContent.push(
      `=== SOURCE: ${src.title} [${sourceId}] ===\n` +
      `URL: ${src.url}\n\n${src.snippet}\n`
    );
  }

  // Process structured output if available
  if (result.structured_output) {
    // Process facts
    if (result.structured_output.facts) {
      for (const f of result.structured_output.facts) {
        const factSources = f.sources
          .map(url => sourceMap.get(url))
          .filter((s): s is SourceCitation => s !== undefined);

        facts.push({
          id: generateFactId(facts.length),
          statement: f.statement,
          sources: factSources.length > 0 ? factSources : [{
            title: 'Valyu Research',
            reliabilityTier: 3 as ReliabilityTier,
          }],
          confidence: assignConfidenceLevel(factSources),
          primarySourceId: factSources[0]?.id,
        });
      }
    }

    // Process quotes
    if (result.structured_output.quotes) {
      for (const q of result.structured_output.quotes) {
        quotes.push({
          id: generateQuoteId(quotes.length),
          quote: q.quote,
          speaker: q.speaker,
          context: q.context,
          source: {
            title: q.source || 'Valyu Research',
            reliabilityTier: 3 as ReliabilityTier,
          },
        });
      }
    }

    // Process timeline
    if (result.structured_output.timeline) {
      for (const t of result.structured_output.timeline) {
        timelineEvents.push({
          id: generateTimelineId(timelineEvents.length),
          date: t.date,
          description: t.event,
          significance: t.significance,
          source: allCitations[0] || {
            title: 'Valyu Research',
            reliabilityTier: 3 as ReliabilityTier,
          },
        });
      }
    }

    // Process entities
    if (result.structured_output.entities) {
      for (const e of result.structured_output.entities) {
        entities.push({
          name: e.name,
          type: e.type as 'person' | 'location' | 'organization',
          role: e.description || '',
          details: '',
        });
      }
    }
  }

  console.log(`[ValyuResearch:Transform] DeepResearch -> ${facts.length} facts, ${quotes.length} quotes, ${timelineEvents.length} events`);

  return {
    facts,
    quotes,
    timelineEvents,
    entities,
    allCitations,
    gaps: [],
    rawSourceContent,
  };
}

/**
 * Transform Valyu Search results to ExtractedFacts
 * Uses LLM to extract structured facts from the raw source content
 */
async function transformSearchResultsToFacts(
  userId: string,
  results: ValyuSearchResult[],
  topic: string
): Promise<ExtractedFacts> {
  const allCitations: SourceCitation[] = [];
  const rawSourceContent: string[] = [];

  // Convert results to citations
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const sourceId = generateSourceId(i);
    
    allCitations.push({
      id: sourceId,
      url: r.url,
      title: r.title,
      excerpt: r.description || r.content.substring(0, 300),
      fullContent: r.content,
      reliabilityTier: estimateReliabilityTier(r.url),
      author: r.author,
      date: r.publication_date,
    });

    rawSourceContent.push(
      `=== SOURCE: ${r.title} [${sourceId}] ===\n` +
      `URL: ${r.url}\n\n${r.content}\n`
    );
  }

  console.log(`[ValyuResearch:Transform] Search -> ${allCitations.length} sources gathered`);

  // Use LLM to extract facts from the gathered sources
  const extractedData = await extractFactsFromValyuSources(userId, topic, rawSourceContent, allCitations);
  
  console.log(`[ValyuResearch:Transform] LLM extracted ${extractedData.facts.length} facts, ${extractedData.quotes.length} quotes`);

  return {
    facts: extractedData.facts,
    quotes: extractedData.quotes,
    timelineEvents: extractedData.timelineEvents,
    entities: extractedData.entities,
    allCitations,
    gaps: extractedData.gaps,
    rawSourceContent,
  };
}

/**
 * Extract structured facts from Valyu source content using LLM
 */
async function extractFactsFromValyuSources(
  userId: string,
  topic: string,
  rawSourceContent: string[],
  citations: SourceCitation[]
): Promise<{
  facts: VerifiedFact[];
  quotes: AttributableQuote[];
  timelineEvents: TimelineEvent[];
  entities: KeyEntity[];
  gaps: string[];
}> {
  // Limit source content to avoid token limits (use first ~50KB of content)
  const contentLimit = 50000;
  let totalChars = 0;
  const limitedContent: string[] = [];
  
  for (const content of rawSourceContent) {
    if (totalChars + content.length > contentLimit) {
      // Add truncated content
      const remaining = contentLimit - totalChars;
      if (remaining > 500) {
        limitedContent.push(content.substring(0, remaining) + '\n[TRUNCATED]');
      }
      break;
    }
    limitedContent.push(content);
    totalChars += content.length;
  }

  const systemPrompt = `You are a research assistant extracting verified facts from web sources for documentary video production.

Your task is to read through the provided source material and extract:
1. Verified facts with their source IDs
2. Notable quotes with attribution
3. Timeline events with dates
4. Key entities (people, places, organizations)

Be thorough but accurate. Only include facts that are clearly stated in the sources.
For each fact, reference the source ID (e.g., SRC-001) in your response.`;

  const userPrompt = `Topic: ${topic}

=== SOURCE MATERIAL ===
${limitedContent.join('\n\n')}

=== INSTRUCTIONS ===
Extract all relevant information from these sources. Return as JSON:

{
  "facts": [
    {
      "statement": "The factual claim",
      "sourceIds": ["SRC-001"],
      "confidence": "high" | "medium" | "low"
    }
  ],
  "quotes": [
    {
      "quote": "The exact quote",
      "speaker": "Person name",
      "context": "When/why it was said",
      "sourceId": "SRC-001"
    }
  ],
  "timeline": [
    {
      "date": "YYYY or approximate date",
      "description": "What happened",
      "significance": "Why it matters"
    }
  ],
  "entities": [
    {
      "type": "person" | "location" | "organization",
      "name": "Entity name",
      "role": "Their role in the topic"
    }
  ],
  "gaps": ["Questions that couldn't be answered from these sources"]
}`;

  try {
    // Use a direct LLM call instead of web search (we already have the content)
    const { generateJSON } = await import('@/lib/ai/openrouter');
    
    const result = await generateJSON<{
      facts: Array<{
        statement: string;
        sourceIds: string[];
        confidence: 'high' | 'medium' | 'low';
      }>;
      quotes: Array<{
        quote: string;
        speaker: string;
        context?: string;
        sourceId?: string;
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
      }>;
      gaps: string[];
    }>(
      userId,
      systemPrompt,
      userPrompt,
      { model: 'openai/gpt-4o-mini' } // Use cheaper model for extraction
    );

    // Build citation lookup
    const citationMap = new Map<string, SourceCitation>();
    for (const c of citations) {
      citationMap.set(c.id!, c);
    }

    // Transform to our types
    const facts: VerifiedFact[] = (result.facts || []).map((f, i) => {
      const sources = f.sourceIds
        .map(id => citationMap.get(id))
        .filter((s): s is SourceCitation => s !== undefined);
      
      return {
        id: generateFactId(i),
        statement: f.statement,
        sources: sources.length > 0 ? sources : [{
          title: 'Valyu Research',
          reliabilityTier: 4 as ReliabilityTier,
        }],
        confidence: f.confidence === 'high' ? 'high' : f.confidence === 'medium' ? 'medium' : 'low' as any,
        primarySourceId: sources[0]?.id,
      };
    });

    const quotes: AttributableQuote[] = (result.quotes || []).map((q, i) => ({
      id: generateQuoteId(i),
      quote: q.quote,
      speaker: q.speaker,
      context: q.context,
      source: q.sourceId ? (citationMap.get(q.sourceId) || {
        title: 'Valyu Research',
        reliabilityTier: 4 as ReliabilityTier,
      }) : {
        title: 'Valyu Research',
        reliabilityTier: 4 as ReliabilityTier,
      },
    }));

    const timelineEvents: TimelineEvent[] = (result.timeline || []).map((t, i) => ({
      id: generateTimelineId(i),
      date: t.date,
      description: t.description,
      significance: t.significance,
      source: citations[0] || {
        title: 'Valyu Research',
        reliabilityTier: 4 as ReliabilityTier,
      },
    }));

    const entities: KeyEntity[] = (result.entities || []).map(e => ({
      name: e.name,
      type: e.type,
      role: e.role,
      details: '',
    }));

    return {
      facts,
      quotes,
      timelineEvents,
      entities,
      gaps: result.gaps || [],
    };

  } catch (error) {
    console.error('[ValyuResearch:Transform] LLM extraction failed:', error);
    // Return empty results on failure
    return {
      facts: [],
      quotes: [],
      timelineEvents: [],
      entities: [],
      gaps: ['LLM extraction failed'],
    };
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Estimate reliability tier from URL domain
 */
function estimateReliabilityTier(url?: string): ReliabilityTier {
  if (!url) return 5 as ReliabilityTier;

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
    /arxiv\.org/,
  ];
  if (tier1Patterns.some(p => p.test(domain))) return 1 as ReliabilityTier;

  // Tier 2: Major news, established sources
  const tier2Domains = [
    'nytimes.com', 'washingtonpost.com', 'bbc.com', 'bbc.co.uk',
    'reuters.com', 'apnews.com', 'theguardian.com', 'wsj.com',
    'economist.com', 'npr.org', 'pbs.org', 'cnn.com', 'forbes.com',
    'bloomberg.com', 'ft.com', 'time.com', 'nationalgeographic.com',
  ];
  if (tier2Domains.some(d => domain.includes(d))) return 2 as ReliabilityTier;

  // Tier 3: Reference, documentaries, credentialed
  const tier3Patterns = [
    /britannica/,
    /history\.com/,
    /smithsonian/,
    /discovery/,
    /amazon\.com\/.*dp\//,
  ];
  if (tier3Patterns.some(p => p.test(domain))) return 3 as ReliabilityTier;

  // Tier 5: Wikipedia (needs verification)
  if (domain.includes('wikipedia')) return 5 as ReliabilityTier;

  // Tier 4: Everything else
  return 4 as ReliabilityTier;
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
