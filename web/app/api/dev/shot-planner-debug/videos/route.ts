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

  // Admin check — is_admin lives on the 'users' table, not 'profiles'
  const { data: profile } = await supabaseService
    .from('users')
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

  // Fetch video projects for this channel belonging to this user.
  // NOTE: the FK column linking video_projects to media_projects is `project_id`,
  // not `media_project_id`. The display name column is `name`, not `title`.
  console.log(`[ShotPlannerDebug/videos] Fetching videos for user=${user.id} projectId=${projectId}`);

  const { data: videos, error } = await supabaseService
    .from('video_projects')
    .select('id, name, metadata')
    .eq('user_id', user.id)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error(`[ShotPlannerDebug/videos] Supabase error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[ShotPlannerDebug/videos] Found ${videos?.length ?? 0} raw video project(s)`);

  const result = (videos || []).map((v: { id: string; name: string; metadata: Record<string, unknown> }) => {
    const hasTimestamps = Array.isArray(v.metadata?.word_timestamps) && (v.metadata.word_timestamps as unknown[]).length > 0;
    console.log(`[ShotPlannerDebug/videos]  • ${v.id} "${v.name}" hasTimestamps=${hasTimestamps}`);
    return {
      id: v.id,
      title: v.name || 'Untitled Video',
      hasTimestamps,
    };
  });

  return NextResponse.json({ videos: result });
}
