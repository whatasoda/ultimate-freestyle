import {
  ResourceTemplate,
  type McpServer
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { twitchGrantPropsSchema } from "../auth/types";
import { getProject, listProjectDraftRevisions } from "./repository";
import { RUBRIC_MARKDOWN } from "./rubric";

const PRESENTATION_COMPONENT_GUIDE = `# 発表scene componentガイド

## 選び方

- 通常は \`scene\` を使う。登録済みcomponentを組み合わせるため、ローカル版に近いリッチな表現と安全な公開を両立できる。
- \`flow\` はタイトル、本文、補足だけで十分な一枚に使う。
- \`canvas\` は絶対位置が必要な単純な図版にだけ使う。sceneとcanvasを一枚の中で混在させることはできない。
- 任意HTML、JavaScript、外部画像URLは入力しない。表示はプラットフォーム管理のrendererが担当する。

## sceneの組み立て

1. \`set_slide_scene\` で一枚をsceneへ切り替える。
2. 最初に \`layer\`、\`stack\`、\`grid\` のいずれかをrootとして追加する。
3. componentを一件ずつ追加し、\`parent_id\` で親layoutを指定する。rootは \`parent_id: null\`。
4. \`order\` は同じ親の中の順番、\`at\` は表示step、\`animation\` は表示時の動き。
5. \`stack\` と \`grid\` の子は自動配置されるため \`frame\` を付けない。\`layer\` の子には百分率の \`frame\` が必要。
6. Web UIの一枚編集画面で実rendererを確認する。

## component一覧

- layout: \`layer\`、\`stack\`、\`grid\` → \`upsert_slide_layout_component\`
- text: \`hero\`、\`markdown\`、\`quote\` → \`upsert_slide_text_component\`
- info: \`card\`、\`metric\`、\`callout\` → \`upsert_slide_info_component\`
- data: \`bar_chart\`、\`timeline\` → \`upsert_slide_data_component\`
- media: project内の \`image\`、\`shape\` → \`upsert_slide_media_component\`
- 配置・見た目の調整: \`update_slide_component\`。本文を再送せず、\`layout\`で親、順番、step、animation、frameを、\`style\`で指定した見た目だけを部分更新する。
- 削除: \`delete_slide_component\`。子があるcomponentは削除できないため、子を移動または削除してから親を削除する。

## 構成例

rootにcolumn方向のstackを置き、その子にhero、row方向のstackを置く。内側のrow stackへmetricとcardを追加すると、見出し・主要数値・根拠を一枚にまとめられる。棒グラフやtimelineのitemもそれぞれ \`at\` を持つため、クリック進行に同期できる。

一度に研究全体やscene全体を送り直さず、成功時に返るversionを次の\`expected_version\`へ渡して一件ずつ更新する。`;

const PRESENTATION_STYLE_GUIDE = `# 発表デザイン・読み上げ設定ガイド

## template

- 最初は \`create_presentation_template\` でvisual presetから一件作る。
- visual presetは \`studio\`、\`paper\`、\`editorial\`、\`neon\`、\`retro-game\`、\`soft-pop\`、\`scientific\`、\`museum\`、\`terminal\`。
- font presetは \`system-sans\`、\`gothic\`、\`rounded\`、\`mincho\`、\`serif\`、\`monospace\`、\`display\`、\`textbook\`、\`handwritten\`、\`condensed\`。任意font名やURLは入力しない。
- 密度は \`spacious\`、\`comfortable\`、\`compact\`、動きの傾向は \`calm\`、\`snappy\`、\`dramatic\`。
- 色、配置、font、密度、animationの調整は \`update_presentation_template_fields\` で変更項目だけを送る。
- 領域配置は単一、左右補足、下段補足に加え、左右均等の \`split\`、上段補足の \`top-band\`、中央集中の \`focus\`を選べる。
- 基本5色に加えて \`accent_secondary\` と \`border\` を指定できる。値は6桁hexだけを使い、任意CSSやgradientは入力しない。

## 発表枠・表紙・0ページ目

- \`configure_deck\` で発表全体の \`16:9\`／\`4:3\`と、開始前の0ページ目だけを部分更新する。
- 0ページ目は画像、生成音声、利用可能なfontをpreloadし、開始クリック後に経過時間と初回読み上げを始める。slide数と進捗には含めない。
- 表紙相当の一枚は \`update_slide_fields\` で \`role: "cover"\` とし、中央の\`center\`、左右分割の\`split\`、写真向けの\`poster\`、余白重視の\`minimal\`、一言強調の\`statement\`、中央帯の\`band\`、左下配置の\`corner\`、額縁の\`frame\`から \`cover_layout\` を選ぶ。sceneやcanvasがある場合は、その自由構成を優先する。

## 一枚ごとの文章組版

- 定型flowは \`update_slide_typography\` で一枚ずつ調整する。短い主張は \`statement\`、通常は \`standard\`、文章主体は \`article\`、まとまりを並べる長文は \`columns\`、資料性を優先する場合は \`dense\`。
- presetだけで本文・見出し倍率、行間、段落間隔、段数、縦横揃えの安全な既定値が決まる。必要な項目だけを追加で上書きし、元へ戻す項目はnull、上書きをまとめて消す場合は \`reset_overrides: true\` を使う。
- \`columns\` は既定2段、最大3段。4:3の3段組みは行長が短くなるため、Web UIの実rendererと見切れ診断を必ず確認する。
- 文章量が多い一枚を自動fitだけで極端に縮小しない。まず組版presetと段数を選び、それでも読めない場合は内容を複数スライドへ分ける。

## 読み上げ表示

- 発表全体の既定値は \`configure_deck\` の \`narration\`、一枚の表示方式と枠は \`configure_slide_narration\` で設定する。
- displayはADV枠の \`dialogue\`、実況風の \`commentary\`、全文追従の \`inline\`、映像字幕の \`subtitle\`、最小表示の \`minimal\`。
- 枠は配置、寸法、文字揃え、話者表示、進捗表示、文字倍率、最大行数だけを安全なtokenで調整する。
- 読み上げ本文は \`set_slide_narration\`、segmentの話者・VOICEVOX profile・調声値は \`update_slide_narration_voice\` で別々に更新する。
- profileの基準調声値だけを変える場合は \`update_voicevox_profile_tuning\` を使う。本文や音声設定が変わると、古い生成音声は無効になる。
- 任意の音声URLは入力できない。音声fileの参照は管理された生成処理だけが設定する。

各toolの成功時に返るversionを、次のtoolの\`expected_version\`へ渡す。`;

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
    "presentation-component-guide",
    "research://guide/presentation-components",
    {
      title: "発表scene componentガイド",
      description:
        "リッチな一枚を小粒度toolで安全に組み立てるためのcomponent一覧と構成規則です。",
      mimeType: "text/markdown"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: PRESENTATION_COMPONENT_GUIDE
        }
      ]
    })
  );

  server.registerResource(
    "presentation-style-guide",
    "research://guide/presentation-style",
    {
      title: "発表デザイン・読み上げ設定ガイド",
      description:
        "安全な見た目preset、font、読み上げ枠、VOICEVOX調声を小粒度toolで編集するガイドです。",
      mimeType: "text/markdown"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: PRESENTATION_STYLE_GUIDE
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

  server.registerResource(
    "research-project-revisions",
    new ResourceTemplate("research://projects/{id}/revisions", {
      list: undefined
    }),
    {
      title: "研究の下書き履歴",
      description:
        "復元前に確認する、認証中の利用者が所有する研究の直近20版です。",
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
                current_version: project.version,
                revisions: await listProjectDraftRevisions(
                  db,
                  auth.ownerUserId,
                  project.project_id,
                  20
                )
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

  server.registerResource(
    "research-project-slide",
    new ResourceTemplate("research://projects/{id}/slides/{slideId}", {
      list: undefined
    }),
    {
      title: "研究発表の一枚",
      description:
        "個別編集前に読む、現在versionと指定スライド一枚だけのデータです。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const slideId = variables.slideId;
      const project =
        !("error" in auth) && typeof id === "string"
          ? await getProject(db, auth.ownerUserId, id)
          : null;
      const slide =
        project !== null && typeof slideId === "string"
          ? project.document.deck?.slides.find((item) => item.id === slideId)
          : undefined;
      const body =
        "error" in auth
          ? { ok: false, error: { code: auth.error } }
          : project === null
            ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
            : slide === undefined
              ? { ok: false, error: { code: "SLIDE_NOT_FOUND" } }
              : {
                  ok: true,
                  project_id: project.project_id,
                  version: project.version,
                  slide
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
              "3〜5往復または重要事項が固まった時点で、list_projects／get_project_outline／create_projectと目的別の小粒度編集toolを使って記録してください。研究全体を送り直さず、変更する項目だけを保存します。",
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
            text: `research://projects/${project_id}とresearch://guide/evaluationを読んでください。根拠不足はNEとし、各評価にproject内の根拠を示してください。強み、最大のリスク、最優先の改善を一つずつ挙げ、最後は改善につながる質問一問だけで終えてください。`
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
            text: `get_project_outlineで${project_id}と現在versionを確認し、必要な内容だけresearch://projects/${project_id}またはresearch://projects/${project_id}/slides/{slideId}から読んでください。research://guide/presentation-componentsとresearch://guide/presentation-styleを読み、きっかけ、問いと予想、方法、決定的な記録、予想との差、結論と限界、次の試行の順で、一枚一メッセージかつ合計20分以内のdeckを作ります。configure_deck、create_presentation_template、create_slide、update_slide_fields、set_slide_reveal、set_slide_narrationを順に使い、文章主体のflowはupdate_slide_typographyでarticle、columns、denseから組版を選びます。各成功時のversionを次のexpected_versionへ渡してください。リッチな一枚はset_slide_sceneへ切り替え、layout、text、info、data、mediaの小粒度toolでcomponentを一件ずつ組み立てます。単純な絶対配置だけが必要な場合はcanvasも選べます。content_markdownまたはscene componentは画面で伝える主張と証拠、revealまたはcomponent.atはクリック段階、narrationは全員に順番に聞かせる説明、sidebar_markdownは読み上げない補足です。見た目は安全なpresetから選び、template、読み上げ枠、音声設定の変更ではそれぞれの小粒度toolを使ってください。無音でも要点が伝わり、未取得の証拠は捏造せず未確定と明記してください。最後にWeb UIの一枚編集画面で実rendererと品質診断を確認してから公開するよう案内してください。`
          }
        }
      ]
    })
  );
}
