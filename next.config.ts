import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Prevent browsers from clinging to stale CSS/HTML during local UI iteration
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
