/**
 * Video Segmentation Service
 * ==========================================================================
 * Breaks videos into classified clips using Gemini for scene detection
 * and Groq Whisper for transcription (optional).
 */

import { callOpenRouter, type OpenRouterMessage } from '@/lib/ai/openrouter';
import { hasGroqApiKey, transcribeWithGroq, findSentenceEnds } from './groq-whisper';
import type {
  DetectedScene,
  SceneAnalysisResult,
  VideoClip,
  ClipAudioType,
  TranscriptionResult,
  SegmentVideoJobData,
} from './types';

// ==========================================================================
// Configuration
// ==========================================================================

const SCENE_DETECTION_MODEL = 'google/gemini-3-flash-preview';

// Chunked analysis settings for long videos
const CHUNK_DURATION_SECONDS = 300;  // 5 minutes per chunk
const CHUNK_OVERLAP_SECONDS = 5;     // 5s overlap to catch boundary scenes
const MAX_CHUNKS = 30;               // Cap at 2.5 hours to prevent runaway costs
const MIN_DURATION_FOR_CHUNKING = 300; // Videos < 5 min use single-call analysis

const SCENE_ANALYSIS_PROMPT = `You are a professional video editor analyzing footage for a stock media library.

**GOAL**: Extract RAW, UNEDITED stock footage clips. We want natural, authentic footage - NOT heavily produced content.

**EXCLUDE these types of scenes (set sceneType to "graphic" so they get filtered):**
- Title cards, text overlays, lower thirds
- Animated graphics, logos, intro/outro sequences
- Split screens, picture-in-picture effects
- Heavy color grading or stylized filters
- Motion graphics or animated infographics
- Montages with fast cuts (< 2 seconds per shot)
- Slideshows or photo compilations

**INCLUDE these types of scenes:**
- Natural B-roll footage (people, places, objects)
- Interview/talking head segments
- Action shots and events
- Establishing wide shots
- Documentary-style raw footage

For each USABLE scene, determine:
1. Start and end timestamps (in seconds from video start)
2. Scene type: "interview", "b-roll", "action", "establishing", "transition", "montage", "graphic", or "other"
3. Whether it has meaningful speech/audio
4. Description for searchability
5. Main subjects visible
6. Mood/tone
7. isRawFootage: true if unedited/natural, false if heavily produced

Return JSON:
{
  "scenes": [
    {
      "startTime": 0.0,
      "endTime": 7.5,
      "sceneType": "b-roll",
      "description": "Man walking through city street at sunset",
      "hasAudio": false,
      "subjects": ["man", "city", "street"],
      "mood": "contemplative",
      "isRawFootage": true
    }
  ],
  "totalDuration": 120.5
}

Important:
- ONLY include clips that would work as standalone stock footage
- Target scenes of 5-10 seconds each
- Cut at natural visual/audio boundaries
- Skip all graphics, animations, and heavily edited sequences`;

// Prompt for analyzing video chunks with time context
const CHUNKED_SCENE_ANALYSIS_PROMPT = `You are a professional video editor analyzing a SEGMENT of a longer video for a stock media library.

**CRITICAL**: This is segment covering timestamps {START_TIME}s to {END_TIME}s of the original video.
Return timestamps RELATIVE TO THIS SEGMENT (starting from 0).

{VIDEO_CONTEXT}

**GOAL**: Extract RAW, UNEDITED stock footage clips. We want natural, authentic footage - NOT heavily produced content.

**DESCRIPTION REQUIREMENTS - VERY IMPORTANT**:
- Use SPECIFIC names for people when identifiable (e.g., "Jamie Dimon speaking at podium" not "businessman speaking")
- Include specific location/setting names when known (e.g., "JPMorgan Chase headquarters" not "office building")
- Describe WHAT the person is doing specifically (e.g., "explaining financial strategy" not "talking")
- Include relevant context from the video topic in descriptions
- Make descriptions detailed enough for accurate semantic search

**EXCLUDE these (mark as sceneType "graphic" to filter out):**
- Title cards, text overlays, lower thirds, credits
- Animated graphics, logos, intro/outro sequences  
- Split screens, picture-in-picture, heavy effects
- Motion graphics, animated infographics
- Montages with very fast cuts (< 2 seconds per shot)
- Slideshows, photo compilations, archival overlays

**INCLUDE these as usable stock footage:**
- Natural B-roll footage (people, places, objects, events)
- Interview/talking head segments (raw, not cutaway compilations)
- Action shots, documentary moments
- Establishing wide shots of locations
- Authentic, unedited footage

For each USABLE scene, provide:
1. Start and end timestamps (in seconds with 0.5s precision, e.g., 12.5, 13.0, 13.5)
2. Scene type: "interview", "b-roll", "action", "establishing", "transition", "montage", "graphic", or "other"
3. Whether it has meaningful speech/audio
4. Description for searchability - USE SPECIFIC NAMES AND DETAILS
5. Main subjects visible - USE ACTUAL NAMES WHEN KNOWN
6. Mood/tone
7. isRawFootage: true if natural/unedited, false if heavily produced

**TIMESTAMP PRECISION**: Analyze the video frame-by-frame and provide timestamps to 0.5 second precision:
- Detect the EXACT frame where each scene begins and ends
- Round to nearest 0.5 seconds (e.g., 14.0, 14.5, 15.0)
- Pay close attention to shot changes, cuts, and transitions

Return JSON:
{
  "scenes": [
    {
      "startTime": 12.5,
      "endTime": 19.0,
      "sceneType": "interview",
      "description": "Jamie Dimon, CEO of JPMorgan Chase, discussing risk management strategies in a corporate boardroom setting",
      "hasAudio": true,
      "subjects": ["Jamie Dimon", "boardroom", "JPMorgan"],
      "mood": "professional",
      "isRawFootage": true
    }
  ]
}

Important:
- Find ALL usable raw footage clips in this segment
- SKIP graphics, animations, text overlays
- Short clips (1-5 seconds) are acceptable if they show the requested subject
- Cut at natural visual/audio boundaries with 0.5s precision
- USE SPECIFIC NAMES for people, places, and organizations`;

// ==========================================================================
// Scene Detection
// ==========================================================================

/**
 * Analyze a single chunk/time-window of a video with Gemini.
 * Returns scenes with timestamps relative to the chunk start.
 */
async function analyzeVideoChunk(
  videoUrl: string,
  userId: string,
  chunkStartTime: number,
  chunkEndTime: number,
  filterPrompt?: string,
  videoTitle?: string
): Promise<DetectedScene[]> {
  console.log(`[Segment] Analyzing chunk: ${chunkStartTime}s - ${chunkEndTime}s`);

  // Build video context section for the prompt
  let videoContext = '';
  if (videoTitle) {
    videoContext = `**VIDEO CONTEXT**: This video is titled "${videoTitle}". Use this information to identify specific people, organizations, and topics by name.`;
  }

  // Build time-aware prompt
  let systemPrompt = CHUNKED_SCENE_ANALYSIS_PROMPT
    .replace('{START_TIME}', String(chunkStartTime))
    .replace('{END_TIME}', String(chunkEndTime))
    .replace('{VIDEO_CONTEXT}', videoContext);

  if (filterPrompt) {
    systemPrompt += `

**CRITICAL FILTER - READ CAREFULLY**:
The user ONLY wants clips of: "${filterPrompt}"

STRICT SCENE BOUNDARY RULES:
1. ONLY include scenes where "${filterPrompt}" is VISUALLY PRESENT on screen
2. The clip MUST START when "${filterPrompt}" FIRST appears in frame
3. The clip MUST END IMMEDIATELY when "${filterPrompt}" leaves the frame or the camera cuts away
4. Do NOT let clips extend beyond when the subject is visible
5. If the video cuts from "${filterPrompt}" to a YouTuber/narrator, END the clip at that exact cut

EXCLUSIONS:
- Do NOT include scenes of other people talking ABOUT this subject
- Do NOT include narrators, hosts, or YouTubers as part of the clip
- If a scene shows a different person (e.g., video creator/host), that's a NEW scene, not part of this clip
- If you cannot visually confirm "${filterPrompt}" is in the scene, SKIP IT
- Return an EMPTY scenes array if no scenes match

Example: 
- Video shows Jamie Dimon speaking (0:10-0:25), then cuts to YouTuber (0:25-0:35)
- Correct clip: startTime: 10.0, endTime: 25.0 (ends at the cut)
- WRONG: startTime: 10.0, endTime: 35.0 (includes YouTuber)`;
  }

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { 
          type: 'text', 
          text: `Analyze this video segment (${chunkStartTime}s - ${chunkEndTime}s) and identify ALL scenes:` 
        },
        { type: 'video_url', video_url: { url: videoUrl } },
      ] as any,
    },
  ];

  const response = await callOpenRouter(userId, messages, {
    model: SCENE_DETECTION_MODEL,
    temperature: 0.2,
    maxTokens: 16384,
  });

  const result = parseSceneAnalysisResponse(response.content);
  
  // Calculate expected chunk duration
  const expectedChunkDuration = chunkEndTime - chunkStartTime;
  
  // Filter and validate scenes - Gemini sometimes returns timestamps outside the chunk range
  const validScenes = result.scenes.filter(scene => {
    // Scene timestamps should be relative to chunk (0 to chunkDuration)
    // Filter out scenes with invalid timestamps
    if (scene.startTime < 0 || scene.endTime < 0) return false;
    if (scene.startTime > expectedChunkDuration + 10) return false; // Allow 10s tolerance
    if (scene.endTime > expectedChunkDuration + 10) return false;
    return true;
  });
  
  console.log(`[Segment] Chunk validated: ${result.scenes.length} raw -> ${validScenes.length} valid scenes`);
  
  // Adjust timestamps: add chunkStartTime to convert from chunk-relative to video-absolute
  // Also cap end time to not exceed video duration
  return validScenes.map(scene => ({
    ...scene,
    startTime: Math.min(scene.startTime + chunkStartTime, chunkEndTime),
    endTime: Math.min(scene.endTime + chunkStartTime, chunkEndTime),
  }));
}

/**
 * Analyze video scenes using chunked approach for long videos.
 * Processes video in 5-minute chunks and merges results.
 */
async function analyzeVideoScenesChunked(
  videoUrl: string,
  userId: string,
  videoDuration: number,
  filterPrompt?: string,
  onChunkProgress?: (currentChunk: number, totalChunks: number) => void,
  videoTitle?: string
): Promise<SceneAnalysisResult> {
  const startTime = Date.now();
  
  // Calculate chunks
  const effectiveChunkDuration = CHUNK_DURATION_SECONDS - CHUNK_OVERLAP_SECONDS;
  let numChunks = Math.ceil(videoDuration / effectiveChunkDuration);
  numChunks = Math.min(numChunks, MAX_CHUNKS);
  
  console.log(`[Segment] Chunked analysis: ${numChunks} chunks for ${videoDuration}s video`);
  
  const allScenes: DetectedScene[] = [];
  
  for (let i = 0; i < numChunks; i++) {
    const chunkStart = i * effectiveChunkDuration;
    const chunkEnd = Math.min(chunkStart + CHUNK_DURATION_SECONDS, videoDuration);
    
    onChunkProgress?.(i + 1, numChunks);
    
    try {
      const chunkScenes = await analyzeVideoChunk(
        videoUrl,
        userId,
        chunkStart,
        chunkEnd,
        filterPrompt,
        videoTitle
      );
      
      console.log(`[Segment] Chunk ${i + 1}/${numChunks}: found ${chunkScenes.length} scenes`);
      allScenes.push(...chunkScenes);
      
    } catch (error) {
      console.error(`[Segment] Chunk ${i + 1}/${numChunks} failed:`, error);
      // Continue with other chunks rather than failing entirely
    }
  }
  
  // Deduplicate overlapping scenes at chunk boundaries
  const deduplicatedScenes = deduplicateScenes(allScenes);
  
  const processingTime = Date.now() - startTime;
  console.log(`[Segment] Chunked analysis complete: ${deduplicatedScenes.length} total scenes in ${processingTime}ms`);
  
  return {
    scenes: deduplicatedScenes,
    totalDuration: videoDuration,
    processingTimeMs: processingTime,
  };
}

/**
 * Remove duplicate scenes from overlapping chunk boundaries.
 * Scenes are considered duplicates if they overlap by >50%.
 */
function deduplicateScenes(scenes: DetectedScene[]): DetectedScene[] {
  if (scenes.length <= 1) return scenes;
  
  // Sort by start time
  const sorted = [...scenes].sort((a, b) => a.startTime - b.startTime);
  const result: DetectedScene[] = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = result[result.length - 1];
    
    // Check overlap
    const overlapStart = Math.max(previous.startTime, current.startTime);
    const overlapEnd = Math.min(previous.endTime, current.endTime);
    const overlapDuration = Math.max(0, overlapEnd - overlapStart);
    
    // If ANY overlap exists (> 2 seconds), consider duplicate
    // This catches chunk-boundary duplicates with different descriptions
    if (overlapDuration > 2) {
      // Keep the one with longer description (likely more detailed)
      if (current.description.length > previous.description.length) {
        result[result.length - 1] = current;
      }
      continue;
    }
    
    result.push(current);
  }
  
  return result;
}

/**
 * Analyze video with Gemini to detect scenes.
 * Automatically uses chunked analysis for videos > 5 minutes.
 */
export async function analyzeVideoScenes(
  videoUrl: string,
  userId: string,
  filterPrompt?: string,
  videoDuration?: number,
  onChunkProgress?: (currentChunk: number, totalChunks: number) => void,
  videoTitle?: string
): Promise<SceneAnalysisResult> {
  // For long videos, use chunked analysis
  if (videoDuration && videoDuration > MIN_DURATION_FOR_CHUNKING) {
    console.log(`[Segment] Video is ${videoDuration}s - using chunked analysis`);
    return analyzeVideoScenesChunked(
      videoUrl,
      userId,
      videoDuration,
      filterPrompt,
      onChunkProgress,
      videoTitle
    );
  }

  // Short videos: use single-call analysis (original logic)
  const startTime = Date.now();
  console.log('[Segment] Analyzing video scenes with Gemini (single-call)...');
  if (filterPrompt) {
    console.log(`[Segment] Filter: "${filterPrompt}"`);
  }

  // Build dynamic prompt based on filter
  let systemPrompt = SCENE_ANALYSIS_PROMPT;
  if (filterPrompt) {
    systemPrompt += `\n\n**IMPORTANT FILTER**: The user wants ONLY clips matching this description: "${filterPrompt}"
Only identify and return scenes that match this criteria. Skip any scenes that don't match.
If no scenes match, return an empty scenes array.`;
  }

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: filterPrompt 
          ? `Analyze this video and identify scenes matching: "${filterPrompt}"` 
          : 'Analyze this video and identify scenes:' },
        { type: 'video_url', video_url: { url: videoUrl } },
      ] as any,
    },
  ];

  const response = await callOpenRouter(userId, messages, {
    model: SCENE_DETECTION_MODEL,
    temperature: 0.2,
    maxTokens: 16384,
  });

  const result = parseSceneAnalysisResponse(response.content);
  const processingTime = Date.now() - startTime;
  
  console.log(`[Segment] Found ${result.scenes.length} scenes in ${processingTime}ms`);
  
  return {
    ...result,
    processingTimeMs: processingTime,
  };
}

/**
 * Parse Gemini's scene analysis response.
 */
function parseSceneAnalysisResponse(content: string): Omit<SceneAnalysisResult, 'processingTimeMs'> {
  let cleaned = content.trim();
  
  // Handle markdown code blocks
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    cleaned = match[1].trim();
  }

  try {
    const data = JSON.parse(cleaned);
    return {
      scenes: data.scenes || [],
      totalDuration: data.totalDuration || 0,
    };
  } catch (error) {
    console.error('[Segment] Failed to parse scene analysis:', cleaned.substring(0, 200));
    throw new Error('Failed to parse scene analysis response');
  }
}

// ==========================================================================
// Smart Segmentation
// ==========================================================================

/**
 * Merge scene detection with word timestamps to find optimal cut points.
 */
export function mergeSceneAndWordBoundaries(
  scenes: DetectedScene[],
  transcription: TranscriptionResult | null,
  targetDuration: { min: number; max: number }
): DetectedScene[] {
  if (!transcription || transcription.words.length === 0) {
    // No transcription - use scenes as-is, capped to target duration
    return scenes.map(scene => capSceneDuration(scene, targetDuration));
  }

  const sentenceEnds = findSentenceEnds(transcription.words);
  const optimizedScenes: DetectedScene[] = [];

  for (const scene of scenes) {
    // If scene is within target range, keep as-is
    const duration = scene.endTime - scene.startTime;
    if (duration >= targetDuration.min && duration <= targetDuration.max) {
      optimizedScenes.push(scene);
      continue;
    }

    // If scene is too long, try to split at sentence boundaries
    if (duration > targetDuration.max) {
      const subScenes = splitSceneAtSentences(scene, sentenceEnds, targetDuration);
      optimizedScenes.push(...subScenes);
    } else {
      // Scene too short - keep as-is (might merge later)
      optimizedScenes.push(scene);
    }
  }

  return optimizedScenes;
}

/**
 * Split a scene at sentence boundaries.
 */
function splitSceneAtSentences(
  scene: DetectedScene,
  sentenceEnds: number[],
  targetDuration: { min: number; max: number }
): DetectedScene[] {
  const subScenes: DetectedScene[] = [];
  let currentStart = scene.startTime;

  // Find sentence ends within this scene
  const relevantEnds = sentenceEnds.filter(
    t => t > scene.startTime && t < scene.endTime
  );

  for (const endTime of relevantEnds) {
    const duration = endTime - currentStart;
    
    if (duration >= targetDuration.min) {
      subScenes.push({
        ...scene,
        startTime: currentStart,
        endTime: endTime,
        description: `${scene.description} (part ${subScenes.length + 1})`,
      });
      currentStart = endTime;
    }
  }

  // Add remaining portion if significant
  if (scene.endTime - currentStart >= targetDuration.min) {
    subScenes.push({
      ...scene,
      startTime: currentStart,
      endTime: scene.endTime,
      description: `${scene.description} (part ${subScenes.length + 1})`,
    });
  }

  // If we couldn't split well, just cap the original
  if (subScenes.length === 0) {
    return [capSceneDuration(scene, targetDuration)];
  }

  return subScenes;
}

/**
 * Cap a scene to the target duration.
 */
function capSceneDuration(
  scene: DetectedScene,
  targetDuration: { min: number; max: number }
): DetectedScene {
  const duration = scene.endTime - scene.startTime;
  
  if (duration <= targetDuration.max) {
    return scene;
  }

  return {
    ...scene,
    endTime: scene.startTime + targetDuration.max,
  };
}

// ==========================================================================
// Clip Generation
// ==========================================================================

/**
 * Generate clip metadata from scenes.
 * Filters out graphic overlays, heavily edited content, and non-raw footage.
 */
export function generateClipMetadata(
  scenes: DetectedScene[],
  transcription: TranscriptionResult | null,
  parentVideoId: string,
  baseR2Path: string
): Omit<VideoClip, 'r2Key' | 'thumbnailR2Key' | 'qualityRating'>[] {
  // Filter out non-stock footage: graphics, montages, transitions, and heavily edited content
  const usableScenes = scenes.filter(scene => {
    // Calculate duration
    const duration = scene.endTime - scene.startTime;
    
    // Exclude clips with zero or negative duration
    if (duration <= 0) {
      return false;
    }
    
    // Exclude clips longer than 30 seconds (too long for stock)
    if (duration > 30) {
      console.log(`[Segment] Skipping scene (too long: ${duration.toFixed(1)}s): ${scene.description.substring(0, 50)}`);
      return false;
    }
    
    // Exclude graphic overlays, text, animations
    if (scene.sceneType === 'graphic') return false;
    // Exclude fast-cut montages (usually heavily edited)
    if (scene.sceneType === 'montage') return false;
    // Exclude very short transitions
    if (scene.sceneType === 'transition' && duration < 3) return false;
    // Check isRawFootage if present (from Gemini analysis)
    if ('isRawFootage' in scene && (scene as any).isRawFootage === false) return false;
    return true;
  });
  
  console.log(`[Segment] Filtered ${scenes.length} scenes to ${usableScenes.length} usable stock clips`);

  return usableScenes.map((scene, index) => {
    // Determine audio type
    const audioType: ClipAudioType = scene.hasAudio ? 'visual+audio' : 'visual-only';
    
    // Extract transcription for this clip if available
    let clipTranscription: string | null = null;
    if (transcription && scene.hasAudio) {
      const words = transcription.words.filter(
        w => w.start >= scene.startTime && w.end <= scene.endTime
      );
      if (words.length > 0) {
        clipTranscription = words.map(w => w.word).join(' ');
      }
    }

    // Determine suggested uses based on scene type
    const suggestedUses = getSuggestedUses(scene);

    return {
      id: `${parentVideoId}-clip-${String(index + 1).padStart(3, '0')}`,
      parentVideoId,
      startTime: scene.startTime,
      endTime: scene.endTime,
      duration: scene.endTime - scene.startTime,
      audioType,
      sceneType: scene.sceneType,
      description: scene.description,
      transcription: clipTranscription,
      subjects: scene.subjects,
      mood: scene.mood,
      suggestedUses,
    };
  });
}

/**
 * Get suggested uses based on scene type.
 */
function getSuggestedUses(scene: DetectedScene): string[] {
  const uses: string[] = [];

  switch (scene.sceneType) {
    case 'interview':
      uses.push('talking-head', 'explainer', 'testimonial');
      break;
    case 'b-roll':
      uses.push('b-roll', 'cutaway', 'background');
      break;
    case 'establishing':
      uses.push('intro', 'opening', 'location');
      break;
    case 'action':
      uses.push('highlight', 'dynamic', 'energy');
      break;
    case 'transition':
      uses.push('transition', 'segue');
      break;
    case 'montage':
      uses.push('montage', 'fast-paced');
      break;
    default:
      uses.push('general');
  }

  // Add audio-based suggestions
  if (!scene.hasAudio) {
    uses.push('silent-b-roll', 'overlay');
  }

  return uses;
}

// ==========================================================================
// Main Segmentation Function
// ==========================================================================

/**
 * Full video segmentation pipeline.
 */
export async function segmentVideo(
  jobData: SegmentVideoJobData,
  audioBuffer: Buffer | null,
  onProgress?: (stage: string, progress: number) => void
): Promise<{
  clips: Omit<VideoClip, 'r2Key' | 'thumbnailR2Key' | 'qualityRating'>[];
  transcription: TranscriptionResult | null;
  hadAudioTranscription: boolean;
}> {
  const { userId, videoId, sourceUrl, targetClipDuration } = jobData;

  // 1. Check if we should transcribe
  onProgress?.('transcribing', 10);
  let transcription: TranscriptionResult | null = null;
  const canTranscribe = await hasGroqApiKey(userId);

  if (canTranscribe && audioBuffer) {
    try {
      transcription = await transcribeWithGroq(audioBuffer, `${videoId}.mp4`, userId);
      console.log(`[Segment] Transcription complete: ${transcription?.words.length || 0} words`);
    } catch (error) {
      console.error('[Segment] Transcription failed, continuing without:', error);
    }
  } else {
    console.log('[Segment] Skipping transcription - no Groq key or audio buffer');
  }

  // 2. Analyze scenes with Gemini (chunked for long videos)
  onProgress?.('analyzing', 30);
  
  // Track chunk progress within analyzing phase (30-50%)
  const onChunkProgress = (currentChunk: number, totalChunks: number) => {
    const chunkProgress = 30 + Math.floor((currentChunk / totalChunks) * 20);
    onProgress?.('analyzing', chunkProgress);
  };
  
  const sceneAnalysis = await analyzeVideoScenes(
    sourceUrl, 
    userId, 
    jobData.filterPrompt,
    jobData.videoDuration,
    onChunkProgress,
    jobData.videoTitle
  );

  // 3. Merge and optimize scene boundaries
  onProgress?.('analyzing', 50);
  const optimizedScenes = mergeSceneAndWordBoundaries(
    sceneAnalysis.scenes,
    transcription,
    targetClipDuration
  );
  console.log(`[Segment] Optimized to ${optimizedScenes.length} clips`);

  // 4. Generate clip metadata
  onProgress?.('extracting', 60);
  const clips = generateClipMetadata(
    optimizedScenes,
    transcription,
    videoId,
    `stock-media/clips/${videoId}`
  );

  return {
    clips,
    transcription,
    hadAudioTranscription: !!transcription,
  };
}
