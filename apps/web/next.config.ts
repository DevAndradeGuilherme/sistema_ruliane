import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  transpilePackages: ['@financeiro/domain', '@financeiro/contracts'],
};
export default nextConfig;
