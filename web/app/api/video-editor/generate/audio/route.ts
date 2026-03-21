/**
 * Audio Generation API Route
 * ============================================================================
 * POST /api/video-editor/generate/audio
 *
 * Generates instrumental music via the local GPU API (ACE-Step 1.5).
 * Uses presigned R2 URLs for output storage and webhook-based async completion.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  callGpuMusicGenerate,
  type MusicGenerateRequest,
} from '@/lib/services/gpu-api-service';
import {
  generatePresignedPutUrl,
  getPublicUrl,
} from '@/lib/services/r2-storage';
import { waitForWebhookResult } from '@/lib/queues/webhook-listener';
import { v4 as uuidv4 } from 'uuid';
import { normalizeAudioFromR2 } from '@/lib/services/audio-normalizer';

const getWebhookUrl = () =>
  process.env.WEBHOOK_CALLBACK_URL || 'http://localhost:3000/api/gpu-callback';
const getWebhookSecret = () => process.env.GPU_WEBHOOK_SECRET;

// 10 minute timeout for music generation (can be slow for long durations)
const MUSIC_WEBHOOK_TIMEOUT_MS = 600_000;

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request
    const body = await request.json();
    const {
      prompt,
      lyrics,
      durationSeconds,
      seed,
      bpm,
      keyScale,
    } = body as {
      prompt: string;
      lyrics?: string;
      durationSeconds?: number;
      seed?: number | null;
      bpm?: number;
      keyScale?: string;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 3. Generate presigned R2 URL for output
    const jobId = `editor-audio-${uuidv4().slice(0, 8)}`;
    const itemId = `editor-music-${uuidv4().slice(0, 8)}`;
    const r2Key = `editor-gen/${user.id}/${jobId}.wav`;
    const { putUrl } = await generatePresignedPutUrl(r2Key, 'audio/wav');
    const publicUrl = getPublicUrl(r2Key);

    // 4. Build GPU API request
    const gpuRequest: MusicGenerateRequest = {
      job_id: jobId,
      prompt: prompt.trim(),
      lyrics: lyrics || '[Instrumental]',
      duration_seconds: Math.max(10, Math.min(180, durationSeconds ?? 60)),
      seed: seed ?? undefined,
      bpm: bpm ?? 100,
      key_scale: keyScale ?? 'C Major',
      time_signature: '4',
      vocal_language: 'unknown', // Instrumental
      save_url: putUrl,
      webhook_url: getWebhookUrl(),
      item_id: itemId,
      webhook_secret: getWebhookSecret(),
    };

    // 5. Call GPU API
    const result = await callGpuMusicGenerate(gpuRequest);

    if (!result.success && !result.isAsync) {
      return NextResponse.json(
        { error: result.errorMessage || 'GPU music generation failed' },
        { status: 502 }
      );
    }

    // 6. Wait for webhook completion (async generation)
    if (result.isAsync || result.success) {
      try {
        const webhookResult = await waitForWebhookResult(itemId, MUSIC_WEBHOOK_TIMEOUT_MS);
        if (webhookResult.status !== 'completed') {
          return NextResponse.json(
            { error: webhookResult.errorMessage || 'Music generation failed during processing' },
            { status: 502 }
          );
        }
      } catch (_err) {
        return NextResponse.json(
          { error: 'Music generation timed out — try a shorter duration' },
          { status: 504 }
        );
      }
    }

    const normalized = await normalizeAudioFromR2(publicUrl, r2Key, {
      inputFormat: 'wav',
      outputFormat: 'wav',
    });
    const normalizationCompleted =
      normalized.normalized || normalized.skipReason === 'Already within tolerance';

    if (!normalizationCompleted) {
      return NextResponse.json(
        {
          error:
            normalized.skipReason ||
            'Music generation succeeded but audio normalization failed',
        },
        { status: 500 }
      );
    }

    // 7. Return the public URL
    return NextResponse.json({
      url: publicUrl,
      jobId,
      generationTime: result.generationTime,
      durationSeconds: gpuRequest.duration_seconds,
      audioNormalizationStatus: 'completed',
      normalizedAudioUrl: publicUrl,
      originalLufs: normalized.originalLufs,
      normalizedLufs: normalized.normalizedLufs,
      truePeakDbtp: normalized.originalTruePeak,
    });
  } catch (error) {
    console.error('[generate/audio] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
