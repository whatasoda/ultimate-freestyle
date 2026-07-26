import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMcpAuthContext } from "agents/mcp";
import { z } from "zod";

import {
  eligibilityReasonSchema,
  twitchGrantPropsSchema
} from "./auth/types";
import { registerProjectTools } from "./projects/tools";
import { registerResearchGuides } from "./projects/guides";

export const SERVICE_NAME = "ultimate-freestyle-mcp";
export const SERVICE_VERSION = "0.3.0";

export type EligibilityConfig = Pick<
  Env,
  | "TWITCH_BROADCASTER_ID"
  | "TWITCH_BROADCASTER_LOGIN"
  | "MIN_FOLLOW_DAYS"
>;

export type ServerConfig = EligibilityConfig & Pick<Env, "DB">;

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

export function createServer(
  config: ServerConfig,
  getAuthProps: () => Record<string, unknown> | undefined = () =>
    getMcpAuthContext()?.props
): McpServer {
  const server = new McpServer(
    {
      name: SERVICE_NAME,
      version: SERVICE_VERSION
    },
    {
      instructions:
        "最自由研究の制作を支援するサーバーです。まずhealthを呼び、次にget_access_statusを確認してください。変更前はget_projectでversionを取得し、update_projectへexpected_versionを渡します。競合時は再取得してユーザーの変更を失わないでください。"
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

  server.registerTool(
    "get_access_status",
    {
      title: "最自由研究の利用資格を確認",
      description:
        "認証中のTwitch利用者、許可scope、資格判定と有効期限を返します。Twitch tokenは返しません。",
      inputSchema: {},
      outputSchema: {
        authenticated: z.boolean(),
        request_id: z.string().uuid(),
        access: z
          .object({
            user: z.object({ id: z.string(), login: z.string() }),
            scopes: z.array(z.enum(["research:read", "research:write", "research:publish"])),
            eligibility: z.object({
              eligible: z.boolean(),
              reason: eligibilityReasonSchema,
              checked_at: z.string().datetime(),
              expires_at: z.string().datetime(),
              followed_at: z.string().datetime().nullable(),
              follow_days: z.number().int().nonnegative().nullable(),
              subscribed: z.boolean(),
              override: z.enum(["allow", "deny"]).nullable()
            })
          })
          .nullable(),
        error: z
          .object({ code: z.string(), message: z.string() })
          .nullable()
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    () => {
      const parsed = twitchGrantPropsSchema.safeParse(
        getAuthProps()
      );
      const result = parsed.success
        ? {
            authenticated: true,
            request_id: crypto.randomUUID(),
            access: {
              user: {
                id: parsed.data.identity.user_id,
                login: parsed.data.identity.login
              },
              scopes: parsed.data.mcp_scopes,
              eligibility: parsed.data.eligibility
            },
            error: null
          }
        : {
            authenticated: false,
            request_id: crypto.randomUUID(),
            access: null,
            error: {
              code: "AUTH_REQUIRED",
              message: "Twitch OAuth authentication is required."
            }
          };

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

  registerProjectTools(server, config.DB, getAuthProps);
  registerResearchGuides(server, config.DB, getAuthProps);

  return server;
}
