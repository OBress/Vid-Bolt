import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storeRefreshToken } from '@/lib/gcp/token-refresh'

/**
 * GCP OAuth Callback
 * 
 * Handles the Google OAuth callback for GCP API access.
 * Exchanges the authorization code for tokens, stores the refresh token,
 * and redirects back to settings. The Discord Supabase session is never touched.
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

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // user ID passed from authorize route
  const error = searchParams.get('error')
  const settingsUrl = `${origin}/command-center/settings/general?tab=api-keys`

  // Handle user denying consent
  if (error) {
    console.warn('[GCP OAuth Callback] User denied consent:', error)
    return NextResponse.redirect(`${settingsUrl}&error=consent_denied`)
  }

  if (!code || !state) {
    console.error('[GCP OAuth Callback] Missing code or state')
    return NextResponse.redirect(`${settingsUrl}&error=missing_params`)
  }

  // Verify the user is still authenticated with their Discord session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // Validate that the state matches the current user (CSRF protection)
  if (user.id !== state) {
    console.error('[GCP OAuth Callback] State mismatch — potential CSRF')
    return NextResponse.redirect(`${settingsUrl}&error=state_mismatch`)
  }

  // Exchange authorization code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('[GCP OAuth Callback] Missing Google OAuth credentials')
    return NextResponse.redirect(`${settingsUrl}&error=missing_config`)
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
      return NextResponse.redirect(`${settingsUrl}&error=token_exchange_failed`)
    }

    if (!tokenData.refresh_token) {
      console.error('[GCP OAuth Callback] No refresh_token received — user may need to re-consent')
      return NextResponse.redirect(`${settingsUrl}&error=no_refresh_token`)
    }

    // Store the refresh token for the current (Discord) user
    await storeRefreshToken(user.id, tokenData.refresh_token)
    console.log('[GCP OAuth Callback] Stored GCP refresh token for user:', user.id)

    return NextResponse.redirect(`${settingsUrl}&gcp_connected=true`)
  } catch (err) {
    console.error('[GCP OAuth Callback] Unexpected error:', err)
    return NextResponse.redirect(`${settingsUrl}&error=unexpected`)
  }
}
