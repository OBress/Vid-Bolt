/**
 * YouTube Shot Planner — Plan Detail Route
 * GET   /api/admin/shot-planner/plans/[id]  — Full plan with shot_plan JSONB
 * PATCH /api/admin/shot-planner/plans/[id]  — Update category / notes
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

async function getAdminUser() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const serviceSupabase = createServiceClient();
  const { data: userData } = await serviceSupabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return userData?.is_admin ? user : null;
}

// ============================================================================
// GET — Full plan detail (includes shot_plan JSONB)
// ============================================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAdminUser();
    if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const serviceSupabase = createServiceClient();

    const { data: plan, error } = await serviceSupabase
      .from('yt_shot_plans')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('[ShotPlanner Detail GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch plan' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH — Update category / notes
// ============================================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAdminUser();
    if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const { category, notes } = body as { category?: string; notes?: string };

    const updateData: Record<string, string | null> = {};
    if (category !== undefined) updateData.category = category || null;
    if (notes !== undefined) updateData.notes = notes || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();
    const { data: plan, error } = await serviceSupabase
      .from('yt_shot_plans')
      .update(updateData)
      .eq('id', id)
      .select('id, category, notes, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error('[ShotPlanner Detail PATCH] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}
