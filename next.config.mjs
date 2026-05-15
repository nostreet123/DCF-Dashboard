/** @type {import('next').NextConfig} */
// Security headers (CSP, Referrer-Policy, etc.) are applied by middleware.ts
// for all page routes. This config remains for any static-file paths that
// middleware does not cover.
//
// Keep direct `next build` strict by default. The verification harness runs
// typecheck and lint as explicit earlier steps, then opts into skipping Next's
// duplicate build-time checks via this environment flag.
const assumePrecheckedBuild = process.env.NEXT_BUILD_ASSUME_PRECHECKS === 'true';

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: assumePrecheckedBuild },
  typescript: { ignoreBuildErrors: assumePrecheckedBuild },
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
