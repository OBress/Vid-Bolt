/**
 * Resolve the public-facing origin for redirects in API routes.
 *
 * Inside Docker, `new URL(request.url).origin` resolves to the container's
 * internal address (e.g. `https://0.0.0.0:3000`). This helper uses the
 * forwarded headers set by Traefik / Cloudflare, or falls back to
 * `NEXT_PUBLIC_APP_URL`, then the raw request origin.
 */
export function getPublicOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  return new URL(request.url).origin
}
// OAuth fix deployment trigger
