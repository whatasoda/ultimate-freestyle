import {
  cloudflareTest,
  readD1Migrations
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  logLevel: "error",
  test: {
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "istanbul",
      reportsDirectory: "../../coverage/mcp-server",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/worker-configuration.d.ts"],
      thresholds: {
        statements: 75,
        branches: 66,
        functions: 86,
        lines: 77
      }
    }
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          TWITCH_CLIENT_ID: "contract-test-client-id",
          TWITCH_CLIENT_SECRET: "contract-test-client-secret"
        }
      },
      wrangler: { configPath: "./wrangler.jsonc" }
    })
  ]
});
