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

import {
  CSRF,
  LOGIN,
  PROJECT_ID,
  dashboardProjects,
  project,
  publication,
  voice
} from "../test/preview-fixture";

const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../work/dashboard-preview"
);

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
