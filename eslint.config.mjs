import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".agents/**",
      ".bun-home/**",
      ".next/**",
      ".tmp/**",
      ".venv/**",
      ".worktrees/**",
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
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // eslint-plugin-react-hooks 7 flags React 18 patterns this app still uses.
      // Revisit when React 19 lands; rewriting them here would change render timing.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default eslintConfig;
