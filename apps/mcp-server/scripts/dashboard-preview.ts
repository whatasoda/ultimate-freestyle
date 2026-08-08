import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DASHBOARD_ASSET_VERSION, DASHBOARD_SCRIPT } from "../src/web/assets";
import {
  dashboardPage,
  dashboardStyleResponse,
  dataHandlingPage,
  landingPage,
  projectDetailPage,
  slideReviewPage,
  slideWorkspacePage,
  userGuidePage,
  voiceFinishPage
} from "../src/web/pages";
import { PRESENTATION_RENDERER_VERSION } from "../src/presentation/render";
import { projectRecordSchema } from "../src/projects/schema";
import type { DashboardProjectSummary } from "../src/projects/repository";
import type { PublicationStatus } from "../src/publications/service";

const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../work/dashboard-preview"
);

const PROJECT_ID = "63ab1ec4-20a0-4cf6-a1a0-f74ced56778a";
const LOGIN = "researcher";
const CSRF = "preview-csrf-token";

const project = projectRecordSchema.parse({
  project_id: PROJECT_ID,
  version: 12,
  created_at: "2026-07-20T09:00:00.000Z",
  updated_at: "2026-08-05T14:20:00.000Z",
  document: {
    schema_version: 1,
    stage: "production",
    title: "氷が溶ける速さと素材の関係",
    summary: "同じ室温でも、氷が接する素材で溶ける速さがどれだけ変わるかを測った。",
    question: "金属・木・布のうち、氷が最も速く溶けるのはどれか。",
    hypothesis: "触ると冷たい金属がいちばん速く溶ける。",
    method: "同じ製氷皿の氷を3種類の素材へ同時に置き、1分ごとに撮影して完全に溶けるまでの時間を比べた。3回繰り返した。",
    findings: [
      "金属では平均18分、木では31分、布では47分で溶け切った。",
      "触ったときの冷たさは、素材の温度ではなく熱の移りやすさを表していた。"
    ],
    limitations: [
      "素材の厚さと表面積をそろえられていない。",
      "表面温度を測っていないため、開始条件が同一とは言い切れない。"
    ],
    logs: [
      {
        id: "3f2b1c88-0b4e-4c1a-9e2a-1d4c6f8a0b11",
        occurred_at: "2026-07-22T10:00:00.000Z",
        kind: "observation",
        text: "金属トレーの氷だけ、5分の時点で底面に水が広がっていた。",
        source_url: null
      },
      {
        id: "9a7d2e10-5c3f-4b88-8f21-77c9e0d3a542",
        occurred_at: "2026-07-24T10:00:00.000Z",
        kind: "note",
        text: "3回目は室温が1.5度高く、全体的に短くなった。回ごとの比較には使わない。",
        source_url: null
      }
    ],
    deck: {
      short_title: "氷と素材",
      description: "素材ごとの熱の移りやすさを、溶ける速さから確かめる。",
      author: "researcher",
      year: 2026,
      accent: "#2389c9",
      layout: "minimal",
      aspect_ratio: "16:9",
      loading_screen: {
        enabled: true,
        style: "orbit",
        message: "画像と音声を準備しています",
        show_progress: true,
        minimum_duration_ms: 600
      },
      narration_defaults: {
        display: "commentary",
        speaker: null,
        credit: null
      },
      voicevox: null,
      slides: [
        {
          id: "cover",
          title: "氷が溶ける速さと素材の関係",
          duration_seconds: 40,
          reveal_steps: 0,
          tone: "light",
          role: "cover",
          content_markdown: "# 氷が溶ける速さと素材の関係\n\n触ると冷たい素材ほど、氷を速く溶かすのか。",
          reveal_blocks: [],
          sidebar_markdown: null,
          narration: {
            display: "commentary",
            speaker: null,
            segments: [
              { at: 0, text: "氷が溶ける速さと素材の関係について発表します。", audio_src: null }
            ]
          }
        },
        {
          id: "method",
          title: "実験方法",
          duration_seconds: 90,
          reveal_steps: 2,
          tone: "light",
          role: "content",
          content_markdown: "## 実験方法\n\n同じ製氷皿で作った氷を、金属トレー・木の板・乾いた布へ同時に置いた。",
          reveal_blocks: [
            { at: 1, markdown: "- 直射日光とエアコンの風を避けた場所を選ぶ" },
            { at: 2, markdown: "- 素材は実験前に同じ部屋へ30分置いて温度をそろえる" }
          ],
          sidebar_markdown: "製氷皿は1種類のみ。氷の質量はそろえていない。",
          narration: {
            display: "commentary",
            speaker: null,
            segments: [
              { at: 0, text: "同じ製氷皿で作った氷を、3種類の素材へ同時に置きました。", audio_src: null },
              { at: 1, text: "日光やエアコンの風が直接当たらない場所を選びました。", audio_src: null },
              { at: 2, text: "素材はあらかじめ同じ部屋へ30分置き、温度をそろえました。", audio_src: null }
            ]
          }
        },
        {
          id: "result",
          title: "結果",
          duration_seconds: 80,
          reveal_steps: 1,
          tone: "signal",
          role: "result",
          content_markdown: "## 完全に溶けるまでの時間\n\n| 素材 | 平均 |\n|---|---:|\n| 金属 | 18分 |\n| 木 | 31分 |\n| 布 | 47分 |",
          reveal_blocks: [
            { at: 1, markdown: "金属と布の差は約2.6倍だった。" }
          ],
          sidebar_markdown: "3回の平均値。3回目は室温が1.5度高い。",
          narration: {
            display: "commentary",
            speaker: null,
            segments: [
              { at: 0, text: "完全に溶けるまでの時間は、金属が18分、木が31分、布が47分でした。", audio_src: null },
              { at: 1, text: "金属と布ではおよそ2.6倍の差がありました。", audio_src: null }
            ]
          }
        },
        {
          id: "closing",
          title: "分かったことと限界",
          duration_seconds: 60,
          reveal_steps: 1,
          tone: "quiet",
          role: "closing",
          content_markdown: "## 分かったこと\n\n冷たく感じるのは温度ではなく、熱の移りやすさだった。",
          reveal_blocks: [
            { at: 1, markdown: "厚さと表面積をそろえていないため、素材一般の性質までは言えない。" }
          ],
          sidebar_markdown: null,
          narration: {
            display: "commentary",
            speaker: null,
            segments: [
              { at: 0, text: "触ったときの冷たさは温度ではなく、熱の移りやすさを表していました。", audio_src: null },
              { at: 1, text: "ただし厚さと表面積をそろえていないため、素材一般の性質までは言えません。", audio_src: null }
            ]
          }
        }
      ]
    }
  }
});

const dashboardProjects: DashboardProjectSummary[] = [
  {
    project_id: PROJECT_ID,
    title: project.document.title,
    stage: "production",
    version: project.version,
    has_presentation: true,
    slide_count: 4,
    total_duration_seconds: 270,
    created_at: project.created_at,
    updated_at: project.updated_at,
    voice_segment_count: 9,
    voice_ready_count: 9,
    publication_slug: "ice-and-materials",
    preview_project_version: project.version,
    preview_renderer_version: PRESENTATION_RENDERER_VERSION,
    preview_reviewed_at: "2026-08-05T15:00:00.000Z",
    published_project_version: 11,
    published_renderer_version: PRESENTATION_RENDERER_VERSION,
    quality_project_version: project.version,
    quality_renderer_version: PRESENTATION_RENDERER_VERSION,
    quality_status: "completed",
    quality_issue_count: 0
  },
  {
    project_id: "0f6c1d4a-2b7e-4a9c-9f10-53d8ab2c7e64",
    title: "夕方の教室がいちばん暗くなる時刻",
    stage: "fieldwork",
    version: 3,
    has_presentation: true,
    slide_count: 2,
    total_duration_seconds: 95,
    created_at: "2026-08-01T09:00:00.000Z",
    updated_at: "2026-08-06T11:30:00.000Z",
    voice_segment_count: 4,
    voice_ready_count: 1,
    publication_slug: null,
    preview_project_version: 2,
    preview_renderer_version: PRESENTATION_RENDERER_VERSION,
    preview_reviewed_at: null,
    published_project_version: null,
    published_renderer_version: null,
    quality_project_version: null,
    quality_renderer_version: null,
    quality_status: null,
    quality_issue_count: null
  },
  {
    project_id: "b41e9c07-8d52-4f33-a6c8-1e0975fd3a28",
    title: "まだ名前のない研究",
    stage: "discovery",
    version: 1,
    has_presentation: false,
    slide_count: 0,
    total_duration_seconds: 0,
    created_at: "2026-08-07T08:00:00.000Z",
    updated_at: "2026-08-07T08:00:00.000Z",
    voice_segment_count: 0,
    voice_ready_count: 0,
    publication_slug: null,
    preview_project_version: null,
    preview_renderer_version: null,
    preview_reviewed_at: null,
    published_project_version: null,
    published_renderer_version: null,
    quality_project_version: null,
    quality_renderer_version: null,
    quality_status: null,
    quality_issue_count: null
  }
];

const publication: PublicationStatus = {
  project_id: PROJECT_ID,
  draft_version: project.version,
  current_renderer_version: PRESENTATION_RENDERER_VERSION,
  slug: "ice-and-materials",
  latest_preview: null,
  published: null,
  published_history: [],
  events: []
};

const voice = {
  ok: true as const,
  project_id: PROJECT_ID,
  version: project.version,
  configured: true,
  default_profile: {
    id: "voicevox-style-3",
    label: "ずんだもん・ノーマル",
    speaker_name: "ずんだもん",
    style_name: "ノーマル"
  },
  summary: {
    total: 9,
    ready: 9,
    needs_generation: 0,
    failed: 0
  },
  segments: [],
  active_job: null,
  latest_job: null
};

// Bunは`String.raw`テンプレート内の非ASCII文字を`\uXXXX`へ退避する。rawテンプレートでは
// この列が解釈されないため、CSSの`content: "○"`がそのまま文字列"u25CB"として表示される。
// 本番の`wrangler`(esbuild)ビルドはUTF-8のまま出すので製品側には現れない。プレビュー限定の
// 差分であり、ここで元へ戻さないと実表示の判断を誤る。
function decodeBunRawEscapes(source: string): string {
  return source.replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16))
  );
}

// pages.ts は `/assets/dashboard.(css|js)?v=N` を絶対pathで参照する。file:// で開いた
// プレビューでは解決できないため、出力時だけ同階層の相対pathへ書き換える。
function localizeAssets(html: string): string {
  return html
    .replaceAll(`/assets/dashboard.css?v=${DASHBOARD_ASSET_VERSION}`, "dashboard.css")
    .replaceAll(`/assets/dashboard.js?v=${DASHBOARD_ASSET_VERSION}`, "dashboard.js");
}

type Page = { file: string; label: string; note: string; render: () => Promise<string> | string };

const pages: Page[] = [
  {
    file: "landing.html",
    label: "入口（未ログイン）",
    note: "ログイン前の紹介ページ。",
    render: () => landingPage({ broadcasterLogin: "kashiwo", minFollowDays: 30 }).text()
  },
  {
    file: "guide.html",
    label: "はじめかた",
    note: "接続手順の案内ページ。",
    render: () => userGuidePage({ broadcasterLogin: "kashiwo", minFollowDays: 30 }).text()
  },
  {
    file: "data.html",
    label: "データの扱い",
    note: "文章主体の静的ページ。",
    render: () => dataHandlingPage().text()
  },
  {
    file: "dashboard.html",
    label: "研究一覧",
    note: "段階と公開状態の違う3件。行レイアウトと状態表示の確認用。",
    render: () =>
      dashboardPage({
        twitchLogin: LOGIN,
        csrfToken: CSRF,
        projects: dashboardProjects
      }).text()
  },
  {
    file: "project.html",
    label: "研究詳細",
    note: "最も情報量が多い画面。次の一歩、研究内容、構造一覧、公開操作。",
    render: () =>
      projectDetailPage({
        twitchLogin: LOGIN,
        csrfToken: CSRF,
        project,
        assets: [],
        publication,
        draftRevisions: [
          {
            project_id: PROJECT_ID,
            version: 11,
            title: project.document.title,
            stage: "production",
            slide_count: 4,
            total_duration_seconds: 265,
            source: "edit",
            created_at: "2026-08-05T12:00:00.000Z"
          }
        ],
        renderedQualityReport: null
      }).text()
  },
  {
    file: "slide.html",
    label: "スライド編集",
    note: "フィルムストリップ・プレビュー・編集ドックの3領域。",
    render: () =>
      slideWorkspacePage({
        twitchLogin: LOGIN,
        csrfToken: CSRF,
        project,
        slideId: "result"
      }).text()
  },
  {
    file: "review.html",
    label: "レビュー",
    note: "画面テキストと音声原稿へのコメント。",
    render: () =>
      slideReviewPage({
        twitchLogin: LOGIN,
        csrfToken: CSRF,
        project,
        slideId: "result",
        comments: []
      }).text()
  },
  {
    file: "voice.html",
    label: "音声仕上げ",
    note: "VOICEVOX生成の状態表示と一覧。",
    render: () =>
      voiceFinishPage({
        twitchLogin: LOGIN,
        csrfToken: CSRF,
        project,
        voice
      }).text()
  }
];

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const css = await dashboardStyleResponse().text();
  await writeFile(join(OUT_DIR, "dashboard.css"), decodeBunRawEscapes(css), "utf8");
  await writeFile(
    join(OUT_DIR, "dashboard.js"),
    decodeBunRawEscapes(DASHBOARD_SCRIPT),
    "utf8"
  );

  for (const page of pages) {
    const html = await page.render();
    await writeFile(
      join(OUT_DIR, page.file),
      decodeBunRawEscapes(localizeAssets(html)),
      "utf8"
    );
  }

  const index = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>管理画面プレビュー — 最自由研究</title>
    <link rel="stylesheet" href="dashboard.css">
  </head>
  <body>
    <header class="site-header"><a class="brand" href="./index.html">管理画面プレビュー</a><div class="account"><span>renderer ${PRESENTATION_RENDERER_VERSION} / asset ${DASHBOARD_ASSET_VERSION}</span></div></header>
    <main id="main-content" tabindex="-1">
      <div class="section-head"><h1>デザイン確認用の実ページ</h1></div>
      <p class="lead">固定データを <code>web/pages.ts</code> の実関数へ渡して生成しています。ログイン、D1、R2は不要です。サーバへ送信する操作は動きません。</p>
      <div class="grid">
        ${pages.map((page) => `<a class="card-link" href="${page.file}"><article class="card"><h2>${page.label}</h2><p class="meta">${page.note}</p><p class="meta">${page.file}</p></article></a>`).join("\n        ")}
      </div>
    </main>
  </body>
</html>`;
  await writeFile(join(OUT_DIR, "index.html"), index, "utf8");

  console.log(`${pages.length + 1} pages written to ${OUT_DIR}`);
}

await main();
