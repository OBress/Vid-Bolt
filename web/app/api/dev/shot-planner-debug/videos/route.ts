/**
 * GET /api/dev/shot-planner-debug/videos?projectId=<media_project_id>
 * ============================================================================
 * Returns video projects for a given media_project (channel) that have
 * completed word_timestamps in their metadata (audio/TTS done).
 *
 * Used by the ShotPlannerDebugger to populate the "Import from video" dropdown.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Admin check
  const { data: profile } = await supabaseService
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  // Fetch video projects for this channel belonging to this user
  const { data: videos, error } = await supabaseService
    .from('video_projects')
    .select('id, title, metadata')
    .eq('user_id', user.id)
    .eq('media_project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (videos || []).map((v: { id: string; title: string; metadata: Record<string, unknown> }) => ({
    id: v.id,
    title: v.title || 'Untitled Video',
    hasTimestamps: Array.isArray(v.metadata?.word_timestamps) && v.metadata.word_timestamps.length > 0,
  }));

  return NextResponse.json({ videos: result });
}
