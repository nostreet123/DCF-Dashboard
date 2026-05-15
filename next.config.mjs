/** @type {import('next').NextConfig} */
// Security headers (CSP, Referrer-Policy, etc.) are applied by middleware.ts
// for all page routes. This config remains for any static-file paths that
// middleware does not cover.
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'financialmodelingprep.com',
        pathname: '/image-stock/**',
      },
    ],
  },
};

export default nextConfig;
