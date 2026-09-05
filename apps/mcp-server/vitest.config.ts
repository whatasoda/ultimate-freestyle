import {
  cloudflareTest,
  readD1Migrations
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  logLevel: "error",
  test: {
    // render.spec.ts と dashboard-runtime.spec.ts は Workers ではなく node 側で動かす。
    exclude: ["test/render.spec.ts", "test/dashboard-runtime.spec.ts", "node_modules/**"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "istanbul",
      reportsDirectory: "../../coverage/mcp-server",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/worker-configuration.d.ts"],
      // 配信JSのソースをgrepするテストを消したぶん、見かけの数字が落ちた。grepは
      // assets.ts の文字列定義を参照するだけで実行していないのに、行が踏まれた扱いに
      // なっていた。ここは実際に走った量で、下限は実測に合わせる。JSの振る舞いは
      // test:runtime（happy-dom）が別プロセスで見るため、この集計には入らない。
      thresholds: {
        statements: 70,
        branches: 59,
        functions: 81,
        lines: 71
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
