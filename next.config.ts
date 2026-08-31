import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Un build que ignora errores de tipos no es un build. tsc corre igual en CI.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
