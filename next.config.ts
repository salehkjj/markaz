import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  basePath: '/markaz',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
