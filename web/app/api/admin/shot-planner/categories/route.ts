/**
 * YouTube Shot Planner — Categories Route
 * GET /api/admin/shot-planner/categories
 *
 * Returns distinct category values for filter UI.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET() {
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

    // Fetch distinct non-null categories with count
    const { data, error } = await serviceSupabase
      .from('yt_shot_plans')
      .select('category')
      .not('category', 'is', null)
      .order('category');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate counts client-side (Supabase doesn't support GROUP BY directly)
    const countMap: Record<string, number> = {};
    for (const row of data ?? []) {
      if (row.category) {
        countMap[row.category] = (countMap[row.category] || 0) + 1;
      }
    }

    const categories = Object.entries(countMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('[ShotPlanner Categories] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
