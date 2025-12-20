import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in search params, use it as the redirection URL
  const next = searchParams.get('next') ?? '/command-center/operations'

  if (code) {
    const supabase = await createClient()
    const { error, data: { session } } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && session) {
      const user = session.user
      
      // Upsert user into public.users table if it doesn't exist
      // We do this to ensure we have a record to track onboarding
      const { data: profile } = await supabase
        .from('users')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()

      if (!profile) {
        // Create initial profile
        await supabase.from('users').insert({
          id: user.id,
          email: user.email,
        })
      }

      // Determine redirection
      let redirectUrl = next
      if (!profile || !profile.onboarding_completed) {
        redirectUrl = '/onboarding'
      }

      const response = NextResponse.redirect(`${origin}${redirectUrl}`)
      // Set a lightweight cookie for optimization
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
