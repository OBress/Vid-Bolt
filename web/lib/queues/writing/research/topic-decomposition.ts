/**
 * Topic Decomposition
 * ============================================================================
 * Breaks down a topic into discrete, researchable questions.
 */

import { generateJSON } from '@/lib/ai/openrouter';
import { UNIVERSAL_PROMPTS } from '../prompts';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Categories for research questions
 */
export type QuestionCategory = 
  | 'factual'      // Verifiable facts, dates, numbers
  | 'contextual'   // Background, related events
  | 'analytical'   // Causes, effects, interpretations
  | 'quotable'     // Expert opinions, primary sources
  | 'visual';      // Physical descriptions for image generation

/**
 * A single researchable question
 */
export interface ResearchQuestion {
  /** Unique identifier */
  id: string;
  /** The question itself */
  question: string;
  /** Question category */
  category: QuestionCategory;
  /** Multiple search query phrasings */
  searchQueries: string[];
  /** Priority (1 = highest) */
  priority?: number;
}

/**
 * Output from topic decomposition
 */
export interface TopicDecomposition {
  /** Original topic */
  topic: string;
  /** Identified angle/thesis */
  identifiedAngle?: string;
  /** All research questions */
  questions: ResearchQuestion[];
  /** Key entities to research */
  keyEntities: string[];
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Decompose a topic into researchable questions.
 * 
 * @param userId - User ID for API calls
 * @param topic - The topic to decompose
 * @param angle - Optional specific angle/thesis to focus on
 * @param isDeepResearch - Whether to perform deep research (more questions, recent focus)
 * @param useValyu - Whether using Valyu provider (optimizes for broader queries)
 * @returns Array of research questions
 */
export async function decomposeTopicIntoQuestions(
  userId: string,
  topic: string,
  angle: string | undefined,
  isDeepResearch: boolean = false,
  useValyu: boolean = false
): Promise<ResearchQuestion[]> {
  // VALYU OPTIMIZATION: Generate fewer, broader questions for Valyu's semantic search
  const valyuGuidance = useValyu ? `
VALYU OPTIMIZATION MODE:
- Generate FEWER but BROADER questions (5-8 comprehensive queries instead of 20+)
- Each question should cover MULTIPLE aspects of the topic
- Prioritize scope over specificity - Valyu's semantic search handles nuance
- Example: Instead of "What year did X happen?" use "Complete historical overview of X including key dates, figures, and events"
- Each searchQuery should be a self-contained research prompt, not just keywords
- Focus on comprehensive questions that will return rich, varied results
` : '';

  const questionCount = useValyu 
    ? (isDeepResearch ? '8-12' : '5-8') 
    : (isDeepResearch ? '20-30' : '10-20');

  const userPrompt = `Decompose this topic into researchable questions:

TOPIC: ${topic}
${angle ? `ANGLE/FOCUS: ${angle}` : ''}
${isDeepResearch ? 'MODE: DEEP RESEARCH (Focus on recent events, breaking news, and comprehensive coverage)' : ''}
${valyuGuidance}

Generate a comprehensive set of research questions that will help create an authoritative, well-researched video script.
${isDeepResearch && !useValyu ? 'Since this is a DEEP RESEARCH request, please generate MORE questions (20-30) and focus heavily on locating the most recent developments, multiple perspectives, and primary sources.' : ''}

Return as JSON:
{
  "identifiedAngle": "The main angle or thesis identified",
  "questions": [
    {
      "id": "Q-001",
      "question": "The research question",
      "category": "factual|contextual|analytical|quotable|visual",
      "searchQueries": ["query 1", "query 2", "query 3"],
      "priority": 1
    }
  ],
  "keyEntities": ["Person 1", "Location 1", "Organization 1"]
}

Generate ${questionCount} questions covering all categories. ${useValyu ? 'Prioritize comprehensive, broad questions over narrow specific ones.' : 'Prioritize unique angles and less-known facts.'}`;

  try {
    const response = await generateJSON<TopicDecomposition>(
      userId,
      UNIVERSAL_PROMPTS.topicDecomposition,
      userPrompt
    );

    // Validate and normalize the response
    const questions = response.questions.map((q, index) => ({
      id: q.id || `Q-${String(index + 1).padStart(3, '0')}`,
      question: q.question,
      category: validateCategory(q.category),
      searchQueries: q.searchQueries || [q.question],
      priority: q.priority || index + 1,
    }));

    console.log(`[TopicDecomposition] Generated ${questions.length} questions`);
    console.log(`[TopicDecomposition] Categories: ${getCategoryBreakdown(questions)}`);

    return questions;

  } catch (error) {
    console.error('[TopicDecomposition] Error:', error);
    // Return a minimal fallback set of questions
    return generateFallbackQuestions(topic);
  }
}

/**
 * Validate and normalize question category
 */
function validateCategory(category: string): QuestionCategory {
  const validCategories: QuestionCategory[] = [
    'factual', 'contextual', 'analytical', 'quotable', 'visual'
  ];
  
  const normalized = category.toLowerCase() as QuestionCategory;
  return validCategories.includes(normalized) ? normalized : 'factual';
}

/**
 * Get breakdown of question categories
 */
function getCategoryBreakdown(questions: ResearchQuestion[]): string {
  const counts: Record<QuestionCategory, number> = {
    factual: 0,
    contextual: 0,
    analytical: 0,
    quotable: 0,
    visual: 0,
  };

  for (const q of questions) {
    counts[q.category]++;
  }

  return Object.entries(counts)
    .filter(([_, count]) => count > 0)
    .map(([cat, count]) => `${cat}:${count}`)
    .join(', ');
}

/**
 * Generate fallback questions if decomposition fails
 */
function generateFallbackQuestions(topic: string): ResearchQuestion[] {
  return [
    {
      id: 'Q-001',
      question: `What are the key facts about ${topic}?`,
      category: 'factual',
      searchQueries: [topic, `${topic} facts`, `${topic} overview`],
      priority: 1,
    },
    {
      id: 'Q-002',
      question: `What is the historical context of ${topic}?`,
      category: 'contextual',
      searchQueries: [`${topic} history`, `${topic} background`, `${topic} origins`],
      priority: 2,
    },
    {
      id: 'Q-003',
      question: `What are the key events related to ${topic}?`,
      category: 'factual',
      searchQueries: [`${topic} timeline`, `${topic} events`, `${topic} chronology`],
      priority: 3,
    },
    {
      id: 'Q-004',
      question: `Who are the key people involved in ${topic}?`,
      category: 'quotable',
      searchQueries: [`${topic} key people`, `${topic} important figures`, `${topic} experts`],
      priority: 4,
    },
    {
      id: 'Q-005',
      question: `What does ${topic} look like? Describe the physical characteristics.`,
      category: 'visual',
      searchQueries: [`${topic} images`, `${topic} appearance`, `${topic} photos`],
      priority: 5,
    },
  ];
}

/**
 * Filter questions by category
 */
export function filterQuestionsByCategory(
  questions: ResearchQuestion[],
  categories: QuestionCategory[]
): ResearchQuestion[] {
  return questions.filter(q => categories.includes(q.category));
}

/**
 * Get highest priority questions
 */
export function getTopPriorityQuestions(
  questions: ResearchQuestion[],
  count: number
): ResearchQuestion[] {
  return [...questions]
    .sort((a, b) => (a.priority || 999) - (b.priority || 999))
    .slice(0, count);
}
