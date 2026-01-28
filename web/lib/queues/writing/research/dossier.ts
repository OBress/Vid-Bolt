/**
 * Research Dossier Assembly
 * ============================================================================
 * Assembles extracted facts, quotes, and events into a complete research dossier.
 */

import { generateJSON } from '@/lib/ai/openrouter';
import type { 
  ResearchDossier, 
  ResearchDossierV2,
  ResearchToggle,
  VerifiedFact,
  Theory,
  ResearchGap,
  NarrativeContext,
  KeyDevelopment,
  KeyEntityV2,
} from '../types';
import { UNIVERSAL_PROMPTS } from '../prompts';
import { calculateOverallConfidence } from '../utils';
import type { ExtractedFacts } from './fact-extraction';
import { deduplicateFacts, sortFactsByConfidence } from './fact-extraction';

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Assemble a complete research dossier from extracted facts.
 * 
 * @param userId - User ID for API calls
 * @param topic - The research topic
 * @param researchToggle - Research depth setting
 * @param extractedFacts - Facts extracted from research
 * @returns Complete research dossier
 */
export async function assembleDossier(
  userId: string,
  topic: string,
  researchToggle: ResearchToggle,
  extractedFacts: ExtractedFacts
): Promise<ResearchDossier> {
  // Deduplicate and sort facts
  const dedupedFacts = deduplicateFacts(extractedFacts.facts);
  const sortedFacts = sortFactsByConfidence(dedupedFacts);

  // Calculate overall confidence
  const confidenceLevels = sortedFacts.map(f => f.confidence);
  const overallConfidence = calculateOverallConfidence(confidenceLevels);

  // Identify conflicts in the facts
  const conflicts = identifyConflicts(sortedFacts);

  // Identify theories/interpretations if we have enough data
  let theories: Theory[] = [];
  if (researchToggle === 'full' && sortedFacts.length >= 10) {
    theories = await identifyTheories(userId, topic, sortedFacts);
  }

  // Convert gaps to proper format
  const formattedGaps: ResearchGap[] = extractedFacts.gaps.map(gap => ({
    description: gap,
    impact: assessGapImpact(gap),
    recommendation: generateGapRecommendation(gap),
  }));

  // Build the dossier with v2 fields
  const dossier: ResearchDossierV2 = {
    metadata: {
      topic,
      researchDepth: researchToggle,
      factCount: sortedFacts.length,
      quoteCount: extractedFacts.quotes.length,
      overallConfidence,
      generatedAt: new Date().toISOString(),
    },
    facts: sortedFacts,
    conflicts,
    quotes: extractedFacts.quotes,
    timeline: extractedFacts.timelineEvents.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    ),
    entities: extractedFacts.entities,
    theories,
    gaps: formattedGaps,
    worksCited: extractedFacts.allCitations,
    // V2 fields for breaking news
    narrative: extractedFacts.narrative,
    keyDevelopments: extractedFacts.keyDevelopments || [],
    entitiesV2: extractedFacts.entitiesV2 || [],
    verificationGaps: extractedFacts.gaps,
    version: 'v2',
  };

  console.log(`[Dossier] Assembled v2 dossier with ${sortedFacts.length} facts, ${conflicts.length} conflicts`);
  if (extractedFacts.narrative) {
    console.log(`[Dossier] V2 narrative hook: ${extractedFacts.narrative.hook.substring(0, 50)}...`);
  }
  if (extractedFacts.keyDevelopments?.length) {
    console.log(`[Dossier] V2 keyDevelopments: ${extractedFacts.keyDevelopments.length}`);
  }
  
  return dossier;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Identify conflicting information in the facts
 */
function identifyConflicts(facts: VerifiedFact[]): ResearchDossier['conflicts'] {
  const conflicts: ResearchDossier['conflicts'] = [];
  
  // Look for facts that might contradict each other
  // This is a simplified heuristic - in production, you'd use AI
  const conflictedFacts = facts.filter(f => f.confidence === 'conflicted' || f.notes);
  
  for (const fact of conflictedFacts) {
    if (fact.notes) {
      conflicts.push({
        topic: fact.statement.substring(0, 50),
        positions: [
          { position: fact.statement, sources: fact.sources },
          { position: fact.notes, sources: [] },
        ],
        resolution: 'Further verification recommended',
      });
    }
  }
  
  return conflicts;
}

/**
 * Use AI to identify theories and interpretations from facts
 */
async function identifyTheories(
  userId: string,
  topic: string,
  facts: VerifiedFact[]
): Promise<Theory[]> {
  const factSummary = facts
    .slice(0, 20) // Limit to prevent token overflow
    .map(f => `- ${f.statement} (${f.confidence})`)
    .join('\n');

  const userPrompt = `Based on these facts about "${topic}", identify any theories, interpretations, or different viewpoints that exist:

FACTS:
${factSummary}

Return as JSON:
{
  "theories": [
    {
      "name": "Theory name",
      "summary": "Brief summary",
      "supportingEvidence": ["FACT-001", "FACT-002"],
      "contradictingEvidence": ["FACT-003"],
      "proponents": ["Person or group"],
      "currentStatus": "accepted|debated|rejected|fringe"
    }
  ]
}

Only include theories that are actually represented in the research. Don't invent theories.`;

  try {
    const response = await generateJSON<{ theories: Theory[] }>(
      userId,
      UNIVERSAL_PROMPTS.dossierAssembly,
      userPrompt
    );

    return (response.theories || []).map((t, i) => ({
      ...t,
      id: `THEORY-${String(i + 1).padStart(3, '0')}`,
    }));
  } catch (error) {
    console.error('[Dossier] Error identifying theories:', error);
    return [];
  }
}

/**
 * Assess the impact of a research gap
 */
function assessGapImpact(gap: string): 'high' | 'medium' | 'low' {
  const highImpactKeywords = [
    'main', 'primary', 'key', 'central', 'core', 'essential',
    'critical', 'fundamental', 'crucial', 'important',
  ];
  
  const gapLower = gap.toLowerCase();
  
  if (highImpactKeywords.some(k => gapLower.includes(k))) {
    return 'high';
  }
  
  if (gap.includes('?') || gapLower.includes('unclear') || gapLower.includes('unknown')) {
    return 'medium';
  }
  
  return 'low';
}

/**
 * Generate a recommendation for handling a research gap
 */
function generateGapRecommendation(gap: string): string {
  const gapLower = gap.toLowerCase();
  
  if (gapLower.includes('date') || gapLower.includes('when')) {
    return 'Consider using approximate timeframes or stating uncertainty explicitly';
  }
  
  if (gapLower.includes('number') || gapLower.includes('statistic') || gapLower.includes('how many')) {
    return 'Use qualitative descriptions instead of specific numbers, or cite the source of any estimates';
  }
  
  if (gapLower.includes('person') || gapLower.includes('who')) {
    return 'Focus on roles and actions rather than specific individuals if identity cannot be verified';
  }
  
  if (gapLower.includes('why') || gapLower.includes('reason')) {
    return 'Present multiple possible explanations and acknowledge uncertainty';
  }
  
  return 'Acknowledge the limitation in the script or reduce emphasis on this aspect';
}

/**
 * Get facts by confidence level
 */
export function getFactsByConfidence(
  dossier: ResearchDossier,
  minConfidence: 'verified' | 'high' | 'medium' | 'low'
): VerifiedFact[] {
  const confidenceOrder = ['verified', 'high', 'medium', 'low', 'conflicted', 'unverified'];
  const minIndex = confidenceOrder.indexOf(minConfidence);
  
  return dossier.facts.filter(f => 
    confidenceOrder.indexOf(f.confidence) <= minIndex
  );
}

/**
 * Get facts relevant to a specific topic/keyword
 */
export function getRelevantFacts(
  dossier: ResearchDossier,
  keyword: string
): VerifiedFact[] {
  const keywordLower = keyword.toLowerCase();
  return dossier.facts.filter(f => 
    f.statement.toLowerCase().includes(keywordLower)
  );
}

/**
 * Generate a citation string for a fact
 */
export function generateCitation(fact: VerifiedFact): string {
  if (fact.sources.length === 0) {
    return '(source unverified)';
  }
  
  const primarySource = fact.sources[0];
  if (primarySource.author) {
    return `(${primarySource.author}${primarySource.date ? `, ${primarySource.date}` : ''})`;
  }
  
  return `(${primarySource.title})`;
}

/**
 * Summarize dossier for logging/debugging
 */
export function summarizeDossier(dossier: ResearchDossier): string {
  return `
Research Dossier Summary
========================
Topic: ${dossier.metadata.topic}
Depth: ${dossier.metadata.researchDepth}
Overall Confidence: ${dossier.metadata.overallConfidence}%

Content:
- ${dossier.facts.length} verified facts
- ${dossier.quotes.length} attributable quotes
- ${dossier.timeline.length} timeline events
- ${dossier.entities.length} key entities
- ${dossier.theories.length} theories/interpretations
- ${dossier.conflicts.length} conflicts identified
- ${dossier.gaps.length} research gaps

Confidence Breakdown:
- Verified: ${dossier.facts.filter(f => f.confidence === 'verified').length}
- High: ${dossier.facts.filter(f => f.confidence === 'high').length}
- Medium: ${dossier.facts.filter(f => f.confidence === 'medium').length}
- Low: ${dossier.facts.filter(f => f.confidence === 'low').length}
- Conflicted: ${dossier.facts.filter(f => f.confidence === 'conflicted').length}
- Unverified: ${dossier.facts.filter(f => f.confidence === 'unverified').length}

Sources: ${dossier.worksCited.length} unique citations
`.trim();
}
