import { createClient } from '@/lib/supabase/server';

/**
 * Verifies if the request is authenticated via Internal API Secret or Supabase Session.
 *
 * @returns true if authenticated, false otherwise.
 */
export async function verifySessionOrSecret(request: Request): Promise<boolean> {
  // 1. Check Internal API Secret
  const secretHeader = request.headers.get('X-Worker-Secret');
  const internalSecret = process.env.INTERNAL_API_SECRET;

  // Ideally use constant-time comparison if possible, but strict equality is acceptable for this level
  if (internalSecret && secretHeader === internalSecret) {
    return true;
  }

  // 2. Check Supabase Session
  // Note: createClient uses cookies() from next/headers which works in Route Handlers
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return false;
  }

  return true;
}

/**
 * Strictly verifies Internal API Secret (for worker-only routes).
 */
export function verifyInternalApiSecret(request: Request): boolean {
  const secretHeader = request.headers.get('X-Worker-Secret');
  const internalSecret = process.env.INTERNAL_API_SECRET;

  return !!(internalSecret && secretHeader === internalSecret);
}
