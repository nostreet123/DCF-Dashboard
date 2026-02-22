import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".agents/**",
      ".venv/**",
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
