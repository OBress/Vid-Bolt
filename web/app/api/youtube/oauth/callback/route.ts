/**
 * YouTube OAuth Callback (Per-User Credentials)
 * 
 * Handles the callback from Google OAuth using the USER'S OWN OAuth credentials.
 * Exchanges the auth code for tokens and stores them in user_gcp_config.
 * Does NOT touch the global GCP tokens (gcp_refresh_token stays intact).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getPublicOrigin } from '@/lib/utils/get-public-origin';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email: string;
  name: string;
  picture: string;
}

interface OAuthState {
  userId: string;
  returnTo?: string;
}

function decodeState(state: string): OAuthState | null {
  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const origin = getPublicOrigin(request);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');
  const fallbackUrl = `${origin}/command-center/settings/general?tab=api-keys`;

  if (error) {
    console.warn('[YouTube OAuth Callback] Error from Google:', error);
    // access_denied typically means the app is in Testing mode and user isn't a test user
    const errorCode = error === 'access_denied' ? 'app_not_published' : 'consent_denied';
    return NextResponse.redirect(`${fallbackUrl}&error=${errorCode}`);
  }

  if (!code || !stateParam) {
    console.error('[YouTube OAuth Callback] Missing code or state');
    return NextResponse.redirect(`${fallbackUrl}&error=missing_params`);
  }

  const state = decodeState(stateParam);
  if (!state) {
    return NextResponse.redirect(`${fallbackUrl}&error=invalid_state`);
  }

  const redirectUrl = state.returnTo
    ? `${origin}${state.returnTo.startsWith('/') ? state.returnTo : `/${state.returnTo}`}`
    : fallbackUrl;

  // Verify user session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (user.id !== state.userId) {
    console.error('[YouTube OAuth Callback] State mismatch — potential CSRF');
    return NextResponse.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=state_mismatch`);
  }

  // Get user's per-user OAuth credentials
  const serviceSupabase = createServiceClient();
  const { data: config } = await serviceSupabase
    .from('user_gcp_config')
    .select('youtube_oauth_client_id, youtube_oauth_client_secret')
    .eq('user_id', user.id)
    .single();

  if (!config?.youtube_oauth_client_id || !config?.youtube_oauth_client_secret) {
    return NextResponse.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=missing_oauth_config`);
  }

  try {
    // Exchange code using USER'S OWN client credentials
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.youtube_oauth_client_id,
        client_secret: config.youtube_oauth_client_secret,
        redirect_uri: `${origin}/api/youtube/oauth/callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData: GoogleTokenResponse = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[YouTube OAuth Callback] Token exchange error:', tokenData.error, tokenData.error_description);
      return NextResponse.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=token_exchange_failed`);
    }

    if (!tokenData.refresh_token) {
      console.error('[YouTube OAuth Callback] No refresh_token received');
      return NextResponse.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=no_refresh_token`);
    }

    // Fetch Google userinfo
    let userInfo: GoogleUserInfo | null = null;
    try {
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoRes.ok) {
        userInfo = await userinfoRes.json();
      }
    } catch (err) {
      console.warn('[YouTube OAuth Callback] Failed to fetch userinfo:', err);
    }

    // Store YouTube tokens in user_gcp_config (NOT gcp_refresh_token — that stays for compute)
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    await serviceSupabase
      .from('user_gcp_config')
      .update({
        youtube_refresh_token: tokenData.refresh_token,
        youtube_access_token: tokenData.access_token,
        youtube_token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    // Also store in social_connections for the connections UI
    const scopes = tokenData.scope?.split(' ') || [];

    // Check if this Google account is already connected for YouTube
    let existingConnection: { id: string } | null = null;
    if (userInfo?.email) {
      const { data } = await serviceSupabase
        .from('social_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .eq('provider_email', userInfo.email)
        .single();
      existingConnection = data;
    }

    if (existingConnection) {
      await serviceSupabase
        .from('social_connections')
        .update({
          refresh_token: tokenData.refresh_token,
          access_token: tokenData.access_token,
          token_expires_at: tokenExpiresAt,
          provider_name: userInfo?.name || null,
          provider_avatar: userInfo?.picture || null,
          scopes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id);
    } else {
      await serviceSupabase
        .from('social_connections')
        .insert({
          user_id: user.id,
          provider: 'google',
          provider_email: userInfo?.email || null,
          provider_name: userInfo?.name || null,
          provider_avatar: userInfo?.picture || null,
          refresh_token: tokenData.refresh_token,
          access_token: tokenData.access_token,
          token_expires_at: tokenExpiresAt,
          scopes,
          is_primary: false, // YouTube connections are not primary (GCP compute is)
        });
    }

    console.log('[YouTube OAuth Callback] Stored YouTube tokens for:', user.id, userInfo?.email || 'unknown');

    const separator = redirectUrl.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${redirectUrl}${separator}youtube_connected=true`);
  } catch (err) {
    console.error('[YouTube OAuth Callback] Unexpected error:', err);
    const separator = redirectUrl.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${redirectUrl}${separator}error=unexpected`);
  }
}
