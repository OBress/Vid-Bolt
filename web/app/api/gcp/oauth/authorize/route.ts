import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GCP OAuth Authorize
 * 
 * Initiates Google OAuth for GCP API access WITHOUT touching Supabase auth.
 * Redirects the user to Google's consent screen. The Discord session stays intact.
 */

const GCP_SCOPES = [
  'https://www.googleapis.com/auth/compute',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/cloud-platform.read-only',
].join(' ')

export async function GET(request: Request) {
  const { origin } = new URL(request.url)

  // Verify the user is authenticated before starting OAuth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    console.error('[GCP OAuth] Missing GOOGLE_CLIENT_ID')
    return NextResponse.redirect(`${origin}/command-center/settings/general?tab=api-keys&error=missing_config`)
  }

  // Build Google OAuth URL — this does NOT go through Supabase
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/gcp/oauth/callback`,
    response_type: 'code',
    scope: GCP_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    // Pass the user ID through state so the callback knows which user to store tokens for
    state: user.id,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
