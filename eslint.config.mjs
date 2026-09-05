import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/.wrangler/**",
    "**/dist/**",
    "build/**",
    "work/**",
    "apps/mcp-server/src/worker-configuration.d.ts"
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      // Workers の R2 key と HTML 由来の文字列から制御文字を弾く正規表現が必要になる。
      "no-control-regex": "off"
    }
  }
]);
