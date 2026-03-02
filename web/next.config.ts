import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
    middlewareClientMaxBodySize: '500mb',
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
