/** @type {import('next').NextConfig} */
// Security headers (CSP, Referrer-Policy, etc.) are applied by middleware.ts
// for all page routes. This config remains for any static-file paths that
// middleware does not cover.
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
