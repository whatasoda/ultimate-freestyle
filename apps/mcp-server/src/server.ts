import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const SERVICE_NAME = "ultimate-freestyle-mcp";
export const SERVICE_VERSION = "0.1.0";

export type EligibilityConfig = Pick<
  Env,
  | "TWITCH_BROADCASTER_ID"
  | "TWITCH_BROADCASTER_LOGIN"
  | "MIN_FOLLOW_DAYS"
>;

export function createHealthResult(config: EligibilityConfig) {
  const minFollowDays = Number.parseInt(config.MIN_FOLLOW_DAYS, 10);
  if (!Number.isSafeInteger(minFollowDays) || minFollowDays < 0) {
    throw new Error("MIN_FOLLOW_DAYS must be a non-negative integer.");
  }

  return {
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    request_id: crypto.randomUUID(),
    eligibility: {
      broadcaster_id: config.TWITCH_BROADCASTER_ID,
      broadcaster_login: config.TWITCH_BROADCASTER_LOGIN,
      min_follow_days: minFollowDays
    }
  } as const;
}

export function createServer(config: EligibilityConfig): McpServer {
  const server = new McpServer(
    {
      name: SERVICE_NAME,
      version: SERVICE_VERSION
    },
    {
      instructions:
        "最自由研究の制作を支援するサーバーです。まずhealthを呼び、利用可能な機能を確認してください。現段階のtoolは読み取り専用です。"
    }
  );

  server.registerTool(
    "health",
    {
      title: "MCP接続状態を確認",
      description:
        "サーバーの稼働状態と契約versionを返す読み取り専用toolです。接続後の最初の疎通確認に使います。",
      inputSchema: {},
      outputSchema: {
        ok: z.literal(true),
        service: z.literal(SERVICE_NAME),
        version: z.literal(SERVICE_VERSION),
        request_id: z.string().uuid(),
        eligibility: z.object({
          broadcaster_id: z.string(),
          broadcaster_login: z.string(),
          min_follow_days: z.number().int().nonnegative()
        })
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    () => {
      const result = createHealthResult(config);

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result
      };
    }
  );

  server.registerResource(
    "research-overview",
    "research://guide/overview",
    {
      title: "最自由研究 制作ガイド",
      description: "研究を発見・設計・記録・評価・発表へ進める際の入口です。",
      mimeType: "text/markdown"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# 最自由研究 制作ガイド",
            "",
            "テーマを急いで固定せず、問い、仮説、検証方法、記録、発表構成の順に具体化します。",
            "現段階では疎通確認用の固定resourceであり、研究データの保存機能はまだありません。"
          ].join("\n")
        }
      ]
    })
  );

  return server;
}
