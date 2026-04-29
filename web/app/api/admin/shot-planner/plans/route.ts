/**
 * YouTube Shot Planner — Plans List Route
 * GET  /api/admin/shot-planner/plans  — List plans with filters
 * DELETE /api/admin/shot-planner/plans  — Delete a plan by ID (pass ?id=xxx)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET — List plans
// ============================================================================

export async function GET(request: Request) {
  try {
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

    const { searchParams } = new URL(request.url);
    const category   = searchParams.get('category');
    const channelId  = searchParams.get('channel_id');
    const search     = searchParams.get('search');
    const batchId    = searchParams.get('batch_id');
    const limit      = parseInt(searchParams.get('limit') || '50', 10);
    const offset     = parseInt(searchParams.get('offset') || '0', 10);

    // Build query — exclude shot_plan (large JSONB) from list view for performance
    let query = serviceSupabase
      .from('yt_shot_plans')
      .select(
        'id, created_at, youtube_video_id, youtube_url, video_title, channel_name, channel_id, thumbnail_url, duration_seconds, published_at, summary, total_shots, analysis_model, category, notes, source_type, batch_id'
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category)   query = query.eq('category', category);
    if (channelId)  query = query.eq('channel_id', channelId);
    if (batchId)    query = query.eq('batch_id', batchId);
    if (search) {
      query = query.or(
        `video_title.ilike.%${search}%,channel_name.ilike.%${search}%,summary.ilike.%${search}%`
      );
    }

    const { data: plans, error, count } = await query;

    if (error) {
      console.error('[ShotPlanner Plans] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ plans: plans ?? [], total: count ?? plans?.length ?? 0 });
  } catch (error) {
    console.error('[ShotPlanner Plans GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch plans' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE — Remove a plan
// ============================================================================

export async function DELETE(request: Request) {
  try {
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id query parameter required' }, { status: 400 });
    }

    const { error } = await serviceSupabase
      .from('yt_shot_plans')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('[ShotPlanner Plans DELETE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
