/**
 * Assemble Edit API Route
 * ============================================================================
 * POST /api/videos/[videoId]/assemble-edit
 *
 * Triggers AI-driven edit assembly for a video project. Reads project data
 * from Supabase, calls the EditAssemblyService, and returns the EDL.
 * Called automatically when transitioning from Step 6 → Step 7.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { assembleEdit } from '@/lib/services/edit-assembly/edit-assembly-service';

// Allow up to 2 minutes for EDL generation
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;

    if (!videoId) {
      return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
    }

    // 1. Authenticate
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

    // 2. Get API key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: apiKeyData } = await supabase
      .from('user_api_keys')
      .select('openrouter_key, openrouter_model')
      .eq('user_id', user.id)
      .single();

    const apiKey = apiKeyData?.openrouter_key;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 400 });
    }

    // 3. Fetch video project data
    const { data: project, error: projectError } = await supabase
      .from('video_projects')
      .select('id, user_id, title, metadata')
      .eq('id', videoId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Video project not found' }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse metadata — data comes from JSON so we cast through unknown
    const metadata = (project.metadata || {}) as Record<string, unknown>;
    const avScriptPart1 = (metadata.av_script_part1 || {}) as Record<string, unknown>;
    const shots = (avScriptPart1.shots || []) as unknown as Parameters<typeof assembleEdit>[0]['shots'];
    const generatedMedia = (metadata.generatedMedia || []) as unknown as Parameters<typeof assembleEdit>[0]['generatedMedia'];
    const audioChunks = (metadata.audio_chunks || []) as unknown as Parameters<typeof assembleEdit>[0]['audioChunks'];
    const scriptText = (metadata.raw_script as string) || '';

    if (shots.length === 0) {
      return NextResponse.json({ error: 'No shots found in project' }, { status: 400 });
    }

    console.log(`[AssembleEdit] Starting for project ${videoId} (${shots.length} shots)`);

    // 4. Call edit assembly service
    const result = await assembleEdit({
      videoId,
      shots,
      generatedMedia,
      videoTitle: project.title || 'Untitled',
      audioChunks,
      scriptText,
      fps: 30,
      apiKey,
      model: apiKeyData?.openrouter_model || 'google/gemini-2.5-flash-preview',
    });

    if (!result.success) {
      console.error(`[AssembleEdit] Failed:`, result.error);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 422 }
      );
    }

    // 5. Store EDL in project metadata
    const updatedMetadata = {
      ...metadata,
      edl: result.edl,
      edl_generated_at: new Date().toISOString(),
    };

    await supabase
      .from('video_projects')
      .update({ metadata: updatedMetadata })
      .eq('id', videoId);

    console.log(`[AssembleEdit] EDL stored for project ${videoId}`);

    return NextResponse.json({
      success: true,
      edl: result.edl,
    });
  } catch (error) {
    console.error('[AssembleEdit] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
