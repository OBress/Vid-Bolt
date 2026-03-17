import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPublicOrigin } from '@/lib/utils/get-public-origin'
import { notifyNewWaitlistUser } from '@/lib/discord-webhook'

/**
 * Auth Callback Route
 * 
 * Handles the OAuth callback from Supabase after Discord authentication.
 * This route is ONLY for Discord login/signup — GCP connect uses a
 * separate custom flow at /api/gcp/oauth/*.
 * 
 * - Exchanges the auth code for a session
 * - Checks Discord guild membership (VidBolt server)
 * - Stores Discord identity metadata in the users table
 * - Sets the is_logged_in cookie for middleware fast-path
 */

/** Discord guild object from the /users/@me/guilds endpoint */
interface DiscordGuild {
  id: string;
  name: string;
}

/**
 * Check if the authenticated user is a member of the VidBolt Discord server.
 * Uses the Discord OAuth access token (requires `guilds` scope).
 */
async function checkVidBoltGuildMembership(
  providerToken: string,
  guildId: string
): Promise<boolean> {
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${providerToken}`,
      },
    });

    if (!response.ok) {
      console.warn('[Auth Callback] Failed to fetch Discord guilds:', response.status);
      return false;
    }

    const guilds: DiscordGuild[] = await response.json();
    return guilds.some((guild) => guild.id === guildId);
  } catch (err) {
    console.error('[Auth Callback] Error checking Discord guild membership:', err);
    return false;
  }
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const origin = getPublicOrigin(request)

  // DIAGNOSTIC: trace the resolved origin (remove after fixing redirect issue)
  console.log('[Auth Callback] request.url:', request.url)
  console.log('[Auth Callback] getPublicOrigin resolved to:', origin)
  console.log('[Auth Callback] x-forwarded-host:', request.headers.get('x-forwarded-host'))
  console.log('[Auth Callback] NEXT_PUBLIC_APP_URL available:', !!process.env['NEXT_PUBLIC_APP_URL'])

  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/command-center'

  if (code) {
    const supabase = await createClient()
    const { error, data: { session } } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && session) {
      const user = session.user

      // =====================================================
      // DISCORD IDENTITY & GUILD MEMBERSHIP CHECK
      // =====================================================
      const discordId = user.user_metadata?.provider_id || user.user_metadata?.sub || null;
      const discordUsername = user.user_metadata?.full_name 
        || user.user_metadata?.custom_claims?.global_name
        || user.user_metadata?.name 
        || null;
      const discordAvatar = user.user_metadata?.avatar_url || null;

      // Check VidBolt Discord server membership
      let inVidBoltServer = false;
      const guildId = process.env.DISCORD_VIDBOLT_GUILD_ID;

      if (session.provider_token && guildId) {
        inVidBoltServer = await checkVidBoltGuildMembership(
          session.provider_token,
          guildId
        );
        console.log('[Auth Callback] VidBolt server membership:', inVidBoltServer);
      } else {
        console.log('[Auth Callback] Skipping guild check — missing provider_token or DISCORD_VIDBOLT_GUILD_ID');
      }

      // =====================================================
      // UPSERT USER PROFILE
      // =====================================================
      const { data: profile } = await supabase
        .from('users')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()

      if (!profile) {
        // Create initial profile with Discord metadata
        await supabase.from('users').insert({
          id: user.id,
          email: user.email,
          discord_id: discordId,
          discord_username: discordUsername,
          discord_avatar: discordAvatar,
          in_vidbolt_server: inVidBoltServer,
        })

        // Fire-and-forget: notify Discord channel about new waitlist signup
        notifyNewWaitlistUser({
          email: user.email,
          discordId,
          discordUsername,
          discordAvatar,
          inVidBoltServer: inVidBoltServer,
        }).catch((err) => console.error('[Auth Callback] Discord webhook error:', err))
      } else {
        // Update Discord metadata on every login
        await supabase
          .from('users')
          .update({
            discord_id: discordId,
            discord_username: discordUsername,
            discord_avatar: discordAvatar,
            in_vidbolt_server: inVidBoltServer,
          })
          .eq('id', user.id)
      }

      // Determine redirection
      let redirectUrl = next
      if (!profile || !profile.onboarding_completed) {
        redirectUrl = '/onboarding'
      }

      const response = NextResponse.redirect(`${origin}${redirectUrl}`)
      // Set a lightweight cookie for authorization optimization
      response.cookies.set('is_logged_in', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
      return response
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
