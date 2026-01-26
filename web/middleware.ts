import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { nextUrl } = request
  const isLoggedIn = request.cookies.get('is_logged_in')?.value === 'true'

  // Check for worker secret for internal API access
  const workerSecret = process.env.INTERNAL_API_SECRET;
  const requestSecret = request.headers.get('x-worker-secret');
  // Only consider it a worker request if the secret is configured AND matches
  const isWorkerRequest = workerSecret && requestSecret === workerSecret;

  // Allow access to auth callback, login page, Inngest webhook, and GPU callback
  if (
    nextUrl.pathname.startsWith('/auth') ||
    nextUrl.pathname === '/login' ||
    nextUrl.pathname.startsWith('/api/inngest') ||
    nextUrl.pathname.startsWith('/api/gpu-callback')
  ) {
    // Webhook and internal API requests don't need Supabase session logic
    if (
      nextUrl.pathname.startsWith('/api/inngest') || 
      nextUrl.pathname.startsWith('/api/gpu-callback')
    ) {
      return NextResponse.next()
    }
    return await updateSession(request)
  }

  // Protected Internal APIs (Stock Media, Vector)
  // Allow if user is logged in OR if it's a valid worker request
  if (
    nextUrl.pathname.startsWith('/api/stock-media') ||
    nextUrl.pathname.startsWith('/api/vector')
  ) {
    if (isWorkerRequest) {
      return NextResponse.next();
    }
    // If not a worker, fall through to session check below
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
    '/((?!_next/static|_next/image|favicon.ico|api/gpu-api/loras|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
