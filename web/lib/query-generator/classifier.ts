/**
 * Query Classifier
 * ============================================================================
 * Uses Gemini 3 Flash to analyze scene content and determine:
 * 1. Media type (image vs video) 
 * 2. Best source (Serper/Wikimedia for images, Pexels/YouTube for videos)
 * 3. Stock-safe validation
 * 4. Optimal search queries
 */

import { generateJSON } from '@/lib/ai/openrouter';
import {
  QueryClassification,
  SceneInput,
  MediaDensityLevel,
  MEDIA_DENSITY_CONFIG,
  VIDEO_SPECIFICITY_THRESHOLD,
  STOCK_SAFE_THRESHOLD,
} from './types';

// =============================================================================
// SYSTEM PROMPTS
// =============================================================================

const SCENE_CLASSIFIER_SYSTEM = `You are a focused media researcher for YouTube video production. Your goal is to find ONLY important, specific visual assets - NOT generic filler content.

## CRITICAL: WHAT TO SEARCH FOR

✅ REAL NAMED PEOPLE:
- Historical figures (e.g., "Julius Caesar portrait", "Ramesses II statue")
- Politicians and leaders (e.g., "Winston Churchill speech")
- Celebrities and public figures with actual footage/photos

✅ SPECIFIC REAL LOCATIONS:
- Named cities, landmarks, buildings (e.g., "Colosseum Rome", "Great Wall of China")
- Historical sites with archival footage (e.g., "Pompeii excavation")

✅ HISTORICAL EVENTS:
- Documented events with archival footage (e.g., "Bronze Age collapse map", "Sea Peoples invasion")
- Wars, discoveries, ceremonies with real footage

✅ SPECIFIC ARTIFACTS/OBJECTS:
- Named objects (e.g., "Rosetta Stone", "Tutankhamun mask")
- Historical artifacts in museums

## CRITICAL: WHAT NOT TO SEARCH FOR

❌ GENERIC PEOPLE: "a man thinking", "workers", "ancient people", "crowds"
❌ ABSTRACT CONCEPTS: "determination", "hope", "tension", "atmosphere"  
❌ GENERIC LOCATIONS: "city street", "office", "landscape", "battlefield"
❌ MOOD/B-ROLL: "dramatic clouds", "time passing", "emotional moment"

These generic visuals should be created with AI image/video generation or motion graphics, NOT stock footage.

## SOURCE SELECTION

### SERPER (Google Images) - For ALL image queries
Use for portraits, photos, artwork, maps, diagrams of named subjects.

### YOUTUBE - For documentary/specific video
Use for historical footage, interviews, documentaries about specific topics.

### PEXELS - DO NOT USE for this task
Skip Pexels entirely - generic stock is not what we're looking for.

## OUTPUT: Generate ONLY 1-3 queries per scene
Only generate queries if the scene contains genuinely searchable specific subjects.
If a scene is purely conceptual/abstract, return 0 queries.`;



// =============================================================================
// CLASSIFIER FUNCTION
// =============================================================================

/**
 * Classify a scene to determine media type, source, and generate queries
 */
export async function classifyScene(
  userId: string,
  scene: SceneInput,
  context?: {
    assetNames?: string[];
    researchEntities?: string[];
    previousQueries?: string[];
  }
): Promise<QueryClassification> {
  const userPrompt = buildClassificationPrompt(scene, context);
  
  const result = await generateJSON<ClassificationResponse>(
    userId,
    SCENE_CLASSIFIER_SYSTEM,
    userPrompt,
    { temperature: 0.3 }
  );
  
  // Post-process to ensure valid classification
  return normalizeClassification(result);
}

/**
 * Classify multiple scenes in batch - returns multiple queries per scene
 * This is the main function used for comprehensive media coverage
 */
export async function classifySceneBatch(
  userId: string,
  scenes: SceneInput[],
  context?: {
    assetNames?: string[];
    researchEntities?: string[];
    previousQueries?: string[];
    mediaDensity?: MediaDensityLevel;
  }
): Promise<QueryClassification[]> {
  const densityLevel = context?.mediaDensity || 'images_heavy_video';
  const densityConfig = MEDIA_DENSITY_CONFIG[densityLevel];
  
  // Return empty if no queries requested
  if (!densityConfig.generateQueries) {
    return [];
  }
  
  const userPrompt = buildBatchClassificationPrompt(scenes, context, densityConfig);
  
  const result = await generateJSON<BatchClassificationResponse>(
    userId,
    SCENE_CLASSIFIER_SYSTEM,
    userPrompt,
    { 
      temperature: 0.4, // Slightly higher for more diverse queries
      maxTokens: 65536 // Much larger for comprehensive output
    }
  );
  
  // Flatten all queries from all scenes into QueryClassification array
  const classifications: QueryClassification[] = [];
  
  for (const sceneResult of result.classifications) {
    for (const query of sceneResult.queries || []) {
      classifications.push({
        mediaType: query.mediaType === 'video' ? 'video' : 'image',
        source: validateSource(query.source, query.mediaType),
        confidence: 0.9,
        reasoning: `Category: ${query.category || 'general'}`,
        specificityScore: Math.max(1, Math.min(10, query.specificityScore || 5)),
        isStockSafe: true, // Pre-validated by system prompt
        stockSafeReasoning: 'Validated by comprehensive prompt',
        suggestedQueries: [query.query],
        namedEntities: sceneResult.namedEntities || { people: [], places: [], events: [], dates: [] },
        isHistorical: sceneResult.isHistorical || false,
      });
    }
  }
  
  return classifications;
}

function validateSource(source: string, mediaType: string): 'serper' | 'wikimedia' | 'pexels' | 'youtube' {
  if (mediaType === 'image') {
    // All images go to Serper
    return 'serper';
  } else {
    if (source === 'pexels') return 'pexels';
    return 'youtube'; // Default videos to youtube for better coverage
  }
}

// =============================================================================
// HELPER TYPES
// =============================================================================

interface BatchClassificationResponse {
  classifications: Array<{
    sceneIndex: number;
    queries: Array<{
      query: string;
      mediaType: 'image' | 'video';
      source: 'serper' | 'wikimedia' | 'pexels' | 'youtube';
      specificityScore: number;
      category?: string;
    }>;
    namedEntities?: {
      people: string[];
      places: string[];
      events: string[];
      dates: string[];
    };
    isHistorical?: boolean;
  }>;
}

// Legacy single-scene response (for backwards compatibility)
interface ClassificationResponse {
  mediaType: 'image' | 'video';
  source: 'serper' | 'wikimedia' | 'pexels' | 'youtube';
  confidence: number;
  reasoning: string;
  specificityScore: number;
  isStockSafe: boolean;
  stockSafeReasoning: string;
  suggestedQueries: string[];
  namedEntities: {
    people: string[];
    places: string[];
    events: string[];
    dates: string[];
  };
  isHistorical: boolean;
  recommendedFilters?: {
    imageSize?: string;
    imageType?: string;
    aspectRatio?: string;
    license?: string;
    orientation?: string;
    size?: string;
    videoDuration?: string;
    videoLicense?: string;
  };
}

// =============================================================================
// PROMPT BUILDERS
// =============================================================================

function buildClassificationPrompt(
  scene: SceneInput,
  context?: {
    assetNames?: string[];
    researchEntities?: string[];
    previousQueries?: string[];
  }
): string {
  let prompt = `Analyze this video scene and recommend media search approach:

## SCENE INFORMATION
- Beat Index: ${scene.beatIndex}
- Beat Type: ${scene.beatType}
- Duration: ${scene.durationSeconds}s

## CONTENT SUMMARY
${scene.contentSummary}

## KEY POINTS
${scene.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## NARRATION
${scene.narration}`;

  if (context?.assetNames?.length) {
    prompt += `\n\n## REFERENCED ASSETS\n${context.assetNames.join(', ')}`;
  }

  if (context?.researchEntities?.length) {
    prompt += `\n\n## RESEARCH ENTITIES\n${context.researchEntities.join(', ')}`;
  }

  if (context?.previousQueries?.length) {
    prompt += `\n\n## AVOID DUPLICATING THESE QUERIES\n${context.previousQueries.slice(-10).join('\n')}`;
  }

  prompt += `

## YOUR TASK
Return a JSON object with:
{
  "mediaType": "image" | "video",
  "source": "serper" | "wikimedia" | "pexels" | "youtube",
  "confidence": 0.0-1.0,
  "reasoning": "Why this media type and source",
  "specificityScore": 1-10,
  "isStockSafe": true/false,
  "stockSafeReasoning": "Why this is/isn't stock-safe",
  "suggestedQueries": ["query1", "query2", "query3"],
  "namedEntities": {
    "people": [],
    "places": [],
    "events": [],
    "dates": []
  },
  "isHistorical": true/false,
  "recommendedFilters": { optional filters }
}`;

  return prompt;
}

function buildBatchClassificationPrompt(
  scenes: SceneInput[],
  context?: {
    assetNames?: string[];
    researchEntities?: string[];
    previousQueries?: string[];
  },
  densityConfig?: {
    includeImages: boolean;
    includeVideos: boolean;
    imageQueriesPerScene: number;
    videoQueriesPerScene: number;
    totalMinQueries: number;
  }
): string {
  const config = densityConfig || {
    includeImages: true,
    includeVideos: true,
    imageQueriesPerScene: 6,
    videoQueriesPerScene: 6,
    totalMinQueries: 12,
  };
  
  let prompt = `Analyze these ${scenes.length} video scenes and recommend media search approaches for each:

## SCENES TO ANALYZE`;

  scenes.forEach((scene, idx) => {
    prompt += `

### SCENE ${idx + 1} (Beat ${scene.beatIndex})
- Beat Type: ${scene.beatType}
- Duration: ${scene.durationSeconds}s
- Content: ${scene.contentSummary}
- Key Points: ${scene.keyPoints.join('; ')}
- Narration: ${scene.narration.substring(0, 300)}${scene.narration.length > 300 ? '...' : ''}`;
  });

  if (context?.assetNames?.length) {
    prompt += `\n\n## REFERENCED ASSETS\n${context.assetNames.join(', ')}`;
  }

  if (context?.researchEntities?.length) {
    prompt += `\n\n## RESEARCH ENTITIES\n${context.researchEntities.join(', ')}`;
  }

  if (context?.previousQueries?.length) {
    prompt += `\n\n## AVOID DUPLICATING THESE QUERIES\n${context.previousQueries.slice(-20).join('\n')}`;
  }

  // Build media type instructions based on density config
  const mediaTypes: string[] = [];
  if (config.includeImages) mediaTypes.push('images (serper)');
  if (config.includeVideos) mediaTypes.push('videos (youtube/pexels)');
  
  const totalQueries = config.totalMinQueries;
  
  prompt += `

## QUERY GENERATION REQUIREMENTS
Generate ONLY ${totalQueries} queries per scene - focus on IMPORTANT elements only.
${config.includeImages ? `- Up to ${config.imageQueriesPerScene} IMAGE queries (use "serper" as source)` : '- NO image queries'}
${config.includeVideos ? `- Up to ${config.videoQueriesPerScene} VIDEO queries (use "youtube" only - NO pexels)` : '- NO video queries'}

ONLY generate queries for these categories:
${config.includeImages ? `- **named_person**: Real people with identifiable names (politicians, historical figures)
- **specific_location**: Named real places (cities, landmarks, buildings)
- **artifact**: Named objects, artifacts, or documents` : ''}
${config.includeVideos ? `- **historical_event**: Documented events with archival footage
- **documentary**: Specific topics with educational content` : ''}

DO NOT generate queries for:
- Generic people ("a man", "workers", "crowds")
- Abstract concepts ("hope", "tension")
- Generic locations ("city street", "office")
- Mood/B-roll (leave for AI generation)

If a scene has only generic concepts and no specific searchable subjects, return 0 queries for that scene.

## OUTPUT FORMAT
Return a JSON object:
{
  "classifications": [
    {
      "sceneIndex": 0,
      "queries": [
${config.includeImages ? `        {"query": "example image query", "mediaType": "image", "source": "serper", "specificityScore": 6, "category": "character"},` : ''}
${config.includeVideos ? `        {"query": "example video query", "mediaType": "video", "source": "youtube", "specificityScore": 7, "category": "main_topic"},` : ''}
      ],
      "namedEntities": {"people": [], "places": [], "events": [], "dates": []},
      "isHistorical": false
    }
  ]
}

CRITICAL: Generate EXACTLY ${totalQueries} queries per scene. ${config.includeImages ? 'Use serper for ALL images.' : ''} ${config.includeVideos ? 'Use youtube for specific videos, pexels only for ultra-generic B-roll.' : ''}`;

  return prompt;
}

// =============================================================================
// NORMALIZATION
// =============================================================================

function normalizeClassification(raw: ClassificationResponse): QueryClassification {
  // Validate media type
  const mediaType = raw.mediaType === 'video' ? 'video' : 'image';
  
  // Validate source based on media type
  let source: QueryClassification['source'];
  if (mediaType === 'image') {
    source = raw.source === 'wikimedia' ? 'wikimedia' : 'serper';
  } else {
    // For video, use specificity score to determine source
    const specificityScore = Math.max(1, Math.min(10, raw.specificityScore || 5));
    if (specificityScore >= VIDEO_SPECIFICITY_THRESHOLD || raw.source === 'youtube') {
      source = 'youtube';
    } else {
      source = 'pexels';
    }
  }
  
  // Validate stock safety
  const isStockSafe = raw.isStockSafe !== false && 
    (raw.confidence || 0.5) >= STOCK_SAFE_THRESHOLD;
  
  // Ensure we have at least one query
  const suggestedQueries = raw.suggestedQueries?.length 
    ? raw.suggestedQueries.slice(0, 5) // Limit to 5 queries
    : ['generic stock footage'];
    
  return {
    mediaType,
    source,
    confidence: Math.max(0, Math.min(1, raw.confidence || 0.5)),
    reasoning: raw.reasoning || 'No reasoning provided',
    specificityScore: Math.max(1, Math.min(10, raw.specificityScore || 5)),
    isStockSafe,
    stockSafeReasoning: raw.stockSafeReasoning || 'Not evaluated',
    suggestedQueries,
    namedEntities: {
      people: raw.namedEntities?.people || [],
      places: raw.namedEntities?.places || [],
      events: raw.namedEntities?.events || [],
      dates: raw.namedEntities?.dates || [],
    },
    isHistorical: raw.isHistorical || false,
    recommendedFilters: raw.recommendedFilters as QueryClassification['recommendedFilters'],
  };
}
