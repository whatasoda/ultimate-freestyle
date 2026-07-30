import {
  ResourceTemplate,
  type McpServer
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  VOICEVOX_CATALOG,
  VOICEVOX_CATALOG_REVISION
} from "@ultimate-freestyle/research-schema/voicevox-catalog";
import { z } from "zod";

import { twitchGrantPropsSchema } from "../auth/types";
import { listProjectAssets } from "../assets/repository";
import {
  listPresentationAssetIds,
  PRESENTATION_RENDERER_VERSION
} from "../presentation/render";
import {
  getPublicationStatus,
  MAX_PRESENTATION_ASSETS,
  MAX_PRESENTATION_ASSET_BYTES,
  MAX_PRESENTATION_DURATION_SECONDS
} from "../publications/service";
import { getVoiceProjectStatus } from "../voicevox/service";
import {
  getProject,
  getProjectDraftRevision,
  listProjectDraftRevisions,
  PROJECT_DRAFT_REVISION_BYTE_BUDGET,
  PROJECT_DRAFT_REVISION_LIMIT,
  PROJECT_DRAFT_REVISION_MINIMUM
} from "./repository";
import { RUBRIC_MARKDOWN } from "./rubric";
import { staticSlideQuality } from "./quality";

const PRESENTATION_COMPONENT_GUIDE = `# 発表scene componentガイド

## 選び方

- 通常は \`scene\` を使う。登録済みcomponentを組み合わせるため、ローカル版に近いリッチな表現と安全な公開を両立できる。
- \`flow\` はタイトル、本文、補足だけで十分な一枚に使う。
- \`canvas\` は絶対位置が必要な単純な図版にだけ使う。sceneとcanvasを一枚の中で混在させることはできない。
- 任意HTML、JavaScript、外部画像URLは入力しない。表示はプラットフォーム管理のrendererが担当する。

## canvasの組み立て

1. set_slide_canvasで一枚をcanvasへ切り替える。
2. edit_slide_blockのcreateでmarkdown、image、shapeを安全な既定配置から一件作る。valueはそれぞれ本文、project内のasset UUID、任意のlabel。
3. 同じtoolのupdate_fieldでframe、重なり順、表示step、animation、style、kind固有内容の一項目だけを変更する。
4. 更新前後はelement resourceで対象blockと現在versionを読む。削除だけはdelete_slide_blockを使う。

## sceneの組み立て

1. \`set_slide_scene\` で一枚をsceneへ切り替える。
2. \`create_slide_component\` で最初に \`layer\`、\`stack\`、\`grid\` のいずれかをrootとして追加する。
3. componentを一件ずつ追加し、\`parent_id\` で親layoutを指定する。rootは \`parent_id: null\`。作成後はcomponent resourceを読み、内容を一項目ずつ更新する。
4. \`order\` は同じ親の中の順番、\`at\` は表示step、\`animation\` は表示時の動き。
5. \`stack\` と \`grid\` の子は自動配置されるため \`frame\` を付けない。\`layer\` の子には百分率の \`frame\` が必要。
6. Web UIの一枚編集画面で実rendererを確認する。

## component一覧

- 作成: 全13種類を \`create_slide_component\` で安全な既定値から一件ずつ追加する。imageだけはproject内の \`asset_id\` が必要。
- 内容: \`update_slide_component_content\` で本文、数値、variant、layout固有値のうち一項目だけを更新する。長文は\`text_edit.replace_once\`で現在の短い部分だけを置換する。
- data item: \`edit_slide_data_item\` でbar chartまたはtimelineの項目を一件ずつ追加、更新、移動、削除する。
- 配置・見た目の調整: \`update_slide_component\`。本文を再送せず、\`layout\`で親、順番、step、animation、frameを、\`style\`で指定した見た目だけを部分更新する。
- 削除: \`delete_slide_component\`。子があるcomponentは削除できないため、子を移動または削除してから親を削除する。

## 内容field

- stack: \`direction\`、\`gap_px\`、\`align\`、\`justify\`、\`wrap\`
- grid: \`columns\`、\`gap_px\`、\`align\`
- hero: \`eyebrow\`、\`heading\`、\`subtitle\`、\`align\`
- markdown: \`markdown\`、quote: \`quote\`、\`attribution\`
- card: \`label\`、\`markdown\`、\`variant\`、metric: \`value\`、\`unit\`、\`caption\`、\`emphasis\`
- callout: \`label\`、\`heading\`、\`markdown\`、\`variant\`
- image: \`asset_id\`、\`alt_text\`、\`fit\`、\`caption\`、shape: \`shape\`、\`label\`
- bar_chart本体: \`max_value\`。itemは \`at\`、\`label\`、\`value\`、\`color\`
- timeline item: \`at\`、\`kicker\`、\`heading\`、\`detail\`
- layerとtimeline本体に固有fieldはない。共通配置とstyleだけを変更する。

## 構成例

rootにcolumn方向のstackを置き、その子にhero、row方向のstackを置く。内側のrow stackへmetricとcardを追加すると、見出し・主要数値・根拠を一枚にまとめられる。棒グラフやtimelineのitemもそれぞれ \`at\` を持つため、クリック進行に同期できる。

一度に研究全体やscene全体を送り直さず、\`research://projects/{id}/slides/{slideId}/elements/{elementId}\`で対象一件を読み、成功時に返るversionを次の\`expected_version\`へ渡して一項目ずつ更新する。`;

const PRESENTATION_STYLE_GUIDE = `# 発表デザイン・読み上げ設定ガイド

## template

- 最初は \`create_presentation_template\` でvisual presetから一件作る。
- visual presetは \`studio\`、\`paper\`、\`editorial\`、\`neon\`、\`retro-game\`、\`soft-pop\`、\`scientific\`、\`museum\`、\`terminal\`。
- font presetは \`system-sans\`、\`gothic\`、\`rounded\`、\`mincho\`、\`serif\`、\`monospace\`、\`display\`、\`textbook\`、\`handwritten\`、\`condensed\`。任意font名やURLは入力しない。
- 密度は \`spacious\`、\`comfortable\`、\`compact\`、動きの傾向は \`calm\`、\`snappy\`、\`dramatic\`。
- 色、配置、font、密度、animationの調整はupdate_presentation_template_fieldsのupdatesへfield/valueを最大8件入れ、変更項目だけを送る。
- 領域配置は単一、左右補足、下段補足に加え、左右均等の \`split\`、上段補足の \`top-band\`、中央集中の \`focus\`を選べる。
- 基本5色に加えて \`accent_secondary\` と \`border\` を指定できる。値は6桁hexだけを使い、任意CSSやgradientは入力しない。

## 発表枠・表紙・0ページ目

- \`configure_deck\` で発表全体の \`16:9\`／\`4:3\`と、開始前の0ページ目だけを部分更新する。
- 0ページ目は画像、生成音声、利用可能なfontをpreloadし、開始クリック後に経過時間と初回読み上げを始める。slide数と進捗には含めない。
- 表紙相当の一枚は \`update_slide_fields\` で \`role: "cover"\` とし、中央の\`center\`、左右分割の\`split\`、写真向けの\`poster\`、余白重視の\`minimal\`、一言強調の\`statement\`、中央帯の\`band\`、左下配置の\`corner\`、額縁の\`frame\`から \`cover_layout\` を選ぶ。sceneやcanvasがある場合は、その自由構成を優先する。

## 一枚ごとの文章組版

- flow本文と補足の修正はupdate_slide_fieldsのbody_editsを使う。一文だけ直す場合はtarget、replace_once、現在のold_text、置換後textを送り、本文全体を再送しない。全面差替えはreplace、追記はappend/prepend、補足の削除だけclearを使える。
- 定型flowは \`update_slide_typography\` で一枚ずつ調整する。短い主張は \`statement\`、通常は \`standard\`、文章主体は \`article\`、まとまりを並べる長文は \`columns\`、資料性を優先する場合は \`dense\`。
- presetだけで本文・見出し倍率、行間、段落間隔、段数、縦横揃えの安全な既定値が決まる。必要な項目だけを追加で上書きし、元へ戻す項目はnull、上書きをまとめて消す場合は \`reset_overrides: true\` を使う。
- \`columns\` は既定2段、最大3段。4:3の3段組みは行長が短くなるため、Web UIの実rendererと見切れ診断を必ず確認する。
- 文章量が多い一枚を自動fitだけで極端に縮小しない。まず組版presetと段数を選び、それでも読めない場合は内容を複数スライドへ分ける。

## 読み上げ表示

- 発表全体の既定値は \`configure_deck\` の \`narration\`、一枚の表示方式と枠は \`configure_slide_narration\` で設定する。
- displayはADV枠の \`dialogue\`、実況風の \`commentary\`、全文追従の \`inline\`、映像字幕の \`subtitle\`、最小表示の \`minimal\`。
- 枠は配置、寸法、文字揃え、話者表示、進捗表示、文字倍率、最大行数だけを安全なtokenで調整する。
- 読み上げ本文は \`set_slide_narration\`、segmentの話者・VOICEVOX profile・調声値は \`update_slide_narration_voice\` で別々に更新する。
- VOICEVOXの声は \`research://guide/voicevox-catalog\` から選び、\`set_voicevox_profile\`へ \`catalog_profile_id\` を渡す。話者UUIDやstyle IDは手入力しない。
- profileの基準調声値だけを変える場合は \`update_voicevox_profile_tuning\` を使う。本文や音声設定が変わると、古い生成音声は無効になる。
- 生成数とjobの要約はget_voice_generation_statusまたはresearch://projects/{id}/voice、区間ごとの原稿・実効調声・生成状態はそこから案内される一枚単位のvoice resourceで確認する。
- 任意の音声URLは入力できない。音声fileの参照は管理された生成処理だけが設定する。

各toolの成功時に返るversionを、次のtoolの\`expected_version\`へ渡す。`;

const EDIT_CONTRACT_GUIDE = `# 最自由研究 部分編集契約

1. 最初に \`get_project_outline\` で対象と現在versionを読む。
2. 研究本文はresearch://projects/{id}/research、発見・限界・ログはそのpage resource、スライドはslide resource、scene/canvasの一件はelement resourceを読み、変更対象と現在値を特定する。
3. 一回のtool callでは一つの意図だけを変更し、成功応答のversionを次の \`expected_version\` へ渡す。
4. \`PROJECT_VERSION_CONFLICT\` では古い入力をそのまま再送せず、resourceを読み直して利用者または別Agentの変更を残した差分を作り直す。
5. 研究本文は \`update_project_fields.text_edits\`、スライド長文は \`update_slide_fields.body_edits\` の \`replace_once\` と \`old_text\` を使う。scene本文は \`update_slide_component_content\`、グラフ・timelineの一件は \`edit_slide_data_item\` を使い、長文・デッキ・scene全体を再送しない。
6. delete toolと \`edit_slide_data_item.action: delete\` は情報を取り除く。対象resourceを直前に確認し、利用者の意図に含まれる場合だけ実行する。
7. Web UIの未保存入力はMCPから見えない。公開前に利用者へ保存と実表示診断を案内する。

復元は \`research://projects/{id}/revisions\` の \`selection_workflow\` に従い、候補の詳細と必要な一枚を比較してから \`restore_draft_revision\` を使う。`;

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

function resourceTextPreview(value: string | null, limit: number): string | null {
  if (value === null || value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
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
    "research-edit-contract-guide",
    "research://guide/edit-contract",
    {
      title: "最自由研究 部分編集契約",
      description:
        "AI Agentが小粒度toolを競合や意図しない削除なしに連続実行するための読取・version・部分編集規則です。",
      mimeType: "text/markdown"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: EDIT_CONTRACT_GUIDE
        }
      ]
    })
  );

  server.registerResource(
    "voicevox-catalog",
    "research://guide/voicevox-catalog",
    {
      title: "VOICEVOX話者・スタイルカタログ",
      description:
        "set_voicevox_profileで選べる管理済みprofile ID、話者名、スタイル名の一覧です。",
      mimeType: "application/json"
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            catalog_revision: VOICEVOX_CATALOG_REVISION,
            profiles: VOICEVOX_CATALOG.map((profile) => ({
              id: profile.id,
              label: profile.label,
              speaker_name: profile.speakerName,
              style_name: profile.styleName
            }))
          })
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
      const body = project === null
        ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
        : {
            ok: true,
            project: {
              project_id: project.project_id,
              version: project.version,
              title: project.document.title,
              stage: project.document.stage,
              updated_at: project.updated_at,
              created_at: project.created_at,
              research_uri: `research://projects/${project.project_id}/research`,
              deck_uri: `research://projects/${project.project_id}/deck`,
              quality_uri: `research://projects/${project.project_id}/quality`,
              publication_uri: `research://projects/${project.project_id}/publication`,
              voice_uri: `research://projects/${project.project_id}/voice`,
              revisions_uri: `research://projects/${project.project_id}/revisions`,
              counts: {
                findings: project.document.findings.length,
                limitations: project.document.limitations.length,
                logs: project.document.logs.length,
                slides: project.document.deck?.slides.length ?? 0
              }
            }
          };
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body) }]
      };
    }
  );

  server.registerResource(
    "research-project-content",
    new ResourceTemplate("research://projects/{id}/research", { list: undefined }),
    {
      title: "研究本文と記録索引",
      description: "研究本文と、発見・限界・ログを10件ずつ読むpage URIです。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const project = !("error" in auth) && typeof id === "string"
        ? await getProject(db, auth.ownerUserId, id)
        : null;
      const body = "error" in auth
        ? { ok: false, error: { code: auth.error } }
        : project === null
          ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
          : {
              ok: true,
              project_id: project.project_id,
              version: project.version,
              research: {
                title: project.document.title,
                stage: project.document.stage,
                summary: project.document.summary,
                question: project.document.question,
                hypothesis: project.document.hypothesis,
                method: project.document.method
              },
              collections: {
                findings: {
                  count: project.document.findings.length,
                  page_size: 10,
                  pages: Math.ceil(project.document.findings.length / 10),
                  uri_template: `research://projects/${project.project_id}/research/findings/pages/{page}`
                },
                limitations: {
                  count: project.document.limitations.length,
                  page_size: 10,
                  pages: Math.ceil(project.document.limitations.length / 10),
                  uri_template: `research://projects/${project.project_id}/research/limitations/pages/{page}`
                },
                logs: {
                  count: project.document.logs.length,
                  page_size: 10,
                  pages: Math.ceil(project.document.logs.length / 10),
                  uri_template: `research://projects/${project.project_id}/research/logs/pages/{page}`
                }
              }
            };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body) }] };
    }
  );

  server.registerResource(
    "research-project-content-page",
    new ResourceTemplate("research://projects/{id}/research/{section}/pages/{page}", { list: undefined }),
    {
      title: "研究記録の1page",
      description: "発見、限界、研究ログのうち指定した10件だけを取得します。pageは1から始まります。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const section = variables.section;
      const page = typeof variables.page === "string" && /^\d+$/.test(variables.page)
        ? Number(variables.page)
        : 0;
      const project = !("error" in auth) && typeof id === "string"
        ? await getProject(db, auth.ownerUserId, id)
        : null;
      const validSection = section === "findings" || section === "limitations" || section === "logs";
      let body: unknown;
      if ("error" in auth) body = { ok: false, error: { code: auth.error } };
      else if (project === null) body = { ok: false, error: { code: "PROJECT_NOT_FOUND" } };
      else if (!validSection || page < 1) body = { ok: false, error: { code: "INVALID_RESOURCE_URI" } };
      else {
        const source = project.document[section];
        const pageSize = 10;
        const pageCount = Math.ceil(source.length / pageSize);
        if (page > Math.max(1, pageCount)) {
          body = { ok: false, error: { code: "PAGE_NOT_FOUND" } };
        } else {
          const start = (page - 1) * pageSize;
          body = {
            ok: true,
            project_id: project.project_id,
            version: project.version,
            section,
            page,
            page_size: pageSize,
            total_items: source.length,
            total_pages: pageCount,
            previous_uri: page > 1
              ? `research://projects/${project.project_id}/research/${section}/pages/${page - 1}`
              : null,
            next_uri: page < pageCount
              ? `research://projects/${project.project_id}/research/${section}/pages/${page + 1}`
              : null,
            items: source.slice(start, start + pageSize).map((item, index) => ({
              position: start + index + 1,
              ...(typeof item === "string" ? { text: item } : { log: item })
            }))
          };
        }
      }
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body) }] };
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
            : (() => {
                const deck = project.document.deck;
                if (deck === null) {
                  return { ok: true, project_id: project.project_id, version: project.version, deck: null };
                }
                const { slides, ...settings } = deck;
                return {
                  ok: true,
                  project_id: project.project_id,
                  version: project.version,
                  deck: {
                    settings,
                    slide_count: slides.length,
                    total_duration_seconds: slides.reduce((sum, slide) => sum + slide.duration_seconds, 0),
                    slides: slides.map((slide, index) => ({
                      slide_id: slide.id,
                      position: index + 1,
                      title: slide.title,
                      role: slide.role,
                      duration_seconds: slide.duration_seconds,
                      reveal_steps: slide.reveal_steps,
                      composition_mode: slide.composition?.mode ?? "flow",
                      narration_segments: slide.narration?.segments.length ?? 0,
                      uri: `research://projects/${project.project_id}/slides/${slide.id}`
                    }))
                  }
                };
              })();
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
        "復元前に確認する、認証中の利用者が所有する研究の保存対象です。最大件数と容量の範囲で新しい版を優先し、一版resourceと一枚resourceで差を確認してから復元します。",
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
                retention: {
                  maximum_versions: PROJECT_DRAFT_REVISION_LIMIT,
                  guaranteed_recent_versions: PROJECT_DRAFT_REVISION_MINIMUM,
                  byte_budget: PROJECT_DRAFT_REVISION_BYTE_BUDGET
                },
                selection_workflow: {
                  revision_detail_uri_template: `research://projects/${project.project_id}/revisions/{version}`,
                  revision_slide_uri_template: `research://projects/${project.project_id}/revisions/{version}/slides/{slideId}`,
                  current_project_uri: `research://projects/${project.project_id}`,
                  restore_tool: "restore_draft_revision"
                },
                revisions: await listProjectDraftRevisions(db, auth.ownerUserId, project.project_id, PROJECT_DRAFT_REVISION_LIMIT)
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
    "research-project-revision",
    new ResourceTemplate("research://projects/{id}/revisions/{version}", {
      list: undefined
    }),
    {
      title: "研究の下書き一版",
      description:
        "復元前に読む、過去版の研究内容、発表設定、スライド要約と現在版との差です。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const versionValue = variables.version;
      const version = typeof versionValue === "string" && /^\d+$/.test(versionValue)
        ? Number(versionValue)
        : null;
      const [current, revision] = !(
        "error" in auth
      ) && typeof id === "string" && version !== null
        ? await Promise.all([
            getProject(db, auth.ownerUserId, id),
            getProjectDraftRevision(db, auth.ownerUserId, id, version)
          ])
        : [null, null];
      let body: Record<string, unknown>;
      if ("error" in auth) {
        body = { ok: false, error: { code: auth.error } };
      } else if (typeof id !== "string" || version === null) {
        body = { ok: false, error: { code: "INVALID_RESOURCE_URI" } };
      } else if (current === null) {
        body = { ok: false, error: { code: "PROJECT_NOT_FOUND" } };
      } else if (revision === null) {
        body = { ok: false, error: { code: "REVISION_NOT_FOUND" } };
      } else {
        const selected = revision.document;
        const currentDocument = current.document;
        const selectedSlides = selected.deck?.slides ?? [];
        const currentSlides = currentDocument.deck?.slides ?? [];
        const currentById = new Map(currentSlides.map((slide, index) => [slide.id, { slide, index }]));
        const selectedIds = new Set(selectedSlides.map((slide) => slide.id));
        const researchFields = [
          "title",
          "stage",
          "summary",
          "question",
          "hypothesis",
          "method",
          "findings",
          "limitations",
          "logs"
        ] as const;
        const deckFields = [
          "short_title",
          "description",
          "author",
          "year",
          "accent",
          "layout",
          "aspect_ratio",
          "loading_screen",
          "templates",
          "default_template_id",
          "narration_defaults",
          "voicevox"
        ] as const;
        const changedResearchFields = researchFields.filter(
          (field) => JSON.stringify(selected[field]) !== JSON.stringify(currentDocument[field])
        );
        const changedDeckFields = deckFields.filter(
          (field) => JSON.stringify(selected.deck?.[field] ?? null) !== JSON.stringify(currentDocument.deck?.[field] ?? null)
        );
        const slideSummaries = selectedSlides.map((slide, index) => {
          const currentMatch = currentById.get(slide.id);
          return {
            slide_id: slide.id,
            title: slide.title,
            position: index + 1,
            current_position: currentMatch === undefined ? null : currentMatch.index + 1,
            state: currentMatch === undefined
              ? "revision_only"
              : JSON.stringify(currentMatch.slide) !== JSON.stringify(slide)
                ? "changed"
                : currentMatch.index !== index
                  ? "reordered"
                  : "unchanged"
          };
        });
        const selectedDuration = selectedSlides.reduce((sum, slide) => sum + slide.duration_seconds, 0);
        const currentDuration = currentSlides.reduce((sum, slide) => sum + slide.duration_seconds, 0);
        body = {
          ok: true,
          project_id: current.project_id,
          current_version: current.version,
          revision: {
            version: revision.version,
            source: revision.source,
            created_at: revision.created_at,
            research: {
              title: selected.title,
              stage: selected.stage,
              summary: resourceTextPreview(selected.summary, 500),
              question: resourceTextPreview(selected.question, 500),
              hypothesis: resourceTextPreview(selected.hypothesis, 500),
              method: resourceTextPreview(selected.method, 1_000),
              findings: {
                count: selected.findings.length,
                previews: selected.findings.slice(0, 10).map((item) => resourceTextPreview(item, 300))
              },
              limitations: {
                count: selected.limitations.length,
                previews: selected.limitations.slice(0, 10).map((item) => resourceTextPreview(item, 300))
              },
              log_count: selected.logs.length,
              recent_logs: selected.logs.slice(-5).map((log) => ({
                id: log.id,
                occurred_at: log.occurred_at,
                kind: log.kind,
                text: resourceTextPreview(log.text, 300),
                source_url: log.source_url
              }))
            },
            presentation: selected.deck === null ? null : {
              settings: {
                short_title: selected.deck.short_title,
                description: selected.deck.description,
                author: selected.deck.author,
                year: selected.deck.year,
                accent: selected.deck.accent,
                layout: selected.deck.layout,
                aspect_ratio: selected.deck.aspect_ratio ?? "16:9",
                loading_screen: selected.deck.loading_screen ?? null,
                default_template_id: selected.deck.default_template_id ?? null,
                templates: (selected.deck.templates ?? []).map((template) => ({
                  id: template.id,
                  name: template.name,
                  region_layout: template.region_layout,
                  visual_preset: template.visual_preset,
                  body_font: template.body_font,
                  heading_font: template.heading_font,
                  density: template.density,
                  motion_style: template.motion_style
                })),
                narration_defaults: selected.deck.narration_defaults,
                voicevox: selected.deck.voicevox === null || selected.deck.voicevox === undefined
                  ? null
                  : {
                      catalog_revision: selected.deck.voicevox.catalog_revision,
                      default_profile_id: selected.deck.voicevox.default_profile_id,
                      profiles: selected.deck.voicevox.profiles.map((profile) => ({
                        id: profile.id,
                        label: profile.label,
                        speaker_name: profile.speaker_name,
                        style_name: profile.style_name,
                        tuning: profile.tuning
                      }))
                    }
              },
              slide_count: selectedSlides.length,
              total_duration_seconds: selectedDuration,
              slides: slideSummaries
            }
          },
          diff: {
            research_fields: changedResearchFields,
            presentation_settings: changedDeckFields,
            changed_slide_ids: slideSummaries.filter((slide) => slide.state === "changed").map((slide) => slide.slide_id),
            reordered_slide_ids: slideSummaries.filter((slide) => slide.state === "reordered").map((slide) => slide.slide_id),
            revision_only_slide_ids: slideSummaries.filter((slide) => slide.state === "revision_only").map((slide) => slide.slide_id),
            current_only_slides: currentSlides
              .filter((slide) => !selectedIds.has(slide.id))
              .map((slide) => ({ slide_id: slide.id, title: slide.title, current_position: currentSlides.indexOf(slide) + 1 })),
            finding_count_delta: selected.findings.length - currentDocument.findings.length,
            limitation_count_delta: selected.limitations.length - currentDocument.limitations.length,
            log_count_delta: selected.logs.length - currentDocument.logs.length,
            duration_delta_seconds: selectedDuration - currentDuration
          },
          web_url: `https://saijiyu-kenkyu.2764.moe/dashboard/projects/${current.project_id}/revisions/${revision.version}`
        };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(body)
        }]
      };
    }
  );

  server.registerResource(
    "research-project-revision-slide",
    new ResourceTemplate(
      "research://projects/{id}/revisions/{version}/slides/{slideId}",
      { list: undefined }
    ),
    {
      title: "研究の下書き一版にあるスライド",
      description:
        "過去版の指定スライド一枚と、現在版にある同一IDのスライドとの差です。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const slideId = variables.slideId;
      const versionValue = variables.version;
      const version = typeof versionValue === "string" && /^\d+$/.test(versionValue)
        ? Number(versionValue)
        : null;
      const [current, revision] = !("error" in auth) && typeof id === "string" && version !== null
        ? await Promise.all([
            getProject(db, auth.ownerUserId, id),
            getProjectDraftRevision(db, auth.ownerUserId, id, version)
          ])
        : [null, null];
      const selectedSlide = revision !== null && typeof slideId === "string"
        ? revision.document.deck?.slides.find((slide) => slide.id === slideId)
        : undefined;
      const currentSlide = current !== null && typeof slideId === "string"
        ? current.document.deck?.slides.find((slide) => slide.id === slideId)
        : undefined;
      const body = "error" in auth
        ? { ok: false, error: { code: auth.error } }
        : typeof id !== "string" || typeof slideId !== "string" || version === null
          ? { ok: false, error: { code: "INVALID_RESOURCE_URI" } }
          : current === null
            ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
            : revision === null
              ? { ok: false, error: { code: "REVISION_NOT_FOUND" } }
              : selectedSlide === undefined
                ? { ok: false, error: { code: "SLIDE_NOT_FOUND" } }
                : {
                    ok: true,
                    project_id: current.project_id,
                    current_version: current.version,
                    revision_version: revision.version,
                    slide: selectedSlide,
                    comparison: {
                      state: currentSlide === undefined
                        ? "revision_only"
                        : JSON.stringify(currentSlide) === JSON.stringify(selectedSlide)
                          ? "unchanged"
                          : "changed",
                      current_slide_uri: currentSlide === undefined
                        ? null
                        : `research://projects/${current.project_id}/slides/${slideId}`
                    }
                  };
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(body)
        }]
      };
    }
  );

  server.registerResource(
    "research-project-quality",
    new ResourceTemplate("research://projects/{id}/quality", {
      list: undefined
    }),
    {
      title: "研究発表の品質事前検査",
      description:
        "文章量、表、タイトル、読み上げ時間の静的警告と、実rendererで確認するWeb導線を取得します。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const project = !("error" in auth) && typeof id === "string"
        ? await getProject(db, auth.ownerUserId, id)
        : null;
      const deck = project?.document.deck ?? null;
      const slides = deck?.slides.map((slide, index) => ({
        slide_id: slide.id,
        slide_number: index + 1,
        title: slide.title,
        warnings: staticSlideQuality(slide, deck.aspect_ratio ?? "16:9", deck.voicevox),
        web_url: `https://saijiyu-kenkyu.2764.moe/dashboard/projects/${project?.project_id}/slides/${slide.id}`
      })) ?? [];
      const warningCount = slides.reduce((sum, slide) => sum + slide.warnings.length, 0);
      const body = "error" in auth
        ? { ok: false, error: { code: auth.error } }
        : project === null
          ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
          : {
              ok: true,
              project_id: project.project_id,
              version: project.version,
              renderer_version: PRESENTATION_RENDERER_VERSION,
              static_checks: {
                status: warningCount > 0 ? "needs_changes" : "ready_for_render_review",
                warning_count: warningCount,
                slides
              },
              rendered_checks: {
                required: true,
                available_in_mcp: false,
                checks: ["見切れ", "自動縮小率", "文字コントラスト", "読み上げ文の省略", "実文字サイズ", "表示パーツの重なり"],
                reason: "DOMの実寸、font、画像、アニメーションを含む検査は保存データだけでは確定できません。",
                web_url: `https://saijiyu-kenkyu.2764.moe/dashboard/projects/${project.project_id}`,
                requires_session: true
              },
              next_action: warningCount > 0 ? "fix_static_warnings" : "run_rendered_quality_sweep"
            };
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(body)
        }]
      };
    }
  );

  server.registerResource(
    "research-project-publication",
    new ResourceTemplate("research://projects/{id}/publication", {
      list: undefined
    }),
    {
      title: "研究発表の公開状態",
      description:
        "固定プレビュー、確認、公開中版と再確認要否を小さく取得します。公開操作はWeb UIで行います。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const [status, project, voice, assets] = !("error" in auth) && typeof id === "string"
        ? await Promise.all([
            getPublicationStatus(db, auth.ownerUserId, id),
            getProject(db, auth.ownerUserId, id),
            getVoiceProjectStatus(db, auth.ownerUserId, id),
            listProjectAssets(db, auth.ownerUserId, id)
          ])
        : [null, null, null, []];
      const latest = status?.latest_preview ?? null;
      const previewCurrent = status !== null && latest !== null &&
        latest.project_version === status.draft_version &&
        latest.renderer_version === status.current_renderer_version;
      const publishedCurrent = status !== null && status.published !== null &&
        status.published.project_version === status.draft_version &&
        status.published.renderer_version === status.current_renderer_version;
      const slideCount = project?.document.deck?.slides.length ?? 0;
      const durationSeconds = project?.document.deck?.slides.reduce(
        (sum, slide) => sum + slide.duration_seconds,
        0
      ) ?? 0;
      const assetIds = project === null ? [] : listPresentationAssetIds(project);
      const assetsById = new Map(assets.map((asset) => [asset.asset_id, asset]));
      const missingAssetIds = assetIds.filter((assetId) => !assetsById.has(assetId));
      const assetBytes = assetIds.reduce(
        (sum, assetId) => sum + (assetsById.get(assetId)?.byte_size ?? 0),
        0
      );
      const assetBlockers = [
        ...(assetIds.length > MAX_PRESENTATION_ASSETS
          ? [{
              code: "PRESENTATION_ASSET_LIMIT",
              message: `発表で使用する画像を${MAX_PRESENTATION_ASSETS}件以内に減らしてください。`,
              count: assetIds.length,
              limit: MAX_PRESENTATION_ASSETS
            }]
          : []),
        ...(missingAssetIds.length > 0
          ? [{
              code: "PRESENTATION_ASSET_NOT_FOUND",
              message: `${missingAssetIds.length}件の参照画像が研究内に見つかりません。`,
              asset_ids: missingAssetIds.slice(0, 10),
              omitted_count: Math.max(0, missingAssetIds.length - 10)
            }]
          : []),
        ...(assetBytes > MAX_PRESENTATION_ASSET_BYTES
          ? [{
              code: "PRESENTATION_ASSET_LIMIT",
              message: "発表で使用する画像を合計30MiB以内に減らしてください。",
              byte_size: assetBytes,
              limit_bytes: MAX_PRESENTATION_ASSET_BYTES
            }]
          : [])
      ];
      const previewBlockers = [
        ...(slideCount === 0
          ? [{ code: "DECK_REQUIRED", message: "プレビューには1枚以上のスライドが必要です。" }]
          : []),
        ...assetBlockers,
        ...(voice?.configured && voice.summary.ready !== voice.summary.total
          ? [{
              code: "VOICE_INCOMPLETE",
              message: `VOICEVOX音声が${voice.summary.ready}/${voice.summary.total}区間まで生成されています。`,
              ready: voice.summary.ready,
              total: voice.summary.total
            }]
          : [])
      ];
      const publishBlockers = [
        ...previewBlockers,
        ...(durationSeconds > MAX_PRESENTATION_DURATION_SECONDS
          ? [{
              code: "PRESENTATION_DURATION_EXCEEDED",
              message: "想定発表時間を20分以内に短縮してください。",
              duration_seconds: durationSeconds,
              limit_seconds: MAX_PRESENTATION_DURATION_SECONDS
            }]
          : []),
        ...(!previewCurrent
          ? [{ code: "PREVIEW_REQUIRED", message: "現在版の固定プレビューを作成してください。" }]
          : latest?.reviewed_at === null
            ? [{ code: "PREVIEW_NOT_REVIEWED", message: "固定プレビューを最後の終了画面まで確認してください。" }]
            : [])
      ];
      const contentBlocked = previewBlockers.length > 0 ||
        durationSeconds > MAX_PRESENTATION_DURATION_SECONDS;
      const nextAction = contentBlocked
        ? "fix_blockers"
        : !previewCurrent
          ? "create_preview"
          : latest?.reviewed_at === null
            ? "review_preview"
            : publishedCurrent
              ? "complete"
              : "publish";
      const body =
        "error" in auth
          ? { ok: false, error: { code: auth.error } }
          : status === null
            ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
            : {
                ok: true,
                project_id: status.project_id,
                draft_version: status.draft_version,
                current_renderer_version: status.current_renderer_version,
                slug: status.slug,
                latest_preview: latest === null ? null : {
                  revision_id: latest.revision_id,
                  project_version: latest.project_version,
                  renderer_version: latest.renderer_version,
                  created_at: latest.created_at,
                  reviewed_at: latest.reviewed_at
                },
                published: status.published === null ? null : {
                  revision_id: status.published.revision_id,
                  project_version: status.published.project_version,
                  renderer_version: status.published.renderer_version,
                  published_at: status.published.published_at
                },
                readiness: {
                  needs_preview: !previewCurrent,
                  needs_review: previewCurrent && latest.reviewed_at === null,
                  can_publish: previewCurrent && latest.reviewed_at !== null && !publishedCurrent && publishBlockers.length === 0,
                  published_current: publishedCurrent,
                  next_action: nextAction,
                  preview_blockers: previewBlockers,
                  publish_blockers: publishBlockers,
                  asset_preflight: {
                    referenced_count: assetIds.length,
                    found_count: assetIds.length - missingAssetIds.length,
                    byte_size: assetBytes,
                    count_limit: MAX_PRESENTATION_ASSETS,
                    byte_limit: MAX_PRESENTATION_ASSET_BYTES
                  },
                  runtime_checks: [
                    "参照画像のR2実体",
                    "生成音声の合計100MiB上限",
                    "生成HTMLの2MiB上限"
                  ]
                },
                web: {
                  dashboard: {
                    url: `https://saijiyu-kenkyu.2764.moe/dashboard/projects/${status.project_id}`,
                    requires_session: true
                  },
                  preview: latest === null ? null : {
                    url: `https://saijiyu-kenkyu.2764.moe/preview/${latest.revision_id}`,
                    requires_session: true
                  },
                  public: status.published === null || status.slug === null ? null : {
                    url: `https://saijiyu-kenkyu.2764.moe/p/${status.slug}`,
                    requires_session: false
                  }
                },
                recent_events: status.events.slice(0, 5)
              };
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(body)
        }]
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
                  slide: (() => {
                    const {
                      content_markdown,
                      sidebar_markdown,
                      reveal_blocks,
                      narration,
                      composition,
                      ...fields
                    } = slide;
                    const baseUri = `research://projects/${project.project_id}/slides/${slide.id}`;
                    return {
                      ...fields,
                      content: {
                        content_characters: content_markdown.length,
                        sidebar_characters: sidebar_markdown?.length ?? 0,
                        uri: `${baseUri}/content`
                      },
                      reveals: reveal_blocks.map((block) => ({
                        at: block.at,
                        preview: resourceTextPreview(block.markdown, 160),
                        uri: `${baseUri}/reveals/${block.at}`
                      })),
                      narration: narration === null
                        ? null
                        : {
                            display: narration.display,
                            speaker: narration.speaker,
                            appearance: narration.appearance,
                            segments: narration.segments.map((segment) => ({
                              at: segment.at,
                              preview: resourceTextPreview(segment.text, 160),
                              has_generated_audio: segment.audio_src !== null,
                              uri: `${baseUri}/narration/${segment.at}`
                            }))
                          },
                      composition: composition === null || composition === undefined
                        ? null
                        : {
                            mode: composition.mode,
                            background: composition.background,
                            clip_content: composition.clip_content,
                            elements: composition.mode === "scene"
                              ? composition.nodes.map((element) => ({
                                  id: element.id,
                                  kind: element.kind,
                                  at: element.at,
                                  parent_id: element.parent_id,
                                  order: element.order,
                                  frame: element.frame,
                                  uri: `${baseUri}/elements/${element.id}`
                                }))
                              : composition.blocks.map((element) => ({
                                  id: element.id,
                                  kind: element.kind,
                                  at: element.at,
                                  z_index: element.z_index,
                                  frame: element.frame,
                                  uri: `${baseUri}/elements/${element.id}`
                                }))
                          }
                    };
                  })()
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
    "research-project-slide-content",
    new ResourceTemplate("research://projects/{id}/slides/{slideId}/content", { list: undefined }),
    {
      title: "スライド本文と補足",
      description: "指定した一枚の画面本文と読み上げない補足だけを取得します。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const slideId = variables.slideId;
      const project = !("error" in auth) && typeof id === "string"
        ? await getProject(db, auth.ownerUserId, id)
        : null;
      const slide = project?.document.deck?.slides.find((item) => item.id === slideId);
      const body = "error" in auth
        ? { ok: false, error: { code: auth.error } }
        : project === null
          ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
          : slide === undefined
            ? { ok: false, error: { code: "SLIDE_NOT_FOUND" } }
            : {
                ok: true,
                project_id: project.project_id,
                version: project.version,
                slide_id: slide.id,
                content_markdown: slide.content_markdown,
                sidebar_markdown: slide.sidebar_markdown
              };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body) }] };
    }
  );

  server.registerResource(
    "research-project-slide-reveal",
    new ResourceTemplate("research://projects/{id}/slides/{slideId}/reveals/{at}", { list: undefined }),
    {
      title: "段階表示一件",
      description: "指定した一枚・STEPの段階表示本文だけを取得します。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const slideId = variables.slideId;
      const at = typeof variables.at === "string" && /^\d+$/.test(variables.at) ? Number(variables.at) : -1;
      const project = !("error" in auth) && typeof id === "string"
        ? await getProject(db, auth.ownerUserId, id)
        : null;
      const slide = project?.document.deck?.slides.find((item) => item.id === slideId);
      const reveal = slide?.reveal_blocks.find((item) => item.at === at);
      const body = "error" in auth
        ? { ok: false, error: { code: auth.error } }
        : project === null
          ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
          : slide === undefined
            ? { ok: false, error: { code: "SLIDE_NOT_FOUND" } }
            : reveal === undefined
              ? { ok: false, error: { code: "REVEAL_NOT_FOUND" } }
              : { ok: true, project_id: project.project_id, version: project.version, slide_id: slide.id, reveal };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body) }] };
    }
  );

  server.registerResource(
    "research-project-slide-narration-segment",
    new ResourceTemplate("research://projects/{id}/slides/{slideId}/narration/{at}", { list: undefined }),
    {
      title: "読み上げ区間一件",
      description: "指定した一枚・STEPの読み上げ文、声、調声、生成音声参照だけを取得します。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const slideId = variables.slideId;
      const at = typeof variables.at === "string" && /^\d+$/.test(variables.at) ? Number(variables.at) : -1;
      const project = !("error" in auth) && typeof id === "string"
        ? await getProject(db, auth.ownerUserId, id)
        : null;
      const slide = project?.document.deck?.slides.find((item) => item.id === slideId);
      const segment = slide?.narration?.segments.find((item) => item.at === at);
      const body = "error" in auth
        ? { ok: false, error: { code: auth.error } }
        : project === null
          ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
          : slide === undefined
            ? { ok: false, error: { code: "SLIDE_NOT_FOUND" } }
            : segment === undefined
              ? { ok: false, error: { code: "NARRATION_SEGMENT_NOT_FOUND" } }
              : { ok: true, project_id: project.project_id, version: project.version, slide_id: slide.id, segment };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(body) }] };
    }
  );

  server.registerResource(
    "research-project-slide-element",
    new ResourceTemplate(
      "research://projects/{id}/slides/{slideId}/elements/{elementId}",
      { list: undefined }
    ),
    {
      title: "研究発表の表示要素一件",
      description:
        "部分更新前に読む、指定したscene componentまたはcanvas block一件と現在versionです。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const auth = projectResourceBody(getAuthProps, "research:read");
      const id = variables.id;
      const slideId = variables.slideId;
      const elementId = variables.elementId;
      const project =
        !("error" in auth) && typeof id === "string"
          ? await getProject(db, auth.ownerUserId, id)
          : null;
      const slide =
        project !== null && typeof slideId === "string"
          ? project.document.deck?.slides.find((item) => item.id === slideId)
          : undefined;
      const element = slide?.composition !== null &&
          slide?.composition !== undefined &&
          typeof elementId === "string"
        ? slide.composition.mode === "scene"
          ? slide.composition.nodes.find((item) => item.id === elementId)
          : slide.composition.blocks.find((item) => item.id === elementId)
        : undefined;
      const body =
        "error" in auth
          ? { ok: false, error: { code: auth.error } }
          : project === null
            ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
            : slide === undefined
              ? { ok: false, error: { code: "SLIDE_NOT_FOUND" } }
              : element === undefined
                ? {
                    ok: false,
                    error: {
                      code:
                        slide.composition?.mode === "canvas"
                          ? "BLOCK_NOT_FOUND"
                          : "COMPONENT_NOT_FOUND"
                    }
                  }
                : {
                    ok: true,
                    project_id: project.project_id,
                    version: project.version,
                    slide_id: slide.id,
                    element_type:
                      slide.composition?.mode === "canvas" ? "block" : "component",
                    element
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
            text: `research://projects/${project_id}/researchとresearch://guide/evaluationを読んでください。発見・限界・ログは各collectionのpage URIから必要な範囲だけ取得してください。根拠不足はNEとし、各評価にproject内の根拠を示してください。強み、最大のリスク、最優先の改善を一つずつ挙げ、最後は改善につながる質問一問だけで終えてください。`
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
            text: `get_project_outlineで${project_id}と現在versionを確認し、研究本文はresearch://projects/${project_id}/research、発見・限界・ログはそこにあるpage URI、既存の一枚はresearch://projects/${project_id}/slides/{slideId}から必要な範囲だけ読んでください。research://guide/edit-contract、research://guide/presentation-components、research://guide/presentation-styleを読み、きっかけ、問いと予想、方法、決定的な記録、予想との差、結論と限界、次の試行の順で、一枚一メッセージかつ合計20分以内のdeckを作ります。configure_deck、create_presentation_template、create_slide、update_slide_fields、set_slide_reveal、set_slide_narrationを順に使い、文章主体のflowはupdate_slide_typographyでarticle、columns、denseから組版を選びます。各成功時のversionを次のexpected_versionへ渡してください。リッチな一枚はset_slide_sceneへ切り替え、layout、text、info、data、mediaの小粒度toolでcomponentを一件ずつ組み立てます。単純な絶対配置だけが必要な場合はcanvasも選べます。content_markdownまたはscene componentは画面で伝える主張と証拠、revealまたはcomponent.atはクリック段階、narrationは全員に順番に聞かせる説明、sidebar_markdownは読み上げない補足です。見た目は安全なpresetから選び、template、読み上げ枠、音声設定の変更ではそれぞれの小粒度toolを使ってください。無音でも要点が伝わり、未取得の証拠は捏造せず未確定と明記してください。最後にWeb UIの一枚編集画面で実rendererと品質診断を確認してから公開するよう案内してください。`
          }
        }
      ]
    })
  );
}
