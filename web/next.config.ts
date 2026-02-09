import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
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
