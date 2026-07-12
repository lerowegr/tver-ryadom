import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@tver/shared'],
  images: { unoptimized: true },
};

export default nextConfig;
