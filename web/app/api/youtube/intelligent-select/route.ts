/**
 * YouTube Intelligent Selection API
 * ============================================================================
 * POST /api/youtube/intelligent-select
 * 
 * Performs 2-phase intelligent video selection:
 * 1. Ranks 10 videos by metadata using Gemini
 * 2. Validates content potential before expensive download
 * 3. Processes the best video to extract maximum clips
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getValidGCPToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';
import { 
  selectBestVideo, 
  VideoMetadata,
} from '@/lib/youtube/youtube-ranker';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes for ranking + validation

const MAX_VIDEOS_TO_ANALYZE = 10;

export async function POST(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { query, filterPrompt, maxResults = MAX_VIDEOS_TO_ANALYZE } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    console.log(`[YouTube Intelligent] Starting selection for: "${query}"`);

    // Get GCP token for YouTube API access
    let accessToken: string;
    try {
      accessToken = await getValidGCPToken(user.id);
    } catch (_tokenError) {
      return NextResponse.json({
        success: false,
        error: 'GCP connection required for YouTube search',
        gcpRequired: true,
      }, { status: 403 });
    }

    const youtubeApi = new YouTubeApi(accessToken);

    // ==========================================================================
    // STEP 1: Search for videos (10 max for quota efficiency)
    // ==========================================================================
    console.log(`[YouTube Intelligent] Searching for ${maxResults} videos...`);
    const searchResponse = await youtubeApi.searchVideos({
      query,
      maxResults: Math.min(maxResults, MAX_VIDEOS_TO_ANALYZE),
      order: 'relevance',
      videoDefinition: 'high', // Prefer HD videos
      videoDuration: 'medium', // 4-20 minutes (ideal for clips)
    });

    if (searchResponse.hits.length === 0) {
      console.log('[YouTube Intelligent] No videos found');
      return NextResponse.json({
        success: false,
        reason: 'No videos found for query',
        query,
      });
    }

    console.log(`[YouTube Intelligent] Found ${searchResponse.hits.length} videos`);

    // ==========================================================================
    // STEP 2: Get detailed metadata for ranking (1 unit per video)
    // ==========================================================================
    console.log('[YouTube Intelligent] Fetching video details...');
    const videoDetailsPromises = searchResponse.hits.map(hit => 
      youtubeApi.getVideoDetails(hit.id)
    );
    const videoDetails = await Promise.all(videoDetailsPromises);

    // Convert to VideoMetadata format
    const videosToRank: VideoMetadata[] = videoDetails
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .map(v => ({
        id: v.id,
        title: v.title,
        description: v.description,
        channelTitle: v.channelTitle,
        viewCount: v.viewCount,
        durationSeconds: v.durationSeconds,
        publishedAt: v.publishedAt,
        thumbnailUrl: v.thumbnailUrl,
      }));

    if (videosToRank.length === 0) {
      console.log('[YouTube Intelligent] Failed to get video details');
      return NextResponse.json({
        success: false,
        reason: 'Failed to retrieve video details',
      });
    }

    // ==========================================================================
    // STEP 3: Rank and validate videos (Gemini calls)
    // ==========================================================================
    console.log('[YouTube Intelligent] Ranking and validating videos...');
    const selection = await selectBestVideo(videosToRank, query, user.id, 1);

    if (!selection) {
      console.log('[YouTube Intelligent] No suitable videos found');
      return NextResponse.json({
        success: false,
        reason: 'No suitable videos found in top 10 results',
        query,
        videosAnalyzed: videosToRank.length,
      });
    }

    const { video, validation } = selection;
    console.log(`[YouTube Intelligent] ✓ Selected: "${video.title}" (${validation.estimatedClipCount} clips estimated)`);

    // ==========================================================================
    // STEP 4: Process the selected video via segmentation pipeline
    // ==========================================================================
    const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
    
    // Include instructions to maximize clip extraction
    const enhancedFilterPrompt = filterPrompt 
      ? `${filterPrompt}. Extract ALL relevant stock footage clips, not just those matching this specific description.`
      : 'Extract ALL usable stock footage clips from this video. Be inclusive - accept any professional-quality footage that could be useful in video production.';

    const segmentResponse = await fetch(new URL('/api/segment', request.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        videoUrl,
        filterPrompt: enhancedFilterPrompt,
        videoTitle: video.title,
        videoDescription: video.description,
        source: 'youtube',
        // Flag for maximized extraction
        maximizeClips: true,
      }),
    });

    if (!segmentResponse.ok) {
      const errorData = await segmentResponse.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Segment API error: ${segmentResponse.status}`);
    }

    const segmentResult = await segmentResponse.json();

    return NextResponse.json({
      success: true,
      jobId: segmentResult.jobId,
      message: 'Video queued for processing with maximized clip extraction',
      selectedVideo: {
        id: video.id,
        title: video.title,
        channelTitle: video.channelTitle,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount,
        url: videoUrl,
      },
      validation: {
        estimatedClipCount: validation.estimatedClipCount,
        confidence: validation.confidence,
        reasoning: validation.reasoning,
      },
      videosAnalyzed: videosToRank.length,
    });

  } catch (error) {
    console.error('[YouTube Intelligent] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Selection failed' },
      { status: 500 }
    );
  }
}
