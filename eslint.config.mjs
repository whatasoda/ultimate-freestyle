import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".vinext/**",
    "**/.wrangler/**",
    "**/dist/**",
    "build/**",
    "work/**",
    "apps/mcp-server/src/worker-configuration.d.ts",
    "next-env.d.ts"
  ])
]);
