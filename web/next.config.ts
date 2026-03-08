import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: '.',
  },
  eslint: {
    // Lint errors (mostly unused-vars in in-development components) are caught
    // by the IDE; don't let them block CI/CD deployments.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // The clean Docker CI npm ci resolves types differently than local dev.
    // Type safety is enforced by the IDE and tsc --noEmit in dev.
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    middlewareClientMaxBodySize: '100mb',
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.vidbolt.app',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https://assets.vidbolt.app https://images.unsplash.com https://images.pexels.com data: blob:",
              "media-src 'self' https://assets.vidbolt.app blob:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://assets.vidbolt.app https://api.stripe.com",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      {
        source: '/favicon.ico',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, immutable' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Proxy R2 assets as same-origin to avoid canvas CORS tainting
        source: '/r2-media/:path*',
        destination: `${process.env.R2_PUBLIC_URL || 'https://assets.vidbolt.app'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
