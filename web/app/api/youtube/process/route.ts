import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Process a YouTube video for ingestion into the stock media library.
 * 
 * This route delegates to the existing segmentation pipeline which:
 * 1. Downloads the video via yt-dlp
 * 2. Transcribes and analyzes with Gemini
 * 3. Extracts clips
 * 4. Stores in R2 and indexes in vector DB
 */
export async function POST(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { videoId, videoUrl, title, channelTitle, filterPrompt } = body;

    if (!videoId && !videoUrl) {
      return NextResponse.json(
        { error: 'Either videoId or videoUrl is required' },
        { status: 400 }
      );
    }

    // Construct YouTube URL if only ID provided
    const url = videoUrl || `https://www.youtube.com/watch?v=${videoId}`;

    console.log(`[YouTube Process] Processing video: ${url}`);
    console.log(`[YouTube Process] Title: ${title || 'Unknown'}`);
    console.log(`[YouTube Process] Channel: ${channelTitle || 'Unknown'}`);
    if (filterPrompt) {
      console.log(`[YouTube Process] Filter prompt: ${filterPrompt}`);
    }

    // Call the existing segment API to queue the video for processing
    // This reuses the full segmentation pipeline (yt-dlp, transcription, Gemini analysis, clip extraction)
    const segmentResponse = await fetch(new URL('/api/segment', request.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward auth cookies
        Cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        videoUrl: url,
        filterPrompt: filterPrompt || undefined,
        // Pass metadata to help with contextual grounding
        videoTitle: title,
        videoDescription: `Video from YouTube channel: ${channelTitle || 'Unknown'}`,
        source: 'youtube', // Flag source for tracking
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
      message: 'Video queued for processing',
      videoUrl: url,
    });
  } catch (error) {
    console.error('[YouTube Process] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
