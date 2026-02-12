/**
 * YouTube Video Ranker Service
 * ============================================================================
 * Intelligent video selection using Gemini 3 Flash for metadata ranking
 * and content validation before expensive download operations.
 */

import { callOpenRouter } from '@/lib/ai/openrouter';

// =============================================================================
// Types
// =============================================================================

export interface VideoMetadata {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  viewCount: number;
  durationSeconds: number;
  publishedAt?: string;
  thumbnailUrl?: string;
}

export interface RankedVideo {
  videoId: string;
  score: number;
  reasoning: string;
}

export interface ContentValidation {
  hasEnoughContent: boolean;
  estimatedClipCount: number;
  reasoning: string;
  confidence: number;
}

// =============================================================================
// Prompts
// =============================================================================

const RANKING_PROMPT = `You are an expert at identifying high-quality stock footage source videos.
Given YouTube video metadata, rank them for stock footage potential.

Search Query: "{QUERY}"

Videos:
{VIDEOS}

For each video, consider:
- Title relevance to the search query (most important)
- Description quality and detail (indicates professional upload)
- View count (higher generally means better production quality)
- Duration (5-30 minutes is ideal for extracting multiple clips)
- Channel credibility (verified descriptions, professional language)

Return a JSON array sorted by score (highest first):
[
  { "videoId": "...", "score": 1-10, "reasoning": "brief explanation" },
  ...
]

IMPORTANT: Only return valid JSON, no markdown or extra text.`;

const VALIDATION_PROMPT = `You are evaluating if a YouTube video contains enough raw footage for stock clips.

Video Title: "{TITLE}"
Description: "{DESCRIPTION}"
Duration: {DURATION} minutes
Channel: {CHANNEL}
View Count: {VIEWS} views
Search Query: "{QUERY}"

Determine if this video likely contains:
1. Real footage (not just graphics, animations, or slideshows)
2. Multiple distinct scenes (not a single static shot or talking head)
3. Content related to the search query
4. At least 1-3 potential usable stock clips

Scoring guide:
- If the video is primarily narration/commentary with minimal B-roll, it has LOW clip potential
- If it's a compilation, documentary, or professional footage showcase, it has HIGH potential
- Vlogs, tutorials, and reaction videos typically have LOW potential
- Travel videos, nature documentaries, and event coverage have HIGH potential

Return JSON:
{
  "hasEnoughContent": true/false,
  "estimatedClipCount": 0-20 (realistic estimate),
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0
}

IMPORTANT: Only return valid JSON, no markdown or extra text.`;

// =============================================================================
// Functions
// =============================================================================

/**
 * Parse JSON response from Gemini, handling potential markdown wrapping.
 */
function parseJsonResponse<T>(content: string): T {
  let cleaned = content.trim();
  
  // Remove markdown code blocks if present
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    lines.shift(); // Remove first ```json line
    if (lines[lines.length - 1] === '```') {
      lines.pop(); // Remove closing ```
    }
    cleaned = lines.join('\n');
  }
  
  return JSON.parse(cleaned);
}

/**
 * Rank videos by metadata using Gemini 3 Flash.
 * Returns videos sorted by stock footage potential (highest first).
 */
export async function rankVideosByMetadata(
  videos: VideoMetadata[],
  searchQuery: string,
  userId: string
): Promise<RankedVideo[]> {
  if (videos.length === 0) {
    return [];
  }

  console.log(`[YouTube Ranker] Ranking ${videos.length} videos for query: "${searchQuery}"`);

  // Format videos for the prompt
  const videosJson = JSON.stringify(
    videos.map((v, i) => ({
      index: i + 1,
      videoId: v.id,
      title: v.title,
      description: v.description.substring(0, 300) + (v.description.length > 300 ? '...' : ''),
      channelTitle: v.channelTitle,
      viewCount: v.viewCount,
      durationMinutes: Math.round(v.durationSeconds / 60),
    })),
    null,
    2
  );

  const prompt = RANKING_PROMPT
    .replace('{QUERY}', searchQuery)
    .replace('{VIDEOS}', videosJson);

  try {
    const response = await callOpenRouter(
      userId,
      [{ role: 'user', content: prompt }],
      { model: 'google/gemini-2.0-flash-001' }
    );

    const content = response.content;
    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    const rankings = parseJsonResponse<RankedVideo[]>(content);
    
    // Ensure all videos are included (in case Gemini missed some)
    const rankedIds = new Set(rankings.map(r => r.videoId));
    for (const video of videos) {
      if (!rankedIds.has(video.id)) {
        rankings.push({
          videoId: video.id,
          score: 3, // Default low score for unranked
          reasoning: 'Not explicitly ranked by AI',
        });
      }
    }

    // Sort by score descending
    rankings.sort((a, b) => b.score - a.score);

    console.log(`[YouTube Ranker] Top ranked: "${videos.find(v => v.id === rankings[0]?.videoId)?.title}" (score: ${rankings[0]?.score})`);
    
    return rankings;
  } catch (error) {
    console.error('[YouTube Ranker] Ranking failed:', error);
    
    // Fallback: return videos in original order with default scores
    return videos.map((v, i) => ({
      videoId: v.id,
      score: 5 - (i * 0.5), // Decreasing scores
      reasoning: 'Ranking fallback - AI analysis failed',
    }));
  }
}

/**
 * Validate if a video has enough stock-worthy content.
 * Uses Gemini to analyze video metadata before expensive download.
 */
export async function validateVideoContent(
  video: VideoMetadata,
  searchQuery: string,
  userId: string
): Promise<ContentValidation> {
  console.log(`[YouTube Ranker] Validating content for: "${video.title}"`);

  const durationMinutes = Math.round(video.durationSeconds / 60);
  
  const prompt = VALIDATION_PROMPT
    .replace('{TITLE}', video.title)
    .replace('{DESCRIPTION}', video.description.substring(0, 500))
    .replace('{DURATION}', durationMinutes.toString())
    .replace('{CHANNEL}', video.channelTitle)
    .replace('{VIEWS}', video.viewCount.toLocaleString())
    .replace('{QUERY}', searchQuery);

  try {
    const response = await callOpenRouter(
      userId,
      [{ role: 'user', content: prompt }],
      { model: 'google/gemini-2.0-flash-001' }
    );

    const content = response.content;
    if (!content) {
      throw new Error('Empty response from Gemini');
    }

    const validation = parseJsonResponse<ContentValidation>(content);
    
    console.log(`[YouTube Ranker] Validation result: ${validation.hasEnoughContent ? '✓' : '✗'} (${validation.estimatedClipCount} clips, ${(validation.confidence * 100).toFixed(0)}% confidence)`);
    
    return validation;
  } catch (error) {
    console.error('[YouTube Ranker] Validation failed:', error);
    
    // Fallback: be optimistic if video is long enough
    const isLongEnough = video.durationSeconds >= 60; // At least 1 minute
    return {
      hasEnoughContent: isLongEnough,
      estimatedClipCount: isLongEnough ? 2 : 0,
      reasoning: 'Validation fallback - AI analysis failed, using duration heuristic',
      confidence: 0.3,
    };
  }
}

/**
 * Process videos in ranked order until a valid one is found.
 * Returns the first video that passes content validation.
 */
export async function selectBestVideo(
  videos: VideoMetadata[],
  searchQuery: string,
  userId: string,
  minClips: number = 1
): Promise<{ video: VideoMetadata; validation: ContentValidation } | null> {
  // Step 1: Rank all videos by metadata
  const rankings = await rankVideosByMetadata(videos, searchQuery, userId);
  
  // Step 2: Validate in ranked order
  for (const ranking of rankings) {
    const video = videos.find(v => v.id === ranking.videoId);
    if (!video) continue;
    
    // Skip very low-scored videos
    if (ranking.score < 3) {
      console.log(`[YouTube Ranker] Skipping "${video.title}" - score too low (${ranking.score})`);
      continue;
    }
    
    const validation = await validateVideoContent(video, searchQuery, userId);
    
    // Accept if has enough content (min 1 clip acceptable)
    if (validation.hasEnoughContent && validation.estimatedClipCount >= minClips && validation.confidence >= 0.4) {
      console.log(`[YouTube Ranker] ✓ Selected: "${video.title}"`);
      return { video, validation };
    }
    
    console.log(`[YouTube Ranker] ✗ Rejected: "${video.title}" - ${validation.reasoning}`);
  }
  
  console.log('[YouTube Ranker] No suitable videos found in batch');
  return null;
}
