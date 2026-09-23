/** @type {import('next').NextConfig} */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Security headers (CSP, Referrer-Policy, etc.) are applied by proxy.ts
// for all page routes. This config remains for any static-file paths that
// the proxy does not cover.
//
// Keep direct `next build` strict by default. The verification harness runs
// typecheck and lint as explicit earlier steps, then opts into skipping Next's
// duplicate build-time typecheck via this environment flag. Next.js 16 does
// not lint during `next build`.
const assumePrecheckedBuild = process.env.NEXT_BUILD_ASSUME_PRECHECKS === 'true';
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: assumePrecheckedBuild },
  outputFileTracingRoot: repoRoot,
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
