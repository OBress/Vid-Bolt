/**
 * Chunked Shot Processor
 * ============================================================================
 * Implements a sliding context window pattern for scalable shot generation.
 * 
 * This module processes segments in sequential chunks, providing each AI call with:
 * - Past context: Previously generated shot summaries (for continuity)
 * - Current batch: Segments to generate in this call
 * - Future lookahead: Upcoming segment previews (for transition planning)
 * 
 * This approach maintains narrative coherence while avoiding token limits
 * and quality degradation that occurs with large single-call payloads.
 */

import type { ShotEvent, ContentType } from './types';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuration for chunk processing.
 */
export interface ChunkConfig {
  /** Number of segments to process per AI call. Default: 10 */
  batchSize: number;
  /** Number of previous shots to include as context. Default: 5 */
  pastContextSize: number;
  /** Number of upcoming segments to preview. Default: 5 */
  lookaheadSize: number;
  /** Maximum retries per chunk on failure. Default: 3 */
  maxRetries: number;
}

/**
 * Minimal shot info for past context (reduces tokens).
 */
export interface PastShotContext {
  segment_index: number;
  summary: string;
  media_type: 'video' | 'motiongraphic';
  stock_worthy: boolean;
}

/**
 * Minimal segment info for lookahead (reduces tokens).
 */
export interface LookaheadSegment {
  segment_index: number;
  text: string;
  content_type: ContentType;
}

/**
 * Context window for a single chunk processing call.
 */
export interface ChunkContext {
  /** Read-only: Previous shots for continuity (summaries + media_type) */
  previousShots: PastShotContext[];
  
  /** Generate these: Full segment data for current batch */
  currentSegments: ShotEvent[];
  
  /** Read-only: Upcoming segments for transition planning */
  upcomingSegments: LookaheadSegment[];
  
  /** Current chunk index (0-based) */
  chunkIndex: number;
  
  /** Total number of chunks */
  totalChunks: number;
  
  /** Is this the first chunk? */
  isFirstChunk: boolean;
  
  /** Is this the last chunk? */
  isLastChunk: boolean;
  
  /** Total segment count across all chunks */
  totalSegments: number;
}

/**
 * Generated shot output matching ShotPart1 structure.
 */
export interface ChunkShotResult {
  segment_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  content_type: string;
  media_type: 'video' | 'motiongraphic';
  text: string;
  summary: string;
  stock_worthy: boolean;
  reuse_entity?: string; // Entity name to reuse (e.g. "Donald Trump") or null for fresh scrape
  image_count?: number;
  character_refs?: string[];
  location_refs?: string[];
  object_refs?: string[];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Descriptive visual intent (routing tags + natural language)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** AI's natural language description of the visual approach */
  visual_description?: string;
  /** Routing tags for generation tool selection */
  visual_elements?: import('@/types/video').RoutingTag[];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Sound Effects (millisecond-precise audio placement)
  // ═══════════════════════════════════════════════════════════════════════════
  sound_effects?: import('@/types/video').SoundEffect[];
}

/**
 * Outline assets for entity reference detection.
 */
export interface OutlineAssets {
  characters?: Array<{ id: string; name: string; role: string }>;
  locations?: Array<{ id: string; name: string; essence: string }>;
  objects?: Array<{ id: string; name: string; type: string }>;
}

/**
 * Progress callback signature.
 */
export type ProgressCallback = (
  progress: number,
  currentStep: string
) => Promise<void>;

/**
 * Result of chunk processing with retry status.
 */
export interface ChunkProcessingResult {
  shots: ChunkShotResult[];
  chunkIndex: number;
  retriesUsed: number;
  needsManualReview: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  batchSize: 10,
  pastContextSize: 5,
  lookaheadSize: 5,
  maxRetries: 3,
};

// Progress allocation:
// 0-10%   : Content analysis (handled before this module)
// 10-30%  : Segmentation (handled before this module)
// 30-50%  : Setup and first chunk prep
// 50-90%  : Chunk processing (main work)
// 90-100% : Stock media matching + finalization (handled after)
const CHUNK_PROGRESS_START = 50;
const CHUNK_PROGRESS_END = 90;

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Process segments in sequential chunks with sliding context windows.
 * 
 * This is the main entry point for scalable shot generation. It:
 * 1. Divides segments into manageable chunks
 * 2. Processes each chunk sequentially (for narrative coherence)
 * 3. Provides context from previous chunks to maintain continuity
 * 4. Previews upcoming content for smooth transitions
 * 5. Reports progress after each chunk
 * 
 * @param userId - User ID for AI API calls
 * @param segments - All segments to process
 * @param outlineAssets - Optional entity definitions for reference detection
 * @param config - Chunk configuration (batch size, context sizes)
 * @param onProgress - Optional callback for progress updates
 * @returns Array of generated shots
 */
export async function processInChunks(
  userId: string,
  segments: ShotEvent[],
  outlineAssets?: OutlineAssets,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG,
  onProgress?: ProgressCallback
): Promise<ChunkShotResult[]> {
  const totalSegments = segments.length;
  const totalChunks = Math.ceil(totalSegments / config.batchSize);
  
  console.log(`[ChunkedProcessor] Processing ${totalSegments} segments in ${totalChunks} chunks`);
  console.log(`[ChunkedProcessor] Config: batch=${config.batchSize}, past=${config.pastContextSize}, lookahead=${config.lookaheadSize}`);
  
  if (totalSegments === 0) {
    return [];
  }
  
  // Accumulate all generated shots
  const allShots: ChunkShotResult[] = [];
  
  // Process chunks sequentially
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const startIdx = chunkIndex * config.batchSize;
    const endIdx = Math.min(startIdx + config.batchSize, totalSegments);
    
    // Build context window for this chunk
    const context = buildChunkContext(
      segments,
      allShots,
      startIdx,
      endIdx,
      chunkIndex,
      totalChunks,
      config
    );
    
    // Update progress before processing
    const progressPercent = calculateProgress(chunkIndex, totalChunks, 'start');
    const stepMessage = buildProgressMessage(startIdx, endIdx, totalSegments, chunkIndex, totalChunks);
    
    if (onProgress) {
      await onProgress(progressPercent, stepMessage);
    }
    
    console.log(`[ChunkedProcessor] Chunk ${chunkIndex + 1}/${totalChunks}: segments ${startIdx + 1}-${endIdx}`);
    
    // Process this chunk with retry logic
    const result = await processChunkWithRetries(
      userId,
      context,
      outlineAssets,
      config.maxRetries
    );
    
    // Add shots to accumulator
    allShots.push(...result.shots);
    
    if (result.needsManualReview) {
      console.warn(`[ChunkedProcessor] Chunk ${chunkIndex + 1} needs manual review after ${result.retriesUsed} retries`);
    }
    
    // Update progress after processing
    const postProgressPercent = calculateProgress(chunkIndex, totalChunks, 'end');
    if (onProgress) {
      await onProgress(postProgressPercent, `Completed shots ${startIdx + 1}-${endIdx} of ${totalSegments}`);
    }
  }
  
  console.log(`[ChunkedProcessor] Complete: generated ${allShots.length} shots`);
  return allShots;
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build the context window for a chunk.
 */
function buildChunkContext(
  segments: ShotEvent[],
  previousShots: ChunkShotResult[],
  startIdx: number,
  endIdx: number,
  chunkIndex: number,
  totalChunks: number,
  config: ChunkConfig
): ChunkContext {
  // Get recent shots for context (last N completed shots)
  const pastContext: PastShotContext[] = previousShots
    .slice(-config.pastContextSize)
    .map(shot => ({
      segment_index: shot.segment_index,
      summary: shot.summary,
      media_type: shot.media_type,
      stock_worthy: shot.stock_worthy,
    }));
  
  // Get current batch of segments
  const currentSegments = segments.slice(startIdx, endIdx);
  
  // Get lookahead segments (preview only)
  const lookaheadStart = endIdx;
  const lookaheadEnd = Math.min(endIdx + config.lookaheadSize, segments.length);
  const upcomingSegments: LookaheadSegment[] = segments
    .slice(lookaheadStart, lookaheadEnd)
    .map(seg => ({
      segment_index: seg.segment_index,
      text: seg.text.substring(0, 150), // Truncate for token efficiency
      content_type: seg.content_type,
    }));
  
  return {
    previousShots: pastContext,
    currentSegments,
    upcomingSegments,
    chunkIndex,
    totalChunks,
    isFirstChunk: chunkIndex === 0,
    isLastChunk: chunkIndex === totalChunks - 1,
    totalSegments: segments.length,
  };
}

// ============================================================================
// CHUNK PROCESSING WITH RETRY
// ============================================================================

/**
 * Process a single chunk with retry logic.
 */
async function processChunkWithRetries(
  userId: string,
  context: ChunkContext,
  outlineAssets: OutlineAssets | undefined,
  maxRetries: number
): Promise<ChunkProcessingResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const shots = await generateChunkShots(userId, context, outlineAssets);
      return {
        shots,
        chunkIndex: context.chunkIndex,
        retriesUsed: attempt,
        needsManualReview: false,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[ChunkedProcessor] Chunk ${context.chunkIndex + 1} attempt ${attempt + 1} failed:`, lastError.message);
      
      if (attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`[ChunkedProcessor] Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  // All retries failed - generate fallback shots marked for manual review
  console.warn(`[ChunkedProcessor] All ${maxRetries} attempts failed for chunk ${context.chunkIndex + 1}, using fallbacks`);
  
  const fallbackShots = context.currentSegments.map(segment => 
    generateFallbackShot(segment, outlineAssets)
  );
  
  return {
    shots: fallbackShots,
    chunkIndex: context.chunkIndex,
    retriesUsed: maxRetries,
    needsManualReview: true,
  };
}

// ============================================================================
// AI SHOT GENERATION
// ============================================================================

/**
 * Generate shots for a single chunk using AI with context-aware prompting.
 */
async function generateChunkShots(
  userId: string,
  context: ChunkContext,
  outlineAssets?: OutlineAssets
): Promise<ChunkShotResult[]> {
  const { generateJSON } = await import('@/lib/ai/openrouter');
  
  // Build entity lookup for post-processing
  const characterNames = outlineAssets?.characters?.map(c => ({ id: c.id, name: c.name.toLowerCase() })) || [];
  const locationNames = outlineAssets?.locations?.map(l => ({ id: l.id, name: l.name.toLowerCase() })) || [];
  const objectNames = outlineAssets?.objects?.map(o => ({ id: o.id, name: o.name.toLowerCase() })) || [];
  
  // Build the context-aware prompt
  const systemPrompt = buildSystemPrompt(context, outlineAssets);
  const userPrompt = buildUserPrompt(context);
  
  // Call AI
  const response = await generateJSON<{
    summaries: Array<{
      index: number;
      summary: string;
      media_type: 'video' | 'motiongraphic';
      stock_worthy?: boolean;
      image_count?: number;
      visual_description?: string;
      visual_elements?: import('@/types/video').RoutingTag[];
      sound_effects?: import('@/types/video').SoundEffect[];
    }>;
  }>(userId, systemPrompt, userPrompt);
  
  // Merge AI responses with segment data
  const shots: ChunkShotResult[] = context.currentSegments.map((segment, i) => {
    const aiSummary = response.summaries?.find(s => s.index === i);
    const textLower = segment.text.toLowerCase();
    
    // Detect entity references - store names (not IDs) since these are used for search queries
    const characterRefs = characterNames.filter(c => textLower.includes(c.name)).map(c => outlineAssets?.characters?.find(ch => ch.id === c.id)?.name || c.name);
    const locationRefs = locationNames.filter(l => textLower.includes(l.name)).map(l => outlineAssets?.locations?.find(lo => lo.id === l.id)?.name || l.name);
    const objectRefs = objectNames.filter(o => textLower.includes(o.name)).map(o => outlineAssets?.objects?.find(ob => ob.id === o.id)?.name || o.name);
    
    return {
      segment_index: segment.segment_index,
      start_seconds: segment.start_seconds,
      end_seconds: segment.end_seconds,
      duration_seconds: segment.duration_seconds,
      content_type: segment.content_type,
      media_type: aiSummary?.media_type || 'video',
      text: segment.text,
      summary: aiSummary?.summary || generateFallbackSummary(segment),
      stock_worthy: aiSummary?.stock_worthy ?? false,
      image_count: aiSummary?.image_count,
      visual_description: aiSummary?.visual_description,
      visual_elements: aiSummary?.visual_elements,
      sound_effects: aiSummary?.sound_effects,
      character_refs: characterRefs.length > 0 ? characterRefs : undefined,
      location_refs: locationRefs.length > 0 ? locationRefs : undefined,
      object_refs: objectRefs.length > 0 ? objectRefs : undefined,
    };
  });
  
  return shots;
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build the system prompt with context sections.
 */
function buildSystemPrompt(context: ChunkContext, outlineAssets?: OutlineAssets): string {
  const parts: string[] = [];
  
  // Base instructions - Visual Philosophy (principle-based, not prescriptive)
  parts.push(`You are a premium documentary director creating Netflix-quality visuals.
Ask yourself: "What makes this moment MOST powerful?"

## VISUAL PHILOSOPHY

**"video"** - AI-generated cinematic scene
A single continuous moment. One camera, one subject, one atmosphere.
Best when the power is in WATCHING something unfold - movement, emotion, scale.
Creates atmosphere through cinematography: lighting, depth, motion, texture.

**"motiongraphic"** - Composed visual storytelling
Multiple elements working together. Images, text, graphics, annotations.
Best when the power is in RELATIONSHIPS - connecting ideas, revealing patterns,
building visual arguments, or highlighting within context.

Examples of powerful motiongraphic moments:
- Crime boards linking suspects with connecting lines between AI images
- Articles on screen with key passages highlighted
- Before/after reveals, timelines with photos, maps with traced paths
- Visual evidence displays, document close-ups with annotations

The choice is NOT "cinematic vs data" - motiongraphics CAN be atmospheric.
Ask: "Is this a SINGLE SCENE or a COMPOSITION of elements?"

## STOCK FOOTAGE & ENTITY REUSE

stock_worthy = TRUE only for "proof" moments:
- INTRODUCING a famous person for the first time (show THE actual person)
- REVEALING an iconic landmark being discussed (show THE actual place)
- HISTORICAL FOOTAGE of a specific documented event

stock_worthy = FALSE (use AI instead) for:
- Generic concepts (documents, money, crowds, skylines)
- Atmospheric b-roll where AI interpretation would be more premium

reuse_entity: For VISUAL CONSISTENCY when an entity appears AGAIN:
- If showing @(Donald Trump) and you showed him before → reuse_entity: "Donald Trump"
- If it's the FIRST time showing someone → leave reuse_entity null (fresh search)
- This ensures the same person/place looks consistent throughout the video

For motiongraphics, set image_count if multiple images work together.`);

  // Previous shots context (for continuity)
  if (!context.isFirstChunk && context.previousShots.length > 0) {
    parts.push(`
## PREVIOUS SHOTS (for continuity - do not regenerate)
${context.previousShots.map(s => 
  `Shot ${s.segment_index + 1}: "${s.summary}" [${s.media_type}${s.stock_worthy ? ', stock' : ''}]`
).join('\n')}

Maintain visual flow and thematic consistency with these previous decisions.
Avoid repetitive imagery - vary your visual approaches while keeping the same style.`);
  }

  // Entity context
  const entitySection = buildEntityPromptSection(outlineAssets);
  if (entitySection) {
    parts.push(entitySection);
  }

  // Your task
  parts.push(`
## YOUR TASK
Generate visual summaries for the following ${context.currentSegments.length} segments.
For each segment, provide:
1. summary: A 1-sentence visual description (under 25 words) describing what should be shown
2. media_type: "video" (default) or "motiongraphic"
3. stock_worthy: true ONLY for famous people, iconic landmarks, or historical footage
4. reuse_entity: The entity name if this entity appeared before and should reuse its image
5. image_count: (optional) for motiongraphics, number of images if multiple improve clarity
6. visual_description: A detailed description of what you envision (1-2 sentences)
7. visual_elements: Array of routing tags for generation tools

## ROUTING TAGS (visual_elements)
Select ALL that apply from these categories:

CORE (GPU generation):
- "ai_video" → LTX-2 video generation (cinematic motion)
- "ai_image" → Z-Image Turbo (high-quality stills)

STOCK (real footage):
- "stock_image" → Static photos of real people/places

REMOTION (composition):
- "remotion_overlay" → Text, captions, lower-thirds on top
- "remotion_image_manipulation" → Ken Burns, layers, montages
- "remotion_video_manipulation" → Annotations on video

AUDIO (optional):
- "sound_effects" → SFX (whoosh, impact, etc.)
- "music" → Background music/score

## SOUND DESIGN

Include sound effects that **enhance** the video without distracting from it.

When adding SFX to a shot:
- "type": 1-2 word label for display (e.g., "door slam", "crowd gasp")
- "description": Single sentence describing the actual sound (for audio search/generation)
- "trigger_at_seconds": Use word_timestamps to anchor precisely
- "anchor_word": Which spoken word triggers this effect

Good SFX: Enhances reveal moments, emphasizes impacts, builds tension
Bad SFX: Generic whooshes on every cut, distracting clicks

Examples:
- Single AI video: ["ai_video"]
- Photo montage with Ken Burns: ["stock_image", "remotion_image_manipulation"]
- Video with lower-third caption: ["ai_video", "remotion_overlay"]
- Quote card with no base media: ["remotion_overlay"]`);

  // Upcoming content preview (for transitions)
  if (!context.isLastChunk && context.upcomingSegments.length > 0) {
    parts.push(`
## UPCOMING CONTENT (for transition planning - do not generate yet)
${context.upcomingSegments.map(s => 
  `Segment ${s.segment_index + 1} [${s.content_type}]: "${s.text}..."`
).join('\n')}

Consider smooth transitions to this upcoming content.`);
  }

  return parts.join('\n\n');
}

/**
 * Build the user prompt with current segments.
 */
function buildUserPrompt(context: ChunkContext): string {
  const segmentData = context.currentSegments.map((s, i) => ({
    index: i,
    segment_index: s.segment_index,
    type: s.content_type,
    text: s.text.substring(0, 200), // Truncate for token efficiency
    duration: s.duration_seconds,
    start_seconds: s.start_seconds,
    // Include word timestamps for SFX anchoring
    word_timestamps: s.word_timestamps?.slice(0, 15).map(w => ({
      word: w.word,
      start: w.start_seconds,
      end: w.end_seconds
    }))
  }));

  return `Generate visual summaries for these ${context.currentSegments.length} video segments (chunk ${context.chunkIndex + 1}/${context.totalChunks}):

${JSON.stringify(segmentData, null, 2)}

Return JSON:
{
  "summaries": [
    { 
      "index": 0, 
      "summary": "Brief visual description...", 
      "media_type": "video", 
      "stock_worthy": true, 
      "reuse_entity": "Donald Trump",
      "visual_description": "Cinematic slow-motion shot of the subject speaking at a podium with dramatic lighting",
      "visual_elements": ["ai_video", "remotion_overlay"],
      "sound_effects": [
        {
          "type": "paper rustle",
          "description": "Heavy legal documents shuffled on desk",
          "trigger_at_seconds": 12.8,
          "anchor_word": "contract"
        }
      ]
    }
  ]
}
}`;
}

/**
 * Build entity reference section for prompts.
 */
function buildEntityPromptSection(outlineAssets?: OutlineAssets): string {
  const characters = outlineAssets?.characters?.map(c => c.name) || [];
  const locations = outlineAssets?.locations?.map(l => l.name) || [];
  const objects = outlineAssets?.objects?.map(o => o.name) || [];

  if (characters.length === 0 && locations.length === 0 && objects.length === 0) {
    return '';
  }

  let section = `
IMPORTANT: When your summary references any of the following entities, wrap their name in @() syntax.
This helps the UI render rich entity badges.`;

  if (characters.length > 0) {
    section += `
- Characters: ${characters.join(', ')}`;
  }
  if (locations.length > 0) {
    section += `
- Locations: ${locations.join(', ')}`;
  }
  if (objects.length > 0) {
    section += `
- Objects: ${objects.join(', ')}`;
  }

  section += `

Example: "@(Isabella Moretti) gazes at the @(Vintage Watch) on the @(Villa Table)"`;

  return section;
}

// ============================================================================
// FALLBACK GENERATION
// ============================================================================

/**
 * Generate a fallback shot when AI fails.
 */
function generateFallbackShot(
  segment: ShotEvent,
  outlineAssets?: OutlineAssets
): ChunkShotResult {
  const textLower = segment.text.toLowerCase();
  
  const characterNames = outlineAssets?.characters?.map(c => ({ id: c.id, name: c.name.toLowerCase() })) || [];
  const locationNames = outlineAssets?.locations?.map(l => ({ id: l.id, name: l.name.toLowerCase() })) || [];
  const objectNames = outlineAssets?.objects?.map(o => ({ id: o.id, name: o.name.toLowerCase() })) || [];
  
  // Store names (not IDs) since these are used for search queries
  const characterRefs = characterNames.filter(c => textLower.includes(c.name)).map(c => outlineAssets?.characters?.find(ch => ch.id === c.id)?.name || c.name);
  const locationRefs = locationNames.filter(l => textLower.includes(l.name)).map(l => outlineAssets?.locations?.find(lo => lo.id === l.id)?.name || l.name);
  const objectRefs = objectNames.filter(o => textLower.includes(o.name)).map(o => outlineAssets?.objects?.find(ob => ob.id === o.id)?.name || o.name);
  
  return {
    segment_index: segment.segment_index,
    start_seconds: segment.start_seconds,
    end_seconds: segment.end_seconds,
    duration_seconds: segment.duration_seconds,
    content_type: segment.content_type,
    media_type: 'video',
    text: segment.text,
    summary: generateFallbackSummary(segment),
    stock_worthy: false,
    character_refs: characterRefs.length > 0 ? characterRefs : undefined,
    location_refs: locationRefs.length > 0 ? locationRefs : undefined,
    object_refs: objectRefs.length > 0 ? objectRefs : undefined,
  };
}

/**
 * Generate a simple fallback summary based on content type.
 */
function generateFallbackSummary(segment: ShotEvent): string {
  const firstWords = segment.text.split(' ').slice(0, 6).join(' ');
  
  switch (segment.content_type) {
    case 'list-item':
      return `Focused shot: ${firstWords}...`;
    case 'comparison':
      return `Contrasting visual for: ${firstWords}...`;
    case 'concept':
      return `Detailed scene illustrating: ${firstWords}...`;
    case 'transition':
      return `Transitional imagery with movement`;
    case 'emotional-beat':
      return `Atmospheric scene: ${firstWords}...`;
    default:
      return `Visual representing: ${firstWords}...`;
  }
}

// ============================================================================
// PROGRESS HELPERS
// ============================================================================

/**
 * Calculate progress percentage for a chunk.
 */
function calculateProgress(
  chunkIndex: number,
  totalChunks: number,
  phase: 'start' | 'end'
): number {
  const chunkProgressRange = CHUNK_PROGRESS_END - CHUNK_PROGRESS_START;
  const chunkWeight = chunkProgressRange / totalChunks;
  
  if (phase === 'start') {
    return Math.round(CHUNK_PROGRESS_START + (chunkIndex * chunkWeight));
  } else {
    return Math.round(CHUNK_PROGRESS_START + ((chunkIndex + 1) * chunkWeight));
  }
}

/**
 * Build a human-readable progress message.
 */
function buildProgressMessage(
  startIdx: number,
  endIdx: number,
  totalSegments: number,
  chunkIndex: number,
  totalChunks: number
): string {
  return `Generating shots ${startIdx + 1}-${endIdx} of ${totalSegments} (Chunk ${chunkIndex + 1}/${totalChunks})`;
}
