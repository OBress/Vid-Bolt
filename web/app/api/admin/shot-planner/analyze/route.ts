/**
 * YouTube Shot Planner — Analyze Route
 * POST /api/admin/shot-planner/analyze
 *
 * Admin-only endpoint. Accepts a YouTube video URL (or channel URL + count),
 * sends the URL(s) directly to Gemini 2.5 Flash (via OpenRouter) for shot-by-shot
 * analysis. Gemini natively reads YouTube videos — no YouTube Data API needed.
 * Results are persisted in the yt_shot_plans table.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
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

interface VideoMetadata {
  video_id: string;
  video_title: string;
  channel_name: string;
  channel_id: string;
  thumbnail_url: string;
  duration_seconds: number;
  published_at: string; // ISO date string or empty if unknown
}

interface GeminiResponse {
  metadata: VideoMetadata;
  shots: ShotPlanShot[];
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
1. Return ONLY a valid JSON object. No markdown, no code fences, no prose outside the JSON.
2. The root object must have exactly two keys: "metadata" and "shots".
3. Capture EVERY shot change — do not skip any shot, even quick inserts (minimum 0.5 seconds)
4. Timestamps must be in seconds (decimal allowed, e.g. 45.5)
5. Be extremely specific in visual_description — write it as a detailed creative brief
6. production_notes must be a director's memo: how exactly would you recreate this shot`;

function buildUserPrompt(): string {
  return `Analyse every single shot in this video.

Return a JSON object with this exact top-level structure:
{
  "metadata": {
    "video_id": "extracted from URL (11-char YouTube ID)",
    "video_title": "Full title of the video exactly as shown on YouTube",
    "channel_name": "Channel/creator name exactly as shown",
    "channel_id": "YouTube channel ID (UCxxxxxxxx) if visible in page, else empty string",
    "thumbnail_url": "https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
    "duration_seconds": 0,
    "published_at": "YYYY-MM-DD or empty string if not visible"
  },
  "shots": [
    {
      "shot_index": 1,
      "start_seconds": 0,
      "end_seconds": 4.5,
      "duration_seconds": 4.5,
      "shot_type": "wide establishing",
      "camera_motion": "static",
      "subject": "Person standing at podium",
      "action": "Speaker gestures to audience",
      "narrative_purpose": "Establishes speaker authority and venue scale",
      "emotion_tone": "authoritative, inspiring",
      "visual_description": "A wide shot reveals the full conference hall...",
      "visual_elements": ["conference hall", "podium", "audience", "spotlight"],
      "narration_excerpt": "Today we're going to talk about...",
      "has_music": false,
      "has_sfx": false,
      "audio_notes": "",
      "suggested_media_type": "stock_video",
      "production_notes": "Wide angle lens on a tripod. Position camera at audience eye level..."
    }
  ]
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

Return ONLY the JSON object. Begin immediately with {`;
}

// ============================================================================
// CORE ANALYSIS FUNCTION
// ============================================================================

async function analyzeVideoWithGemini(
  videoUrl: string,
  apiKey: string
): Promise<GeminiResponse> {
  console.log(`[ShotPlanner] Analyzing: ${videoUrl}`);

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
            text: buildUserPrompt(),
          },
        ] as unknown as string,
      },
    ],
    {
      model: 'google/gemini-3-flash-preview',
      temperature: 0.2,
      maxTokens: 32000,
      xTitle: 'VidBolt Shot Planner',
    },
    'openrouter'
  );

  // Parse the combined metadata + shots JSON
  let parsed: GeminiResponse;
  try {
    let content = response.content.trim();
    // Strip any accidental markdown fences
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    parsed = JSON.parse(content) as GeminiResponse;

    // Normalise shot indexes
    parsed.shots = parsed.shots.map((s, i) => ({ ...s, shot_index: i + 1 }));
  } catch (e) {
    console.error('[ShotPlanner] Failed to parse Gemini output:', e);
    console.error('[ShotPlanner] Raw content (first 500 chars):', response.content.substring(0, 500));
    throw new Error(`Failed to parse Gemini output. Model may have returned malformed JSON.`);
  }

  console.log(
    `[ShotPlanner] ✓ "${parsed.metadata.video_title}" by ${parsed.metadata.channel_name} — ${parsed.shots.length} shots`
  );

  return parsed;
}

function generateSummary(meta: VideoMetadata, shots: ShotPlanShot[]): string {
  const mins = Math.floor(meta.duration_seconds / 60);
  const secs = meta.duration_seconds % 60;
  const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const typeCounts: Record<string, number> = {};
  for (const shot of shots) {
    typeCounts[shot.suggested_media_type] = (typeCounts[shot.suggested_media_type] || 0) + 1;
  }
  const dominantType = Object.entries(typeCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'stock_video';
  const avgShotDur = shots.length > 0 ? Math.round((meta.duration_seconds / shots.length) * 10) / 10 : 0;

  return (
    `${meta.video_title} by ${meta.channel_name}. Duration: ${duration}. ` +
    `${shots.length} shots identified with an average shot length of ${avgShotDur}s. ` +
    `Dominant media type: ${dominantType.replace('_', ' ')}. ` +
    `Shot distribution: ${Object.entries(typeCounts).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ')}.`
  );
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

    // --- Collect YouTube URLs to analyze ---
    const videoUrls: string[] = [];
    const batchId = mode === 'channel_batch' ? crypto.randomUUID() : undefined;

    if (mode === 'single_video') {
      if (!videoUrl) {
        return NextResponse.json({ error: 'videoUrl is required for single_video mode' }, { status: 400 });
      }
      const id = extractVideoId(videoUrl);
      if (!id) {
        return NextResponse.json({ error: 'Invalid YouTube URL or video ID' }, { status: 400 });
      }
      videoUrls.push(`https://www.youtube.com/watch?v=${id}`);
    } else {
      // Channel batch mode: build URLs from channel page
      if (!channelUrl) {
        return NextResponse.json({ error: 'channelUrl is required for channel_batch mode' }, { status: 400 });
      }
      const clampedCount = Math.min(Math.max(1, videoCount), 25);

      // Ask Gemini to list the most recent N video URLs from the channel
      const channelVideoUrls = await resolveChannelVideosViaGemini(
        channelUrl.trim(),
        clampedCount,
        apiKeys.openrouter_key
      );

      if (channelVideoUrls.length === 0) {
        return NextResponse.json(
          { error: 'Could not retrieve videos from that channel. Try pasting a direct video URL instead.' },
          { status: 404 }
        );
      }
      videoUrls.push(...channelVideoUrls);
    }

    if (videoUrls.length === 0) {
      return NextResponse.json({ error: 'No video targets could be resolved.' }, { status: 400 });
    }

    // --- Analyze each video sequentially ---
    const createdIds: string[] = [];
    const errors: { videoId: string; error: string }[] = [];

    for (const url of videoUrls) {
      const videoId = extractVideoId(url) ?? url;
      try {
        const { metadata, shots } = await analyzeVideoWithGemini(url, apiKeys.openrouter_key);
        const summary = generateSummary(metadata, shots);

        // Upsert: update if video already analyzed, insert otherwise
        const { data: existing } = await serviceSupabase
          .from('yt_shot_plans')
          .select('id')
          .eq('youtube_video_id', metadata.video_id || videoId)
          .single();

        if (existing) {
          await serviceSupabase
            .from('yt_shot_plans')
            .update({
              summary,
              shot_plan: shots,
              total_shots: shots.length,
              category: category || null,
              notes: notes || null,
              video_title: metadata.video_title,
              channel_name: metadata.channel_name,
              thumbnail_url: metadata.thumbnail_url || null,
              duration_seconds: metadata.duration_seconds || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          createdIds.push(existing.id);
        } else {
          const { data: inserted, error: insertError } = await serviceSupabase
            .from('yt_shot_plans')
            .insert({
              youtube_video_id: metadata.video_id || videoId,
              youtube_url: url,
              video_title: metadata.video_title,
              channel_name: metadata.channel_name,
              channel_id: metadata.channel_id || null,
              thumbnail_url: metadata.thumbnail_url || null,
              duration_seconds: metadata.duration_seconds || null,
              published_at: metadata.published_at || null,
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
        console.error(`[ShotPlanner] Error analyzing ${videoId}:`, msg);
        errors.push({ videoId, error: msg });
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
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }
  return null;
}

/**
 * Ask Gemini to list the most recent N video URLs from a channel page.
 * Returns an array of youtube.com/watch?v= URLs.
 */
async function resolveChannelVideosViaGemini(
  channelUrl: string,
  count: number,
  apiKey: string
): Promise<string[]> {
  // Normalise channel URL
  let normalised = channelUrl;
  if (!normalised.startsWith('http')) {
    // Handle @handle or bare name
    const handle = normalised.replace(/^@/, '');
    normalised = `https://www.youtube.com/@${handle}`;
  }

  console.log(`[ShotPlanner] Resolving ${count} videos from channel: ${normalised}`);

  const response = await callLLMWithKey(
    apiKey,
    [
      {
        role: 'user',
        content: [
          {
            type: 'video_url' as const,
            video_url: { url: normalised },
          } as unknown as import('@/lib/ai/client').OpenRouterMessageContent,
          {
            type: 'text',
            text: `List the ${count} most recent video URLs from this YouTube channel page.
Return ONLY a JSON array of strings (full youtube.com/watch?v= URLs). No markdown, no prose.
Example: ["https://www.youtube.com/watch?v=abc123", "https://www.youtube.com/watch?v=def456"]
Begin immediately with [`,
          },
        ] as unknown as string,
      },
    ],
    {
      model: 'google/gemini-3-flash-preview',
      temperature: 0,
      maxTokens: 2000,
      xTitle: 'VidBolt Channel Resolver',
    },
    'openrouter'
  );

  try {
    let content = response.content.trim();
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    const urls = JSON.parse(content) as string[];
    return urls
      .filter((u) => typeof u === 'string' && u.includes('youtube.com/watch'))
      .slice(0, count);
  } catch {
    console.error('[ShotPlanner] Failed to parse channel video list from Gemini');
    return [];
  }
}
