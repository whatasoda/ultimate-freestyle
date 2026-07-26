import {
  ResourceTemplate,
  type McpServer
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { twitchGrantPropsSchema } from "../auth/types";
import { getProject } from "./repository";
import { RUBRIC_MARKDOWN } from "./rubric";

function projectResourceBody(
  getAuthProps: () => Record<string, unknown> | undefined,
  requiredScope: "research:read"
): { ownerUserId: string } | { error: string } {
  const parsed = twitchGrantPropsSchema.safeParse(getAuthProps());
  if (!parsed.success || !parsed.data.eligibility.eligible) {
    return { error: "AUTH_REQUIRED" };
  }
  if (!parsed.data.mcp_scopes.includes(requiredScope)) {
    return { error: "SCOPE_REQUIRED" };
  }
  return { ownerUserId: parsed.data.subject_id };
}

export function registerResearchGuides(
  server: McpServer,
  db: D1Database,
  getAuthProps: () => Record<string, unknown> | undefined
): void {
  server.registerResource(
    "research-evaluation-guide",
    "research://guide/evaluation",
    {
      title: "最自由研究 評価基準",
      description: "8観点、NE、根拠、最優先の改善を使う評価ガイドです。",
      mimeType: "text/markdown"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: RUBRIC_MARKDOWN
        }
      ]
    })
  );

  server.registerResource(
    "research-project",
    new ResourceTemplate("research://projects/{id}", { list: undefined }),
    {
      title: "研究プロジェクト",
      description: "認証中の利用者が所有する研究の現在版です。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      if ("error" in auth) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ ok: false, error: { code: auth.error } })
            }
          ]
        };
      }
      const id = variables.id;
      const project =
        typeof id === "string"
          ? await getProject(db, auth.ownerUserId, id)
          : null;
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              project === null
                ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
                : { ok: true, project }
            )
          }
        ]
      };
    }
  );

  server.registerResource(
    "research-project-deck",
    new ResourceTemplate("research://projects/{id}/deck", { list: undefined }),
    {
      title: "研究発表デッキ",
      description: "研究の現在版に含まれる構造化デッキです。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const project =
        !("error" in auth) && typeof id === "string"
          ? await getProject(db, auth.ownerUserId, id)
          : null;
      const body =
        "error" in auth
          ? { ok: false, error: { code: auth.error } }
          : project === null
            ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
            : {
                ok: true,
                project_id: project.project_id,
                version: project.version,
                deck: project.document.deck
              };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(body)
          }
        ]
      };
    }
  );

  server.registerPrompt(
    "start_research",
    {
      title: "最自由研究を始める",
      description: "テーマ探しから一問ずつ研究を具体化します。",
      argsSchema: {
        current_context: z.string().max(4_000).optional()
      }
    },
    ({ current_context }) => ({
      description: "本人の関心を研究へ育てる対話を開始します。",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "最自由研究の伴走者として対話してください。",
              "本人の代わりにテーマを決めず、未回答を推測で確定しないでください。",
              "最初に対象、今日終えたいこと、使える時間を把握し、一度に質問は一問だけにしてください。",
              "各返答は『決まったこと』を短く確認してから『次の質問』を一つ出してください。",
              "3〜5往復または重要事項が固まった時点で、list_projects／get_project／create_project／update_projectを使って記録してください。",
              current_context
                ? `現在ユーザーが伝えている文脈：${current_context}`
                : "現在の文脈はまだありません。"
            ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "review_research",
    {
      title: "研究を根拠付きで評価",
      description: "8観点で現在地を評価し、最優先の改善へ戻します。",
      argsSchema: { project_id: z.string().uuid() }
    },
    ({ project_id }) => ({
      description: "保存済み研究を評価基準に沿ってレビューします。",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `get_projectで${project_id}を取得し、research://guide/evaluationを読んでください。根拠不足はNEとし、各評価にproject内の根拠を示してください。強み、最大のリスク、最優先の改善を一つずつ挙げ、最後は改善につながる質問一問だけで終えてください。`
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "compose_presentation",
    {
      title: "発表デッキを構成",
      description: "研究内容が揃った後に20分以内のWebスライドを構成します。",
      argsSchema: { project_id: z.string().uuid() }
    },
    ({ project_id }) => ({
      description: "研究から画面、読み上げ、BIIM補足を分けて構成します。",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `get_projectで${project_id}を取得してください。きっかけ、問いと予想、方法、決定的な記録、予想との差、結論と限界、次の試行の順で、一枚一メッセージかつ合計20分以内のdeckを作ってください。content_markdownは主張と証拠、narrationは全員に順番に聞かせる説明、sidebar_markdownは読み上げない補足に分けます。無音でも要点が伝わり、未取得の証拠は捏造せず未確定と明記してください。更新前のversionをexpected_versionに使ってupdate_projectで保存してください。`
          }
        }
      ]
    })
  );
}
