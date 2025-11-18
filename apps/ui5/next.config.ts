import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  // Turbopack is enabled by default in Next.js 16

  // Transpile SDK package to enable hot reload for symlinked workspace packages
  transpilePackages: ['@fabstir/sdk-core'],
};

export default nextConfig;
