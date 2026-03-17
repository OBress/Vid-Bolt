/**
 * TTS Generate API Route
 * ============================================================================
 * POST /api/tts/generate — Generates speech from text using Inworld TTS.
 * Uploads result to R2 and returns a playable URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { generateSpeech, isInworldConfigured } from '@/lib/services/inworld-tts';

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { text, voiceId, modelId, speakingRate, temperature } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (text.length > 10000) {
      return NextResponse.json({ error: 'Text too long (max 10,000 characters)' }, { status: 400 });
    }

    // Check if Inworld is configured
    const isConfigured = await isInworldConfigured(user.id);
    if (!isConfigured) {
      return NextResponse.json(
        { error: 'Inworld TTS API key not configured', code: 'NO_API_KEY' },
        { status: 403 }
      );
    }

    // Generate speech
    const result = await generateSpeech(user.id, text.trim(), {
      voiceId: voiceId || 'Hades',
      modelId: modelId || 'inworld-tts-1.5-max',
      speakingRate: speakingRate ?? 1.0,
      temperature: temperature ?? 1.0,
    });

    // Upload to R2
    const { uploadAudioBuffer, generateTtsKey, isR2Configured } = await import('@/lib/services/r2-storage');

    if (!isR2Configured()) {
      // Return as base64 data URL if R2 is not configured
      const base64 = result.audioBuffer.toString('base64');
      return NextResponse.json({
        url: `data:${result.mimeType};base64,${base64}`,
        duration: result.durationSeconds,
        mimeType: result.mimeType,
        wordTimestamps: result.wordTimestamps,
      });
    }

    const key = generateTtsKey(user.id, `editor-${Date.now()}`, 0);
    const uploadResult = await uploadAudioBuffer(result.audioBuffer, key, result.mimeType);

    return NextResponse.json({
      url: uploadResult.url,
      duration: result.durationSeconds,
      mimeType: result.mimeType,
      wordTimestamps: result.wordTimestamps,
    });
  } catch (error) {
    console.error('[TTS Generate] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate speech',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
