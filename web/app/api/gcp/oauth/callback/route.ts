import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { storeRefreshToken } from '@/lib/gcp/token-refresh'
import { getPublicOrigin } from '@/lib/utils/get-public-origin'

/**
 * GCP OAuth Callback
 * 
 * Handles the Google OAuth callback for GCP Compute Engine access.
 * Exchanges the authorization code for tokens, fetches Google userinfo,
 * stores in social_connections + user_gcp_config, and redirects back.
 * 
 * YouTube OAuth is handled separately via /api/youtube/oauth/callback.
 */

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope?: string
  error?: string
  error_description?: string
}

interface GoogleUserInfo {
  email: string
  name: string
  picture: string
}

interface OAuthState {
  userId: string
  returnTo?: string
  connectionId?: string
}

function decodeState(state: string): OAuthState | null {
  try {
    return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'))
  } catch {
    // Fallback: old-style bare user ID
    return { userId: state }
  }
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const origin = getPublicOrigin(request)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')
  const fallbackUrl = `${origin}/command-center/settings/general?tab=api-keys`

  // Handle user denying consent
  if (error) {
    console.warn('[GCP OAuth Callback] User denied consent:', error)
    return NextResponse.redirect(`${fallbackUrl}&error=consent_denied`)
  }

  if (!code || !stateParam) {
    console.error('[GCP OAuth Callback] Missing code or state')
    return NextResponse.redirect(`${fallbackUrl}&error=missing_params`)
  }

  // Decode state
  const state = decodeState(stateParam)
  if (!state) {
    console.error('[GCP OAuth Callback] Failed to decode state')
    return NextResponse.redirect(`${fallbackUrl}&error=invalid_state`)
  }

  const redirectUrl = state.returnTo
    ? `${origin}${state.returnTo.startsWith('/') ? state.returnTo : `/${state.returnTo}`}`
    : fallbackUrl

  // Verify the user is still authenticated with their Discord session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // Validate that the state matches the current user (CSRF protection)
  if (user.id !== state.userId) {
    console.error('[GCP OAuth Callback] State mismatch — potential CSRF')
    return NextResponse.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=state_mismatch`)
  }

  // Exchange authorization code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('[GCP OAuth Callback] Missing Google OAuth credentials')
    return NextResponse.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=missing_config`)
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/gcp/oauth/callback`,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData: GoogleTokenResponse = await tokenResponse.json()

    if (tokenData.error) {
      console.error('[GCP OAuth Callback] Token exchange error:', tokenData.error, tokenData.error_description)
      return NextResponse.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=token_exchange_failed`)
    }

    if (!tokenData.refresh_token) {
      console.error('[GCP OAuth Callback] No refresh_token received — user may need to re-consent')
      return NextResponse.redirect(`${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}error=no_refresh_token`)
    }

    // Fetch Google userinfo (email, name, picture)
    let userInfo: GoogleUserInfo | null = null
    try {
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      if (userinfoRes.ok) {
        userInfo = await userinfoRes.json()
      }
    } catch (err) {
      console.warn('[GCP OAuth Callback] Failed to fetch userinfo:', err)
    }

    // Store in social_connections
    const serviceSupabase = createServiceClient()
    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    const scopes = tokenData.scope?.split(' ') || []

    console.log('[OAuth Callback] Token exchange result:', {
      hasRefreshToken: !!tokenData.refresh_token,
      hasAccessToken: !!tokenData.access_token,
      scopes,
      connectionId: state.connectionId,
      userEmail: userInfo?.email,
    })

    if (state.connectionId) {
      // Re-auth existing connection
      await serviceSupabase
        .from('social_connections')
        .update({
          refresh_token: tokenData.refresh_token,
          access_token: tokenData.access_token,
          token_expires_at: tokenExpiresAt,
          provider_email: userInfo?.email || null,
          provider_name: userInfo?.name || null,
          provider_avatar: userInfo?.picture || null,
          scopes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.connectionId)
        .eq('user_id', user.id)
    } else {
      // Check if this Google account (by email) is already connected
      let existingConnection: { id: string } | null = null
      if (userInfo?.email) {
        const { data } = await serviceSupabase
          .from('social_connections')
          .select('id')
          .eq('user_id', user.id)
          .eq('provider', 'google')
          .eq('provider_email', userInfo.email)
          .single()
        existingConnection = data
      }

      if (existingConnection) {
        // Update existing connection for this email
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
          .eq('id', existingConnection.id)
      } else {
        // Check if user has any existing Google connections to determine primary status
        const { count } = await serviceSupabase
          .from('social_connections')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('provider', 'google')

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
            is_primary: (count ?? 0) === 0, // First connection is primary
          })
      }
    }

    // Store GCP tokens (this is always a GCP connection now — YouTube is separate)
    await storeRefreshToken(user.id, tokenData.refresh_token)
    console.log('[OAuth Callback] Stored GCP token for user:', user.id)
    console.log('[OAuth Callback] Stored social connection for:', user.id, userInfo?.email || 'unknown')

    const separator = redirectUrl.includes('?') ? '&' : '?'
    return NextResponse.redirect(`${redirectUrl}${separator}gcp_connected=true`)
  } catch (err) {
    console.error('[GCP OAuth Callback] Unexpected error:', err)
    const separator = redirectUrl.includes('?') ? '&' : '?'
    return NextResponse.redirect(`${redirectUrl}${separator}error=unexpected`)
  }
}
