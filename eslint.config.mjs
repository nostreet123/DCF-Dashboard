import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals.js";
import nextTypescript from "eslint-config-next/typescript.js";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  ...compat.config(nextCoreWebVitals),
  ...compat.config(nextTypescript),
  {
    ignores: [
      ".agents/**",
      ".next/**",
      ".venv/**",
      "next-env.d.ts",
      "python/**",
      "convex/**",
      "convex_tests/**",
      "test/**",
      "e2e/**",
      "scripts/**",
      "playwright-report/**",
      "test-results/**",
      "run_asset_backfill.js",
    ],
  },
];

export default eslintConfig;
