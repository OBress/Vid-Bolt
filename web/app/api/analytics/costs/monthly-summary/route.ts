/**
 * Monthly Cost Summary API
 * ============================================================================
 * Returns a lightweight monthly aggregate for the authenticated user.
 * Used by the Payments page to auto-populate monthly cost line items.
 *
 * Query params:
 *   ?month=2026-04-01   (ISO date, first day of target month)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { CATEGORY_LABELS, type CostCategory } from '@/lib/costs/pricing';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get('month');

  let monthStart: Date;
  let monthEnd: Date;

  if (monthParam) {
    monthStart = new Date(monthParam);
    monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  } else {
    // Default to current month
    const now = new Date();
    monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: events, error } = await serviceClient
    .from('cost_events')
    .select('category, amount_usd')
    .eq('user_id', user.id)
    .gte('occurred_at', monthStart.toISOString())
    .lt('occurred_at', monthEnd.toISOString());

  if (error) {
    console.error('[API /analytics/costs/monthly-summary]', error.message);
    return NextResponse.json({ error: 'Failed to fetch cost events' }, { status: 500 });
  }

  // Aggregate by category
  const breakdown: Record<string, number> = {};
  let totalCostUsd = 0;
  for (const ev of events || []) {
    const amt = Number(ev.amount_usd);
    breakdown[ev.category] = (breakdown[ev.category] || 0) + amt;
    totalCostUsd += amt;
  }

  // Build line items for payment import
  const asLineItems = (Object.entries(breakdown) as [CostCategory, number][])
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amountUsd]) => ({
      key: category,
      name: `${CATEGORY_LABELS[category] ?? category} (Auto-tracked)`,
      amountUsd,
    }));

  return NextResponse.json({
    month: monthStart.toISOString().slice(0, 7),
    totalCostUsd,
    breakdown,
    asLineItems,
  });
}
