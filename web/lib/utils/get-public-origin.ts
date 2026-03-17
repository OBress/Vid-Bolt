/**
 * Resolve the public-facing origin for redirects in API routes.
 *
 * Priority:
 *   1. NEXT_PUBLIC_APP_URL — always wins when set (production).
 *   2. x-forwarded-host    — used in dev behind a proxy.
 *   3. Raw request origin  — local dev fallback.
 *
 * NOTE: We read NEXT_PUBLIC_APP_URL via dynamic bracket notation so
 * that Next.js's webpack DefinePlugin does NOT statically replace it
 * at build time. This ensures the value is read from the container's
 * runtime environment, not inlined (potentially as `undefined`) during
 * `next build`.
 */
export function getPublicOrigin(request: Request): string {
  // 1. Explicit app URL — read at RUNTIME (dynamic key bypasses webpack inlining)
  const appUrlKey = 'NEXT_PUBLIC_APP_URL'
  const appUrl = process.env[appUrlKey]

  if (appUrl) {
    return appUrl
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

