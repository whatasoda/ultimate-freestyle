import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMcpAuthContext } from "agents/mcp";
import { z } from "zod";

import { registerAssetTools } from "./assets/tools";
import {
  eligibilityReasonSchema,
  twitchGrantPropsSchema
} from "./auth/types";
import { registerProjectTools } from "./projects/tools";
import { registerProjectMutationTools } from "./projects/mutation-tools";
import { registerResearchGuides } from "./projects/guides";
import { PRESENTATION_RENDERER_VERSION } from "./presentation/render";
import { registerVoiceTools } from "./voicevox/tools";

export const SERVICE_NAME = "ultimate-freestyle-mcp";
export const SERVICE_VERSION = "0.14.0";

export type EligibilityConfig = Pick<
  Env,
  | "TWITCH_BROADCASTER_ID"
  | "TWITCH_BROADCASTER_LOGIN"
  | "MIN_FOLLOW_DAYS"
>;

export type ServerConfig = EligibilityConfig &
  Pick<Env, "DB" | "MEDIA_BUCKET" | "VOICE_JOBS_QUEUE">;

export function createHealthResult(config: EligibilityConfig) {
  const minFollowDays = Number.parseInt(config.MIN_FOLLOW_DAYS, 10);
  if (!Number.isSafeInteger(minFollowDays) || minFollowDays < 0) {
    throw new Error("MIN_FOLLOW_DAYS must be a non-negative integer.");
  }

  return {
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    renderer_version: PRESENTATION_RENDERER_VERSION,
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
        "最自由研究の制作を支援するサーバーです。接続直後はhealth、get_access_status、list_projectsの順に呼んでください。既存研究を扱う場合は一覧のproject_idでget_project_outlineを呼び、全体はresearch://projects/{id}、一枚はresearch://projects/{id}/slides/{slideId}から必要な範囲だけ読みます。一覧が空ならテーマを推測で決めず、start_research promptに沿って一問ずつ対話し、題名と目的が合意できてからcreate_projectを呼んでください。変更は目的に合う小粒度toolへ現在のexpected_versionを渡してください。リッチな発表はresearch://guide/presentation-componentsを読んでscene componentを一件ずつ構成してください。競合時は該当範囲を再取得し、ユーザーの変更を失わないでください。読み上げ編集後はget_voice_generation_statusで差分を確認し、ユーザーの合意後にgenerate_voice_audioを呼んでください。公開前後の状態はresearch://projects/{id}/publicationで確認し、画像binaryの追加、実表示の確認、固定preview、公開操作はWeb UIを案内します。"
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
        renderer_version: z.literal(PRESENTATION_RENDERER_VERSION),
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
            "",
            "## 接続直後",
            "",
            "1. `health`で接続を確認する。",
            "2. `get_access_status`で利用者とscopeを確認する。",
            "3. `list_projects`で本人の研究一覧を取得する。",
            "4. 既存研究なら`get_project_outline`でversionとslide IDを確認する。",
            "5. 一覧が空なら`start_research` promptに沿って一問ずつ対話し、題名と目的に本人が合意してから`create_project`する。",
            "",
            "## 読み取りと変更",
            "",
            "- 研究全体は`research://projects/{id}`、一枚だけなら`research://projects/{id}/slides/{slideId}`を読む。",
            "- 公開準備と公開中版は`research://projects/{id}/publication`で確認し、固定previewの生成・確認・公開操作はWeb UIで行う。",
            "- 変更前に得たversionを`expected_version`へ渡し、成功時に返るversionを次の変更へ引き継ぐ。",
            "- 研究全体やdeck全体を送り直さず、目的別の小粒度toolで一項目・一componentずつ変更する。",
            "- version競合時は対象resourceを読み直し、本人または別画面の変更を上書きしない。",
            "",
            "## AIとWeb UIの役割",
            "",
            "- 問いの深掘り、大きな構成変更、scene componentの追加はAIとの対話で進める。",
            "- 文言・色・組版・VOICEVOX設定の確認、画像追加、実表示の見切れ診断はWeb UIで仕上げる。",
            "- 公開前は合計20分以内を確認し、固定previewを最後まで操作してから確認済みの版を公開する。"
          ].join("\n")
        }
      ]
    })
  );

  registerProjectTools(server, config.DB, getAuthProps);
  registerProjectMutationTools(server, config.DB, getAuthProps);
  registerAssetTools(server, config, getAuthProps);
  registerVoiceTools(server, config, getAuthProps);
  registerResearchGuides(server, config.DB, getAuthProps);

  return server;
}
