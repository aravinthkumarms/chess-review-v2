import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    // Only use local rewrites in development
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/py/:path*',
          destination: 'http://127.0.0.1:8000/api/py/:path*',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
