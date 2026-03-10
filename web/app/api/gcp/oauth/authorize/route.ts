/**
 * GCP / YouTube OAuth Authorize
 * 
 * Initiates Google OAuth WITHOUT touching Supabase auth.
 * Redirects the user to Google's consent screen. The Discord session stays intact.
 * 
 * This is now ONLY for GCP Compute Engine access.
 * YouTube OAuth is handled separately via /api/youtube/oauth/authorize (per-user credentials).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPublicOrigin } from '@/lib/utils/get-public-origin'

// GCP scopes — for VM provisioning and Cloud API access ONLY
// YouTube scopes have been moved to per-user OAuth (/api/youtube/oauth/authorize)
const GCP_SCOPES = [
  'https://www.googleapis.com/auth/compute',
  'https://www.googleapis.com/auth/cloud-platform.read-only',
]

export async function GET(request: Request) {
  const origin = getPublicOrigin(request)
  const url = new URL(request.url)

  // Verify the user is authenticated before starting OAuth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    console.error('[OAuth] Missing GOOGLE_CLIENT_ID')
    return NextResponse.redirect(`${origin}/command-center/settings/general?tab=api-keys&error=missing_config`)
  }

  // Encode state as JSON with userId and returnTo
  const returnTo = url.searchParams.get('returnTo') || '/command-center/settings/general?tab=api-keys'
  const connectionId = url.searchParams.get('connectionId') || undefined

  const state = Buffer.from(JSON.stringify({
    userId: user.id,
    returnTo,
    connectionId,
  })).toString('base64url')

  // Build Google OAuth URL — this does NOT go through Supabase
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/gcp/oauth/callback`,
    response_type: 'code',
    scope: GCP_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
