import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { nextUrl } = request
  const isLoggedIn = request.cookies.get('is_logged_in')?.value === 'true'

  // Allow access to auth callback, login page, and Inngest webhook
  if (
    nextUrl.pathname.startsWith('/auth') ||
    nextUrl.pathname === '/login' ||
    nextUrl.pathname.startsWith('/api/inngest')
  ) {
    // Inngest requests don't need Supabase session logic and should be served as-is
    if (nextUrl.pathname.startsWith('/api/inngest')) {
      return NextResponse.next()
    }
    return await updateSession(request)
  }

  // Fast check: if no cookie, redirect to login
  if (!isLoggedIn) {
    const url = nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
