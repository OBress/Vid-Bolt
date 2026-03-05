import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/utils/admin-auth';
import { isGpuLockHeld, forceReleaseGpuLock } from '@/lib/queues/gpu-lock';

/**
 * Dev endpoint: Inspect or force-clear a stuck GPU lock.
 * 
 * GET ?userId=xxx  → Check lock status
 * POST { userId }  → Force-release lock
 * 
 * SECURITY: Admin-only endpoint.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId query param' }, { status: 400 });
  }

  const lockStatus = await isGpuLockHeld(userId);
  return NextResponse.json({ success: true, data: lockStatus });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId in body' }, { status: 400 });
  }

  const released = await forceReleaseGpuLock(userId);
  return NextResponse.json({ 
    success: true, 
    data: { released, message: released ? 'Lock cleared' : 'No lock was held' } 
  });
}
