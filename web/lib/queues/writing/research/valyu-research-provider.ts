/**
 * Valyu Research Provider
 * ============================================================================
 * Replaces OpenRouter web search with Valyu APIs for comprehensive research.
 * 
 * Research Toggle Mapping:
 * - 'full' → Valyu DeepResearch (maximum extraction mode)
 * - 'off'  → Skip research (handled at orchestrator level)
 */

import { 
  performDeepResearch 
} from '@/lib/valyu';
import { getValyuApiKey } from '@/lib/services/api-keys';
import type { 
  ValyuSearchResult, 
  ValyuDeepResearchResult,
} from '@/lib/valyu/types';
import type { 
  VerifiedFact, 
  AttributableQuote, 
  TimelineEvent,
  KeyEntity,
  KeyEntityV2,
  SourceCitation,
  ReliabilityTier,
  ConfidenceLevel,
  NarrativeContext,
  KeyDevelopment,
} from '../types';
import { 
  generateFactId, 
  generateQuoteId, 
  generateTimelineId,
  generateSourceId,
} from '../utils';
import type { ResearchQuestion } from './topic-decomposition';
import type { ExtractedFacts } from './fact-extraction';

// ============================================================================
// TYPES
// ============================================================================

export interface ValyuResearchOptions {
  userId: string;
  topic: string;
  questions?: ResearchQuestion[]; // Optional - not used for DeepResearch (it handles decomposition internally)
  researchToggle: 'full';
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
  console.log(`[ValyuResearch] Questions to answer: ${questions?.length ?? 0} (DeepResearch handles decomposition internally)`);

  switch (researchToggle) {
    case 'full':
      // Full research uses DeepResearch for maximum information extraction
      return performDeepModeResearch(userId, topic, sourcePreferences, onProgress);
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
  sourcePreferences?: string,
  onProgress?: (status: string, elapsedMs: number) => void
): Promise<ExtractedFacts> {
  console.log('[ValyuResearch] Starting DeepResearch (single-query mode)...');

  // Resolve the user's Valyu API key from Supabase
  const valyuApiKey = await getValyuApiKey(userId);

  // Build clean query - DeepResearch handles decomposition internally
  const researchQuery = buildDeepResearchQuery(topic, sourcePreferences);

  // Perform deep research - using 'fast' mode for quicker results (~5-10 min)
  const result = await performDeepResearch(researchQuery, valyuApiKey, 'fast', {
    strategy: buildResearchStrategy(sourcePreferences),
    maxWaitMs: 12 * 60 * 1000, // 12 minutes timeout
    onProgress,
  });

  // Transform to ExtractedFacts (pass userId for LLM fallback extraction)
  return transformDeepResearchToFacts(result, topic, userId);
}

// ============================================================================
// QUERY BUILDERS
// ============================================================================

/**
 * Build a comprehensive query for DeepResearch (single query mode)
 * DeepResearch handles its own chain-of-thought decomposition internally
 */
function buildDeepResearchQuery(
  topic: string,
  sourcePreferences?: string
): string {
  let query = `
Research topic: ${topic}

Provide comprehensive research in the following structure:

1. NARRATIVE CONTEXT
   - Hook: 1-2 sentence attention grabber
   - Summary: 3-5 sentence complete overview
   - Background: Context needed to understand the event
   - Prior Events: What led to this
   - Key Terms: Important terminology with definitions

2. KEY DEVELOPMENTS (chronological story beats)
   - Timestamp (if known)
   - What happened
   - Who was involved
   - Why it matters to the story
   - Source attribution

3. VERIFIED FACTS
   - Factual statements with source attribution
   - Confidence level (confirmed/likely/disputed)
   - Date/time if applicable

4. NOTABLE QUOTES
   - Direct quotes from key figures
   - Speaker name, role, and context
   - Source attribution

5. KEY ENTITIES
   - People: name, role, bio, actions in this story
   - Organizations: name, type, relevance
   - Locations: name, significance

6. TIMELINE
   - Chronological list of key events with dates

7. INFORMATION GAPS
   - What's missing or unverified
   - Conflicting reports
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
 * Falls back to LLM extraction if structured_output is empty
 */
async function transformDeepResearchToFacts(
  result: ValyuDeepResearchResult,
  topic: string,
  userId?: string
): Promise<ExtractedFacts> {
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

  // Check if we have meaningful structured output from Valyu (v1 or v2 schema)
  const so = result.structured_output as Record<string, unknown> | undefined;
  const hasStructuredFacts = Array.isArray(so?.facts) && (so.facts as unknown[]).length > 0;
  const hasStructuredQuotes = Array.isArray(so?.quotes) && (so.quotes as unknown[]).length > 0;
  const hasStructuredTimeline = Array.isArray(so?.timeline) && (so.timeline as unknown[]).length > 0;
  const hasStructuredEntities = Array.isArray(so?.entities) && (so.entities as unknown[]).length > 0;
  // V2 schema fields
  const hasNarrative = so?.narrative && typeof so.narrative === 'object';
  const hasKeyDevelopments = Array.isArray(so?.keyDevelopments) && (so.keyDevelopments as unknown[]).length > 0;
  
  const hasAnyStructuredOutput = hasStructuredFacts || hasStructuredQuotes || hasStructuredTimeline || hasStructuredEntities || hasNarrative || hasKeyDevelopments;

  // Log detailed info about what we received
  console.log(`[ValyuResearch:Transform] Structured output check:`);
  console.log(`  - facts: ${hasStructuredFacts ? (so?.facts as unknown[])?.length : 'none'}`);
  console.log(`  - quotes: ${hasStructuredQuotes ? (so?.quotes as unknown[])?.length : 'none'}`);
  console.log(`  - timeline: ${hasStructuredTimeline ? (so?.timeline as unknown[])?.length : 'none'}`);
  console.log(`  - entities: ${hasStructuredEntities ? (so?.entities as unknown[])?.length : 'none'}`);
  console.log(`  - narrative: ${hasNarrative ? 'yes' : 'none'}`);
  console.log(`  - keyDevelopments: ${hasKeyDevelopments ? (so?.keyDevelopments as unknown[])?.length : 'none'}`);

  // If Valyu didn't return structured output but we have sources or markdown output,
  // fall back to LLM extraction (same as Search mode)
  if (!hasAnyStructuredOutput && (result.sources.length > 0 || result.output)) {
    console.log(`[ValyuResearch:Transform] No structured output from Valyu, falling back to LLM extraction from ${result.sources.length} sources`);
    
    // If we have markdown output, add it to the raw content
    if (result.output) {
      rawSourceContent.unshift(
        `=== VALYU DEEP RESEARCH OUTPUT ===\n${result.output}\n`
      );
    }
    
    // Use LLM extraction (same pattern as Search mode)
    if (userId) {
      const extractedData = await extractFactsFromValyuSources(
        userId,
        topic,
        rawSourceContent,
        allCitations
      );
      
      console.log(`[ValyuResearch:Transform] LLM fallback extracted ${extractedData.facts.length} facts, ${extractedData.quotes.length} quotes`);
      
      return {
        facts: extractedData.facts,
        quotes: extractedData.quotes,
        timelineEvents: extractedData.timelineEvents,
        entities: extractedData.entities,
        allCitations,
        gaps: extractedData.gaps,
        rawSourceContent,
        // V2 fields
        narrative: extractedData.narrative,
        keyDevelopments: extractedData.keyDevelopments,
        entitiesV2: extractedData.entitiesV2,
      };
    } else {
      console.warn('[ValyuResearch:Transform] No userId provided, cannot use LLM fallback');
    }
  }

  // Process structured output if available (handle both v1 and v2 schemas)
  let narrative: NarrativeContext | undefined;
  const keyDevelopments: KeyDevelopment[] = [];
  const entitiesV2: KeyEntityV2[] = [];
  const gaps: string[] = [];

  if (so) {
    // Process V2 narrative (if present)
    if (hasNarrative) {
      const n = so.narrative as { hook?: string; summary?: string; background?: string; priorEvents?: string[]; keyTerms?: Record<string, string> };
      narrative = {
        hook: n.hook || '',
        summary: n.summary || '',
        background: n.background || '',
        priorEvents: n.priorEvents || [],
        keyTerms: n.keyTerms || {},
      };
      console.log(`[ValyuResearch:Transform] Extracted narrative with hook: "${narrative.hook?.substring(0, 50)}..."`);
    }

    // Process V2 keyDevelopments (if present)
    if (hasKeyDevelopments) {
      const kds = so.keyDevelopments as Array<{ timestamp?: string; what: string; who?: string[]; significance: string; sources?: string[] }>;
      for (let i = 0; i < kds.length; i++) {
        const d = kds[i];
        keyDevelopments.push({
          id: `DEV-${String(i + 1).padStart(3, '0')}`,
          timestamp: d.timestamp || 'Unknown',
          what: d.what,
          who: d.who || [],
          significance: d.significance,
          sourceIds: d.sources || [],
        });
      }
      console.log(`[ValyuResearch:Transform] Extracted ${keyDevelopments.length} key developments`);
    }

    // Process facts (v1/v2 schema)
    if (hasStructuredFacts) {
      const factArray = so.facts as Array<{ 
        statement: string; 
        sources?: string[]; 
        confidence?: string | number;  // Can be string like "high" or number like 0.85
        primarySourceId?: string;
      }>;
      for (const f of factArray) {
        const factSources = (f.sources || [])
          .map(url => sourceMap.get(url))
          .filter((s): s is SourceCitation => s !== undefined);

        // Map Valyu-provided confidence to our ConfidenceLevel
        let factConfidence: ConfidenceLevel;
        if (typeof f.confidence === 'string') {
          // Valyu returns "high", "medium", "low"
          const confStr = f.confidence.toLowerCase();
          if (confStr === 'high' || confStr === 'verified') {
            factConfidence = 'high';
          } else if (confStr === 'medium') {
            factConfidence = 'medium';
          } else if (confStr === 'low') {
            factConfidence = 'low';
          } else {
            // Default to 'high' for DeepResearch facts - they are AI-verified
            factConfidence = 'high';
          }
        } else if (typeof f.confidence === 'number') {
          // Numeric confidence (0-1 scale)
          if (f.confidence >= 0.8) factConfidence = 'high';
          else if (f.confidence >= 0.6) factConfidence = 'medium';
          else factConfidence = 'low';
        } else {
          // No confidence provided - DeepResearch facts are AI-verified, default to 'high'
          factConfidence = 'high';
        }

        facts.push({
          id: generateFactId(facts.length),
          statement: f.statement,
          sources: factSources.length > 0 ? factSources : [{
            title: 'Valyu DeepResearch',
            reliabilityTier: 2 as ReliabilityTier, // DeepResearch is reliable
          }],
          confidence: factConfidence,
          primarySourceId: f.primarySourceId || factSources[0]?.id,
        });
      }
    }

    // Process quotes (v1 schema)
    if (hasStructuredQuotes) {
      const quoteArray = so.quotes as Array<{ quote: string; speaker: string; context?: string; source?: string }>;
      for (const q of quoteArray) {
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

    // Process timeline (v1 schema)
    if (hasStructuredTimeline) {
      const timelineArray = so.timeline as Array<{ date: string; event: string; significance?: string }>;
      for (const t of timelineArray) {
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

    // Process entities (handle both v1 and v2 schemas)
    if (hasStructuredEntities) {
      const entityArray = so.entities as Array<{ name: string; type: string; description?: string; role?: string; bio?: string; quotes?: string[]; actions?: string[] }>;
      for (const e of entityArray) {
        // V1 entity
        entities.push({
          name: e.name,
          type: e.type as 'person' | 'location' | 'organization',
          role: e.role || e.description || '',
          details: e.bio || '',
        });
        // V2 entity (with enhanced fields)
        entitiesV2.push({
          name: e.name,
          type: e.type as 'person' | 'location' | 'organization',
          role: e.role || e.description || '',
          details: e.bio || '',
          bio: e.bio || '',
          quoteIds: [], // Will be linked in dossier assembly
          actions: e.actions || [],
        });
      }
    }

    // Process verification gaps (v2 schema)
    if (Array.isArray(so.verificationGaps)) {
      gaps.push(...(so.verificationGaps as string[]));
    }
  }

  console.log(`[ValyuResearch:Transform] DeepResearch -> ${facts.length} facts, ${quotes.length} quotes, ${timelineEvents.length} events, ${keyDevelopments.length} developments`);

  return {
    facts,
    quotes,
    timelineEvents,
    entities,
    allCitations,
    gaps,
    rawSourceContent,
    // V2 fields
    narrative,
    keyDevelopments,
    entitiesV2,
  };
}

/**
 * Transform Valyu Search results to ExtractedFacts
 * Uses LLM to extract structured facts from the raw source content
 */
async function _transformSearchResultsToFacts(
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
    // V2 fields
    narrative: extractedData.narrative,
    keyDevelopments: extractedData.keyDevelopments,
    entitiesV2: extractedData.entitiesV2,
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
  entitiesV2: KeyEntityV2[];
  narrative?: NarrativeContext;
  keyDevelopments: KeyDevelopment[];
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

  const systemPrompt = `You are extracting research for a video script about a breaking news event.
The script writer has ZERO prior knowledge of this event - extract EVERYTHING needed.

Your task is to read through the provided source material and extract:
1. NARRATIVE CONTEXT: Hook, summary, background, prior events, key terms
2. KEY DEVELOPMENTS: Chronological story beats with who/what/significance
3. FACTS: Verified statements with source IDs
4. QUOTES: Notable quotes with speaker and context
5. ENTITIES: People, places, organizations with their role, bio, quotes, and actions

Be COMPREHENSIVE. The AI writing the script knows NOTHING about this event and relies entirely on your extraction.`;

  const userPrompt = `Topic: ${topic}

=== SOURCE MATERIAL ===
${limitedContent.join('\n\n')}

=== INSTRUCTIONS ===
Extract ALL relevant information from these sources. Return as JSON:

{
  "narrative": {
    "hook": "1-2 sentence attention grabber",
    "summary": "3-5 sentence complete overview",
    "background": "Background context needed to understand the event",
    "priorEvents": ["What led to this event"],
    "keyTerms": {"term": "definition"}
  },
  "keyDevelopments": [
    {
      "timestamp": "When it happened",
      "what": "What happened",
      "who": ["People/orgs involved"],
      "significance": "Why it matters",
      "sourceIds": ["SRC-001"]
    }
  ],
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
      "role": "Their role in the topic",
      "bio": "1-2 sentence background",
      "actions": ["What they did in this story"]
    }
  ],
  "gaps": ["Questions that couldn't be answered from these sources"]
}`;

  try {
    // Use a direct LLM call instead of web search (we already have the content)
    const { generateJSON } = await import('@/lib/ai/openrouter');
    
    const result = await generateJSON<{
      narrative?: {
        hook: string;
        summary: string;
        background: string;
        priorEvents?: string[];
        keyTerms?: Record<string, string>;
      };
      keyDevelopments?: Array<{
        timestamp?: string;
        what: string;
        who?: string[];
        significance: string;
        sourceIds?: string[];
      }>;
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
        bio?: string;
        actions?: string[];
      }>;
      gaps: string[];
    }>(
      userId,
      systemPrompt,
      userPrompt,
      { model: 'google/gemini-3-flash-preview' } // Use cheaper model for extraction
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
      details: e.bio || '',
    }));

    // Build enhanced v2 entities
    const entitiesV2: KeyEntityV2[] = (result.entities || []).map(e => ({
      name: e.name,
      type: e.type,
      role: e.role,
      details: e.bio || '',
      bio: e.bio || '',
      quoteIds: [], // Will be linked in dossier assembly
      actions: e.actions || [],
    }));

    // Build narrative context if available
    const narrative: NarrativeContext | undefined = result.narrative ? {
      hook: result.narrative.hook,
      summary: result.narrative.summary,
      background: result.narrative.background,
      priorEvents: result.narrative.priorEvents || [],
      keyTerms: result.narrative.keyTerms || {},
    } : undefined;

    // Build key developments with IDs
    const keyDevelopments: KeyDevelopment[] = (result.keyDevelopments || []).map((d, i) => ({
      id: `DEV-${String(i + 1).padStart(3, '0')}`,
      timestamp: d.timestamp || 'Unknown',
      what: d.what,
      who: d.who || [],
      significance: d.significance,
      sourceIds: d.sourceIds || [],
    }));

    return {
      facts,
      quotes,
      timelineEvents,
      entities,
      entitiesV2,
      narrative,
      keyDevelopments,
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
      entitiesV2: [],
      keyDevelopments: [],
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
