/**
 * YouTube OAuth Verify Setup
 * POST — Validates that a user's per-user OAuth credentials are correctly configured.
 *
 * Checks:
 *   1. Client ID format (.apps.googleusercontent.com)
 *   2. Client credentials are valid (via Google's token endpoint)
 *
 * Note: Publishing status cannot be checked server-side. If the app is still
 * in Testing mode, the user will see a clear error when they try to connect.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceSupabase = createServiceClient();

  // Get user's OAuth config
  const { data: config } = await serviceSupabase
    .from('user_gcp_config')
    .select('youtube_oauth_client_id, youtube_oauth_client_secret')
    .eq('user_id', user.id)
    .single();

  if (!config?.youtube_oauth_client_id || !config?.youtube_oauth_client_secret) {
    return NextResponse.json({
      error: 'Please enter your OAuth Client ID and Client Secret first.',
      results: {
        credentials: { valid: false, error: 'Not configured' },
        allPassing: false,
      },
    }, { status: 400 });
  }

  const results = {
    credentials: { valid: false, error: '' },
    allPassing: false,
  };

  // 1. Validate Client ID format
  if (!config.youtube_oauth_client_id.endsWith('.apps.googleusercontent.com')) {
    results.credentials.error = 'Client ID should end with .apps.googleusercontent.com';
    return NextResponse.json({ results });
  }

  // 2. Validate credentials are real by calling Google's token endpoint.
  //    A request with valid client_id + client_secret returns "invalid_grant" (dummy code is bad).
  //    An invalid client returns "invalid_client".
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.youtube_oauth_client_id,
        client_secret: config.youtube_oauth_client_secret,
        grant_type: 'authorization_code',
        code: 'dummy_code_for_validation',
        redirect_uri: 'https://studio.vidbolt.app/api/youtube/oauth/callback',
      }),
    });

    const tokenData = await tokenRes.json();
    console.log(`[YouTube Verify] Token endpoint response: ${tokenData.error} — ${tokenData.error === 'invalid_grant' ? 'credentials VALID' : 'credentials INVALID'}`);

    if (tokenData.error === 'invalid_client') {
      results.credentials.error = 'Invalid Client ID or Client Secret';
      return NextResponse.json({ results });
    }

    if (tokenData.error === 'redirect_uri_mismatch') {
      results.credentials.error = 'Redirect URI not configured — add https://studio.vidbolt.app/api/youtube/oauth/callback to your OAuth client';
      return NextResponse.json({ results });
    }

    // "invalid_grant" means credentials are valid (just the dummy code is bad, as expected)
    results.credentials.valid = true;
  } catch (e: any) {
    console.error('[YouTube Verify] Credential check failed:', e.message);
    results.credentials.error = 'Failed to validate credentials';
    return NextResponse.json({ results });
  }

  results.allPassing = results.credentials.valid;

  // Store verification status
  if (results.allPassing) {
    await serviceSupabase
      .from('user_gcp_config')
      .update({ youtube_oauth_verified: true, updated_at: new Date().toISOString() } as any)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ results });
}
