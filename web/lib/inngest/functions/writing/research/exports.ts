// Research module exports
export { executeResearchPhase, shouldExecuteResearch, executeLightResearch } from './index';
export type { ResearchResult, ResearchOptions } from './index';
export { decomposeTopicIntoQuestions, filterQuestionsByCategory, getTopPriorityQuestions } from './topic-decomposition';
export type { ResearchQuestion, QuestionCategory, TopicDecomposition } from './topic-decomposition';
export { extractAndVerifyFacts, deduplicateFacts, sortFactsByConfidence } from './fact-extraction';
export type { ExtractedFacts, ExtractionOptions } from './fact-extraction';
export { assembleDossier, getFactsByConfidence, getRelevantFacts, generateCitation, summarizeDossier } from './dossier';
