/**
 * YouTube Shot Planner — Analyze Route
 * POST /api/admin/shot-planner/analyze
 *
 * Admin-only endpoint. Accepts a YouTube video URL (or channel URL + count),
 * fetches video metadata via the YouTube Data API, then sends the video to
 * Gemini 2.5 Flash (via OpenRouter) for a complete shot-by-shot breakdown.
 * Results are persisted in the yt_shot_plans table.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getValidGCPToken } from '@/lib/gcp/token-refresh';
import { YouTubeApi } from '@/lib/youtube/api';
import { callLLMWithKey } from '@/lib/ai/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — Gemini video analysis can be slow

// ============================================================================
// TYPES
// ============================================================================

export interface ShotPlanShot {
  shot_index: number;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  shot_type: string;
  camera_motion: string;
  subject: string;
  action: string;
  narrative_purpose: string;
  emotion_tone: string;
  visual_description: string;
  visual_elements: string[];
  narration_excerpt?: string;
  has_music: boolean;
  has_sfx: boolean;
  audio_notes?: string;
  suggested_media_type:
    | 'ai_video'
    | 'stock_video'
    | 'ai_image'
    | 'stock_image'
    | 'screen_recording'
    | 'talking_head'
    | 'motion_graphic';
  production_notes: string;
}

interface VideoTarget {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  thumbnailUrl: string;
  durationSeconds: number;
  publishedAt: string;
}

// ============================================================================
// GEMINI SHOT PLAN PROMPT
// ============================================================================

const SYSTEM_PROMPT = `You are an expert film director and post-production analyst with decades of experience in documentary, commercial, and online video production.

Your task is to perform a frame-accurate, shot-by-shot analysis of a YouTube video. You must identify EVERY distinct shot or camera position change, noting the type, motion, subject, action, narrative purpose, and how each shot would be recreated in a production environment.

You have deep expertise in:
- Shot types: ECU (extreme close-up), CU (close-up), MCU (medium close-up), MS (medium shot), MWS (medium wide shot), WS (wide shot), XWS (extreme wide shot), OTS (over the shoulder), POV, insert/cutaway, reaction shot, two-shot, establishing shot
- Camera movements: static/locked, push in, pull out, pan left/right, tilt up/down, dolly, crane/jib, handheld, gimbal stabilized, whip pan, orbit/arc, Dutch angle
- Documentary and online video production techniques
- Narrative pacing, rhythm, and visual storytelling
- Production value assessment and replication strategies
- Editorial theory: J-cuts, L-cuts, match cuts, jump cuts, parallel editing

OUTPUT RULES:
1. Return ONLY a valid JSON array. No markdown, no code fences, no prose outside the JSON.
2. Start your response with [ and end with ]
3. Capture EVERY shot change — do not skip any shot, even quick inserts (minimum 0.5 seconds)
4. Timestamps must be in seconds (decimal allowed, e.g. 45.5)
5. Be extremely specific in visual_description — write it as a detailed creative brief
6. production_notes must be a director's memo: how exactly would you recreate this shot`;

function buildUserPrompt(videoTitle: string, channelName: string): string {
  return `Analyse every single shot in this video: "${videoTitle}" by ${channelName}.

For EACH distinct shot or camera position change, produce a JSON object with this exact schema:

{
  "shot_index": 1,                        // 1-based sequential number
  "start_seconds": 0,                     // Shot start time in seconds
  "end_seconds": 4.5,                     // Shot end time in seconds  
  "duration_seconds": 4.5,               // end - start
  "shot_type": "wide establishing",       // Shot size/type (see examples below)
  "camera_motion": "static",             // Camera movement during this shot
  "subject": "Person standing at podium", // Primary subject/focus
  "action": "Speaker gestures to audience", // What is happening
  "narrative_purpose": "Establishes speaker authority and venue scale", // Why this shot exists
  "emotion_tone": "authoritative, inspiring", // Emotional register
  "visual_description": "A wide shot reveals the full conference hall. The speaker stands at a glass podium, center frame, bathed in warm spotlight. Rows of seated attendees stretch back into the soft-focus background.", // Full cinematic description
  "visual_elements": ["conference hall", "podium", "audience", "spotlight"], // Key visual elements
  "narration_excerpt": "Today we're going to talk about...", // What is being said (or empty string if music/ambient)
  "has_music": false,                    // Is background music audible?
  "has_sfx": false,                      // Are sound effects present?
  "audio_notes": "",                     // Any notable audio observations
  "suggested_media_type": "stock_video", // One of: ai_video, stock_video, ai_image, stock_image, screen_recording, talking_head, motion_graphic
  "production_notes": "Wide angle lens on a tripod. Position camera at audience eye level, approximately 20 feet from stage. Frame speaker with negative space above and show first 3 rows of audience for depth." // Director's memo to recreate
}

Shot type examples: "wide establishing", "medium talking head", "tight close-up", "extreme close-up on hands", "over-the-shoulder", "POV", "cutaway B-roll", "insert shot", "reaction shot", "two-shot", "text/graphic overlay", "screen recording"

Camera motion examples: "static/locked", "slow push in", "slow pull out", "pan left", "pan right", "tilt up", "tilt down", "slow dolly left", "handheld walk", "gimbal orbit", "whip pan transition", "crane rise"

Suggested media type guide:
- "talking_head" → presenter/interview directly addressing camera
- "stock_video" → B-roll footage, environmental shots, people in natural settings
- "ai_video" → abstract visuals, surreal imagery, generative scenes
- "ai_image" → still images with motion (Ken Burns), infographic stills
- "stock_image" → photographs, archival imagery
- "screen_recording" → software demos, UI walkthroughs
- "motion_graphic" → animated text, data visualization, lower thirds, transitions

Return ONLY the JSON array. Begin immediately with [`;
}

// ============================================================================
// CORE ANALYSIS FUNCTION
// ============================================================================

async function analyzeVideoWithGemini(
  target: VideoTarget,
  apiKey: string
): Promise<{ summary: string; shots: ShotPlanShot[] }> {
  const videoUrl = `https://www.youtube.com/watch?v=${target.videoId}`;

  console.log(`[ShotPlanner] Analyzing: "${target.title}" (${target.durationSeconds}s)`);

  const response = await callLLMWithKey(
    apiKey,
    [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'video_url' as const,
            video_url: { url: videoUrl },
          } as unknown as import('@/lib/ai/client').OpenRouterMessageContent,
          {
            type: 'text',
            text: buildUserPrompt(target.title, target.channelName),
          },
        ] as unknown as string,
      },
    ],
    {
      model: 'google/gemini-2.5-flash-preview',
      temperature: 0.2,
      maxTokens: 32000,
      xTitle: 'VidBolt Shot Planner',
    },
    'openrouter'
  );

  // Parse shot plan JSON
  let shots: ShotPlanShot[] = [];
  try {
    let content = response.content.trim();
    // Strip any accidental markdown fences
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    shots = JSON.parse(content) as ShotPlanShot[];

    // Ensure shot_index is sequential
    shots = shots.map((s, i) => ({ ...s, shot_index: i + 1 }));
  } catch (e) {
    console.error('[ShotPlanner] Failed to parse shot plan JSON:', e);
    console.error('[ShotPlanner] Raw content (first 500 chars):', response.content.substring(0, 500));
    throw new Error(`Failed to parse Gemini shot plan output. Model may have returned malformed JSON.`);
  }

  // Generate a brief summary from the first and last shots
  const summary = generateSummary(target, shots);

  console.log(`[ShotPlanner] ✓ Parsed ${shots.length} shots for "${target.title}"`);

  return { summary, shots };
}

function generateSummary(target: VideoTarget, shots: ShotPlanShot[]): string {
  const totalSec = target.durationSeconds;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  // Count media types
  const typeCounts: Record<string, number> = {};
  for (const shot of shots) {
    typeCounts[shot.suggested_media_type] = (typeCounts[shot.suggested_media_type] || 0) + 1;
  }
  const dominantType = Object.entries(typeCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'stock_video';

  // Average shot duration
  const avgShotDur = shots.length > 0
    ? Math.round((totalSec / shots.length) * 10) / 10
    : 0;

  return `${target.title} by ${target.channelName}. Duration: ${duration}. ` +
    `${shots.length} shots identified with an average shot length of ${avgShotDur}s. ` +
    `Dominant media type: ${dominantType.replace('_', ' ')}. ` +
    `Shot distribution: ${Object.entries(typeCounts).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ')}.`;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function POST(request: Request) {
  try {
    // --- Auth: admin only ---
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceSupabase = createServiceClient();
    const { data: userData } = await serviceSupabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!userData?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // --- Parse body ---
    const body = await request.json();
    const {
      mode = 'single_video',
      videoUrl,
      channelUrl,
      videoCount = 5,
      category,
      notes,
    } = body as {
      mode: 'single_video' | 'channel_batch';
      videoUrl?: string;
      channelUrl?: string;
      videoCount?: number;
      category?: string;
      notes?: string;
    };

    // --- Get OpenRouter API key ---
    const { data: apiKeys } = await serviceSupabase
      .from('user_api_keys')
      .select('openrouter_key')
      .eq('user_id', user.id)
      .single();

    if (!apiKeys?.openrouter_key) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured. Please add it in Settings → API Keys.' },
        { status: 400 }
      );
    }

    // --- Get GCP token for YouTube Data API ---
    let accessToken: string;
    try {
      accessToken = await getValidGCPToken(user.id);
    } catch {
      return NextResponse.json(
        { error: 'GCP authentication required. Please connect your Google Cloud account.', gcpRequired: true },
        { status: 401 }
      );
    }

    const youtubeApi = new YouTubeApi(accessToken);

    // --- Resolve video targets ---
    const targets: VideoTarget[] = [];
    const batchId = mode === 'channel_batch' ? crypto.randomUUID() : undefined;

    if (mode === 'single_video') {
      if (!videoUrl) {
        return NextResponse.json({ error: 'videoUrl is required for single_video mode' }, { status: 400 });
      }

      // Extract video ID from URL or treat as ID directly
      const videoId = extractVideoId(videoUrl);
      if (!videoId) {
        return NextResponse.json({ error: 'Invalid YouTube URL or video ID' }, { status: 400 });
      }

      const details = await youtubeApi.getVideoDetails(videoId);
      if (!details) {
        return NextResponse.json({ error: `Video not found: ${videoId}` }, { status: 404 });
      }

      targets.push({
        videoId: details.id,
        title: details.title,
        channelName: details.channelTitle,
        channelId: details.channelId,
        thumbnailUrl: details.thumbnailUrl,
        durationSeconds: details.durationSeconds,
        publishedAt: details.publishedAt,
      });
    } else {
      // Channel batch mode
      if (!channelUrl) {
        return NextResponse.json({ error: 'channelUrl is required for channel_batch mode' }, { status: 400 });
      }

      const clampedCount = Math.min(Math.max(1, videoCount), 25);

      // Resolve channel ID
      const channelId = await resolveChannelId(channelUrl, youtubeApi);
      if (!channelId) {
        return NextResponse.json({ error: 'Could not resolve channel. Try pasting the channel URL or @handle.' }, { status: 404 });
      }

      // Get channel info to find uploads playlist
      const channelInfo = await youtubeApi.getChannelById(channelId);
      if (!channelInfo) {
        return NextResponse.json({ error: `Channel not found: ${channelId}` }, { status: 404 });
      }

      // Fetch recent videos from uploads playlist
      const { items } = await youtubeApi.getChannelVideos(
        channelInfo.uploadsPlaylistId,
        clampedCount
      );

      if (items.length === 0) {
        return NextResponse.json({ error: 'No videos found for this channel.' }, { status: 404 });
      }

      // Fetch video details for each
      const videoIds = items.map(i => i.videoId);
      const details = await youtubeApi.getMultipleVideoDetails(videoIds);

      for (const video of details.slice(0, clampedCount)) {
        targets.push({
          videoId: video.id,
          title: video.title,
          channelName: channelInfo.title,
          channelId: channelInfo.id,
          thumbnailUrl: video.thumbnailUrl,
          durationSeconds: video.durationSeconds,
          publishedAt: video.publishedAt,
        });
      }
    }

    if (targets.length === 0) {
      return NextResponse.json({ error: 'No video targets could be resolved.' }, { status: 400 });
    }

    // --- Analyze each video sequentially ---
    const createdIds: string[] = [];
    const errors: { videoId: string; error: string }[] = [];

    for (const target of targets) {
      try {
        const { summary, shots } = await analyzeVideoWithGemini(target, apiKeys.openrouter_key);

        // Check for existing plan for this video to avoid duplicates
        const { data: existing } = await serviceSupabase
          .from('yt_shot_plans')
          .select('id')
          .eq('youtube_video_id', target.videoId)
          .single();

        if (existing) {
          // Update instead of insert
          await serviceSupabase
            .from('yt_shot_plans')
            .update({
              summary,
              shot_plan: shots,
              total_shots: shots.length,
              category: category || null,
              notes: notes || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          createdIds.push(existing.id);
        } else {
          const { data: inserted, error: insertError } = await serviceSupabase
            .from('yt_shot_plans')
            .insert({
              youtube_video_id: target.videoId,
              youtube_url: `https://www.youtube.com/watch?v=${target.videoId}`,
              video_title: target.title,
              channel_name: target.channelName,
              channel_id: target.channelId,
              thumbnail_url: target.thumbnailUrl,
              duration_seconds: target.durationSeconds,
              published_at: target.publishedAt,
              summary,
              shot_plan: shots,
              total_shots: shots.length,
              category: category || null,
              notes: notes || null,
              source_type: mode === 'channel_batch' ? 'channel_batch' : 'single',
              batch_id: batchId || null,
              created_by: user.id,
            })
            .select('id')
            .single();

          if (insertError) {
            throw new Error(`Database insert failed: ${insertError.message}`);
          }

          createdIds.push(inserted!.id);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[ShotPlanner] Error analyzing ${target.videoId}:`, msg);
        errors.push({ videoId: target.videoId, error: msg });
      }
    }

    return NextResponse.json({
      success: true,
      createdIds,
      totalAnalyzed: createdIds.length,
      totalFailed: errors.length,
      batchId: batchId || null,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[ShotPlanner Analyze] Unhandled error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function extractVideoId(input: string): string | null {
  // Handle full URLs
  try {
    const url = new URL(input);
    if (url.hostname.includes('youtube.com')) {
      return url.searchParams.get('v');
    }
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1).split('?')[0];
    }
  } catch {
    // Not a URL — treat as bare video ID
  }
  // Validate bare ID (11 chars, alphanumeric + - _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }
  return null;
}

async function resolveChannelId(input: string, api: YouTubeApi): Promise<string | null> {
  const trimmed = input.trim();

  // Handle direct channel ID (UCxxxxxxxx)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle @handle or full URL
  let query = trimmed;
  try {
    const url = new URL(trimmed);
    // Extract from /channel/UCxxxxxx
    const channelMatch = url.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (channelMatch) return channelMatch[1];
    // Extract handle: /@handle or /c/name
    const handleMatch = url.pathname.match(/\/@?([^/]+)/);
    if (handleMatch) query = handleMatch[1];
  } catch {
    // Not a URL — use as-is (could be @handle or name)
    query = trimmed.replace(/^@/, '');
  }

  // Search for channel by name/handle
  const results = await api.searchChannels(query, 1);
  return results[0]?.channelId ?? null;
}
