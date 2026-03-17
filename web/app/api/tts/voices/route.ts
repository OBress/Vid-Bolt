/**
 * TTS Voices API Route
 * ============================================================================
 * GET /api/tts/voices — Returns available Inworld TTS voices for the current user.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { listVoices, INWORLD_VOICES } from '@/lib/services/inworld-tts';

export async function GET() {
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
    const voices = await listVoices(user.id);

    // If API returns no voices, fall back to hardcoded presets
    if (voices.length === 0) {
      const fallbackVoices = Object.values(INWORLD_VOICES).map(name => ({
        voiceId: name,
        displayName: name,
        languages: ['en'],
        tags: [],
        isCustom: false,
      }));
      return NextResponse.json({ voices: fallbackVoices, source: 'fallback' });
    }

    return NextResponse.json({ voices, source: 'api' });
  } catch (error) {
    console.error('[TTS Voices] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voices', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
