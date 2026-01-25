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
  VIDEO_SPECIFICITY_THRESHOLD,
  STOCK_SAFE_THRESHOLD,
} from './types';

// =============================================================================
// SYSTEM PROMPTS
// =============================================================================

const SCENE_CLASSIFIER_SYSTEM = `You are a comprehensive media research specialist for YouTube video production. Your goal is to find ALL visual assets needed to fully illustrate a video scene.

## YOUR MISSION
Generate MANY search queries (8-15 per scene) to cover EVERYTHING a video editor would need:
- Background footage and B-roll
- Character/subject imagery  
- Location/setting shots
- Historical/archival footage
- Abstract/conceptual visuals
- Supporting objects and details

## SOURCE SELECTION - USE ALL SOURCES STRATEGICALLY

### SERPER (Google Images) - PRIMARY for images
Use Serper HEAVILY for:
✅ Famous people (politicians, historical figures, celebrities)
✅ Specific locations and landmarks
✅ Current events and news imagery
✅ Professional photography of any subject
✅ Character portraits and reference images
✅ Product and object photos
✅ Maps, infographics, diagrams
🎯 Serper should be your GO-TO for most image queries

### WIKIMEDIA - Secondary for images
Use Wikimedia for:
✅ Historical images (pre-1950 especially)
✅ Public domain artwork and paintings
✅ Scientific diagrams and educational illustrations
✅ Old photographs and archival images
✅ Maps and geographic imagery

### YOUTUBE - PRIMARY for documentary/specific video
Use YouTube LIBERALLY for:
✅ Documentary footage on ANY topic
✅ Historical events and archival video
✅ News footage and broadcasts
✅ Educational content and explainers
✅ Specific location footage (cities, landmarks, nature)
✅ Interview footage and speeches
✅ Technical demonstrations
✅ Any footage that tells a story or shows real events
🎯 YouTube has vast amounts of Creative Commons and raw footage

### PEXELS - For generic stock footage only
Use Pexels ONLY for:
✅ Abstract motion and patterns
✅ Extremely generic shots (sunset, waves, typing hands)
✅ Lifestyle B-roll with no specific subject
❌ Don't use for anything with a specific subject or topic

## QUERY GENERATION RULES

1. Generate 8-15 diverse queries per scene covering different visual needs
2. Mix BOTH image and video queries for each scene
3. Include queries for:
   - The main subject/topic (video + images)
   - Any people/characters mentioned (images via Serper)
   - Settings and locations (video + images)  
   - Supporting details and objects
   - Abstract/emotional visuals that match the mood
4. Make queries SPECIFIC and descriptive
5. For historical content, always include YouTube + Wikimedia queries
6. For contemporary content, always include Serper + YouTube queries

## STOCK-SAFE VALIDATION
These ARE stock-safe (generate queries):
✅ Documentary footage, news clips, archival video
✅ Famous people in public contexts
✅ Educational and informational content
✅ Creative Commons labeled content
✅ Historical footage and images

These are NOT stock-safe (skip):
❌ Specific YouTuber's edited personal content
❌ Movie/TV show clips
❌ Music videos or copyrighted audio content
❌ Branded promotional content

## SPECIFICITY SCORING (1-10)
1-2: Ultra generic ("sunset", "ocean waves") → Pexels
3-4: Semi-generic ("city traffic", "office meeting") → Pexels or YouTube  
5-6: Specific topic ("bronze age collapse", "ancient trade routes") → YouTube
7-8: Very specific ("fall of Ugarit", "1177 BC Mediterranean") → YouTube
9-10: Exact events ("assassination of JFK footage") → YouTube`;


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
  }
): Promise<QueryClassification[]> {
  const userPrompt = buildBatchClassificationPrompt(scenes, context);
  
  const result = await generateJSON<BatchClassificationResponse>(
    userId,
    SCENE_CLASSIFIER_SYSTEM,
    userPrompt,
    { 
      temperature: 0.4, // Slightly higher for more diverse queries
      maxTokens: 16384 // Much larger for comprehensive output
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
    if (source === 'wikimedia') return 'wikimedia';
    return 'serper'; // Default images to serper
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
  }
): string {
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

  prompt += `

## CRITICAL: GENERATE MANY QUERIES
You MUST generate AT LEAST 10 queries per scene. Coverage is more important than anything else.

For EACH scene, generate queries across ALL these categories:
1. **main_topic** (2-3 queries): Core subject matter - BOTH video (youtube) AND images (serper)
2. **character** (2-3 queries): Any people/figures mentioned - portraits, photos (serper)
3. **location** (2-3 queries): Settings, places - drone footage (youtube), photos (serper)  
4. **object** (1-2 queries): Key objects, artifacts, symbols (serper)
5. **historical** (1-2 queries): Archival footage, old photos (youtube, wikimedia)
6. **mood** (1-2 queries): Abstract visuals matching tone (pexels for generic, serper for specific)
7. **supporting** (1-2 queries): B-roll, context footage (youtube or pexels)

## OUTPUT FORMAT
Return a JSON object:
{
  "classifications": [
    {
      "sceneIndex": 0,
      "queries": [
        {"query": "bronze age collapse documentary footage", "mediaType": "video", "source": "youtube", "specificityScore": 7, "category": "main_topic"},
        {"query": "bronze age trade routes map ancient", "mediaType": "image", "source": "serper", "specificityScore": 6, "category": "main_topic"},
        {"query": "Sea Peoples invasion bronze age", "mediaType": "video", "source": "youtube", "specificityScore": 8, "category": "main_topic"},
        {"query": "Ramesses III pharaoh portrait", "mediaType": "image", "source": "serper", "specificityScore": 7, "category": "character"},
        {"query": "ancient Hittite king statue", "mediaType": "image", "source": "serper", "specificityScore": 6, "category": "character"},
        {"query": "ruins of Ugarit Syria drone", "mediaType": "video", "source": "youtube", "specificityScore": 8, "category": "location"},
        {"query": "ancient Mediterranean aerial view", "mediaType": "image", "source": "serper", "specificityScore": 5, "category": "location"},
        {"query": "bronze age sword weapons artifacts", "mediaType": "image", "source": "serper", "specificityScore": 5, "category": "object"},
        {"query": "clay tablets ancient writing", "mediaType": "image", "source": "wikimedia", "specificityScore": 5, "category": "object"},
        {"query": "ancient city destruction fire ruins", "mediaType": "video", "source": "youtube", "specificityScore": 6, "category": "historical"},
        {"query": "dramatic sunset ancient ruins", "mediaType": "video", "source": "pexels", "specificityScore": 2, "category": "mood"},
        {"query": "burning city flames destruction", "mediaType": "video", "source": "pexels", "specificityScore": 3, "category": "mood"}
      ],
      "namedEntities": {"people": ["Ramesses III"], "places": ["Ugarit", "Mediterranean"], "events": ["Bronze Age Collapse"], "dates": ["1200 BCE"]},
      "isHistorical": true
    }
  ]
}

REMEMBER: Minimum 10 queries per scene. Use youtube for videos, serper for images. Cover ALL categories.`;

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
