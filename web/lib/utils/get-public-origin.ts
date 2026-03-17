/**
 * Resolve the public-facing origin for redirects in API routes.
 *
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL — always wins when set (production).
 *   2. x-forwarded-host    — used in dev behind a proxy.
 *   3. Raw request origin  — local dev fallback.
 *
 * NEXT_PUBLIC_APP_URL is checked first because, inside Docker,
 * x-forwarded-host can resolve to the container's internal address
 * (e.g. `0.0.0.0:3000`) depending on the reverse-proxy configuration.
 */
export function getPublicOrigin(request: Request): string {
  // 1. Explicit app URL — most reliable in production
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // 2. Forwarded headers from reverse proxy (dev / staging)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  // 3. Fallback — may be a Docker-internal address
  const fallback = new URL(request.url).origin
  console.warn('[getPublicOrigin] Using raw request origin fallback:', fallback)
  return fallback
}
