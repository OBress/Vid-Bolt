/**
 * YouTube OAuth Authorize (Per-User Credentials)
 * 
 * Initiates Google OAuth using the USER'S OWN OAuth client credentials.
 * This is separate from the GCP OAuth flow which uses the platform's global credentials.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getPublicOrigin } from '@/lib/utils/get-public-origin';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export async function GET(request: Request) {
  const origin = getPublicOrigin(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Get user's per-user OAuth credentials
  const serviceSupabase = createServiceClient();
  const { data: config } = await serviceSupabase
    .from('user_gcp_config')
    .select('youtube_oauth_client_id, youtube_oauth_verified')
    .eq('user_id', user.id)
    .single();

  if (!config?.youtube_oauth_client_id) {
    return NextResponse.redirect(
      `${origin}/command-center/settings/general?tab=api-keys&error=youtube_not_configured`
    );
  }

  if (!config.youtube_oauth_verified) {
    return NextResponse.redirect(
      `${origin}/command-center/settings/general?tab=api-keys&error=youtube_not_verified`
    );
  }

  // Build Google OAuth URL using USER'S OWN client ID
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') || '/command-center/settings/general?tab=api-keys';

  const state = Buffer.from(JSON.stringify({
    userId: user.id,
    returnTo,
  })).toString('base64url');

  const params = new URLSearchParams({
    client_id: config.youtube_oauth_client_id,
    redirect_uri: `${origin}/api/youtube/oauth/callback`,
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log(`[YouTube OAuth Authorize] client_id: ${config.youtube_oauth_client_id.slice(0, 20)}...`);
  console.log(`[YouTube OAuth Authorize] redirect_uri: ${origin}/api/youtube/oauth/callback`);
  console.log(`[YouTube OAuth Authorize] redirecting to Google OAuth`);

  return NextResponse.redirect(redirectUrl);
}
