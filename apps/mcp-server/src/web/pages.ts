import { escapeHtml } from "../auth/pages";
import type { ProjectAsset } from "../assets/schema";
import type { ProjectRecord, ProjectSummary } from "../projects/schema";
import type { PublicationStatus } from "../publications/service";

const STAGE_LABELS: Record<ProjectSummary["stage"], string> = {
  discovery: "発見",
  design: "設計",
  fieldwork: "調査・実験",
  story: "構成",
  production: "制作",
  review: "見直し"
};

function headers(setCookies: string[] = []): Headers {
  const result = new Headers({
    "cache-control": "no-store",
    "content-security-policy": [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "img-src 'self' blob: data:",
      "frame-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'"
    ].join("; "),
    "content-type": "text/html; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  for (const cookie of setCookies) {
    result.append("set-cookie", cookie);
  }
  return result;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, "Noto Sans JP", system-ui, sans-serif; --ink: #eef3fa; --muted: #9aa9bb; --line: #2c3a4e; --panel: #121c2aee; --accent: #9d7bff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 15% -10%, #3a285c 0, transparent 36rem), radial-gradient(circle at 85% 0%, #173e57 0, transparent 32rem), #090f18; color: var(--ink); }
      a { color: inherit; }
      .site-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: min(92vw, 72rem); margin: 0 auto; padding: 1.4rem 0; }
      .brand { text-decoration: none; font-weight: 850; letter-spacing: .02em; }
      .account { display: flex; align-items: center; gap: .75rem; color: var(--muted); }
      .account strong { color: var(--ink); }
      main { width: min(92vw, 72rem); margin: 0 auto; padding: clamp(2rem, 7vw, 6rem) 0 5rem; }
      .hero { max-width: 49rem; }
      .eyebrow { margin: 0 0 .7rem; color: #91ddff; font-size: .78rem; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }
      h1 { margin: 0; font-size: clamp(2.25rem, 7vw, 5.4rem); line-height: 1.02; letter-spacing: -.045em; }
      .lead { max-width: 42rem; margin: 1.5rem 0 0; color: #bdc9d8; font-size: clamp(1rem, 2vw, 1.2rem); line-height: 1.8; }
      .button, button { display: inline-flex; align-items: center; justify-content: center; min-height: 2.8rem; padding: .7rem 1rem; border: 0; border-radius: .7rem; background: var(--accent); color: white; font: inherit; font-weight: 780; text-decoration: none; cursor: pointer; }
      .button.primary { margin-top: 1.7rem; padding: .9rem 1.25rem; }
      .ghost { border: 1px solid var(--line); background: #152131; color: #d6dfeb; }
      .section-head { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin: 0 0 1.25rem; }
      .section-head h1 { font-size: clamp(2rem, 5vw, 3.6rem); }
      .count { color: var(--muted); }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 1rem; }
      .card, .empty { border: 1px solid var(--line); border-radius: 1rem; background: linear-gradient(150deg, #182437e8, #101925e8); box-shadow: 0 1rem 3rem #0004; }
      .card-link { display: block; border-radius: 1rem; color: inherit; text-decoration: none; }
      .card-link:hover .card { border-color: #8062dfaa; transform: translateY(-2px); }
      .card-link:focus-visible { outline: .2rem solid #c4b5fd; outline-offset: .2rem; }
      .card { min-height: 13rem; padding: 1.25rem; }
      .card { transition: border-color .15s ease, transform .15s ease; }
      .card-top { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
      .stage { display: inline-flex; padding: .3rem .58rem; border: 1px solid #7f68c977; border-radius: 999px; background: #8062df20; color: #c7b9ff; font-size: .78rem; font-weight: 800; }
      .version { color: var(--muted); font-size: .78rem; }
      .card h2 { margin: 1.2rem 0 .6rem; font-size: 1.35rem; overflow-wrap: anywhere; }
      .meta { margin: 0; color: var(--muted); font-size: .88rem; line-height: 1.6; }
      .empty { padding: clamp(1.5rem, 5vw, 3rem); text-align: center; }
      .empty h2 { margin-top: 0; }
      .empty p { color: var(--muted); line-height: 1.7; }
      .hint { margin: 1.5rem 0 0; padding: 1rem 1.15rem; border-left: .2rem solid #62d6ff; background: #112334; color: #bfcedd; line-height: 1.7; }
      .back { display: inline-flex; margin-bottom: 1.5rem; color: #b9c7d8; text-decoration: none; }
      .detail-title { font-size: clamp(2rem, 6vw, 4.5rem); overflow-wrap: anywhere; }
      .detail-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr); gap: 1rem; margin-top: 1.5rem; }
      .detail-column { display: grid; align-content: start; gap: 1rem; }
      .panel { padding: 1.25rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--panel); }
      .panel h2 { margin: 0 0 .8rem; font-size: 1.05rem; }
      .panel h3 { margin: 1rem 0 .35rem; font-size: .95rem; }
      .panel p, .panel li { color: #bdc9d8; line-height: 1.75; }
      .prose { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .plain-list { margin: 0; padding-left: 1.25rem; }
      .plain-list li + li { margin-top: .45rem; }
      .stat-list { display: grid; grid-template-columns: 1fr auto; gap: .55rem 1rem; margin: 0; }
      .stat-list dt { color: var(--muted); }
      .stat-list dd { margin: 0; font-weight: 750; text-align: right; }
      .log { padding: .8rem 0; border-top: 1px solid var(--line); }
      .log:first-of-type { padding-top: 0; border-top: 0; }
      .log small { color: var(--muted); }
      .slide-row { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; gap: .75rem; align-items: baseline; padding: .7rem 0; border-top: 1px solid var(--line); }
      a.slide-row { color: inherit; text-decoration: none; }
      a.slide-row:hover strong { color: #c7b9ff; }
      a.slide-row:focus-visible { outline: 2px solid #c4b5fd; outline-offset: 3px; }
      .slide-row:first-of-type { border-top: 0; }
      .slide-row span { color: var(--muted); font-size: .85rem; }
      .slide-row strong { overflow-wrap: anywhere; }
      .asset-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .8rem; }
      .asset { overflow: hidden; border: 1px solid var(--line); border-radius: .8rem; background: #0b1420; }
      .asset img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; background: #08101a; }
      .asset-body { display: grid; gap: .55rem; padding: .75rem; }
      .asset-body p { margin: 0; font-size: .86rem; }
      .asset-body button { justify-self: start; min-height: 2.2rem; padding: .45rem .7rem; font-size: .8rem; }
      .upload { display: grid; gap: .8rem; margin-bottom: 1rem; padding: 1rem; border: 1px dashed #52647c; border-radius: .8rem; background: #0c1724; }
      .upload label { display: grid; gap: .35rem; color: #c9d5e4; font-size: .9rem; }
      .upload input { width: 100%; padding: .65rem; border: 1px solid var(--line); border-radius: .55rem; background: #0a111b; color: var(--ink); font: inherit; }
      .editor { display: grid; gap: 1rem; }
      .editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .9rem; }
      .editor label { display: grid; gap: .4rem; color: #c9d5e4; font-size: .9rem; }
      .editor label.wide { grid-column: 1 / -1; }
      .editor input, .editor textarea, .editor select { width: 100%; padding: .72rem; border: 1px solid var(--line); border-radius: .55rem; background: #0a111b; color: var(--ink); font: inherit; line-height: 1.5; }
      .editor textarea { min-height: 7rem; resize: vertical; }
      .actions { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; }
      button:disabled { cursor: wait; opacity: .55; }
      .publish-state { display: grid; gap: .8rem; }
      .status-row { display: flex; justify-content: space-between; gap: 1rem; padding: .65rem 0; border-top: 1px solid var(--line); }
      .status-row:first-of-type { border-top: 0; }
      .status-row span { color: var(--muted); }
      .success { color: #74e6b2 !important; }
      .warning { color: #ffd681 !important; }
      .upload-actions { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
      .feedback { min-height: 1.4em; margin: 0; color: #9fddf5; font-size: .88rem; }
      .notice { max-width: 42rem; margin: 3rem auto; text-align: center; }
      main.workspace-main { width: min(96vw, 100rem); padding-top: 1rem; }
      .workspace-head { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
      .workspace-head h1 { font-size: clamp(1.65rem, 3vw, 2.8rem); }
      .workspace-version { display: flex; align-items: center; gap: .75rem; color: var(--muted); }
      .slide-workspace { display: grid; grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr) minmax(17rem, 22rem); gap: 1rem; align-items: start; }
      .filmstrip, .inspector { display: grid; gap: .65rem; align-content: start; max-height: calc(100vh - 10rem); overflow: auto; }
      .filmstrip-link { display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: .55rem; padding: .7rem; border: 1px solid var(--line); border-radius: .65rem; color: #bdc9d8; text-decoration: none; }
      .filmstrip-link span { color: var(--muted); font: 700 .76rem/1.3 ui-monospace, monospace; }
      .filmstrip-link strong { overflow-wrap: anywhere; font-size: .86rem; line-height: 1.35; }
      .filmstrip-link[data-active="true"] { border-color: #9d7bff; background: #8062df20; color: white; }
      .workspace-preview { min-width: 0; padding: .8rem; }
      .workspace-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid #40516a; border-radius: .65rem; background: #05080d; box-shadow: 0 1.5rem 4rem #0006; }
      .workspace-frame iframe { display: block; width: 100%; height: 100%; border: 0; }
      .step-control { display: flex; align-items: center; justify-content: center; gap: .7rem; margin-top: .8rem; }
      .step-control button { min-height: 2.2rem; padding: .45rem .75rem; }
      .step-control output { min-width: 6rem; color: var(--muted); text-align: center; font: 700 .8rem/1 ui-monospace, monospace; }
      .component-outline { display: grid; gap: .45rem; margin: 0; padding: 0; list-style: none; }
      .component-outline li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .55rem; padding: .55rem; border: 1px solid var(--line); border-radius: .55rem; color: #bdc9d8; font-size: .8rem; }
      .component-outline code { color: #91ddff; }
      .component-outline small { display: block; color: var(--muted); overflow-wrap: anywhere; }
      .mode-note { margin: 0; padding: .75rem; border-left: 3px solid var(--accent); background: #0c1724; color: #bdc9d8; font-size: .84rem; line-height: 1.6; }
      form { margin: 0; }
      @media (max-width: 72rem) { .slide-workspace { grid-template-columns: minmax(9rem, 13rem) minmax(0, 1fr); } .inspector { grid-column: 1 / -1; max-height: none; } }
      @media (max-width: 48rem) { .detail-grid, .editor-grid, .slide-workspace { grid-template-columns: 1fr; } .editor label.wide { grid-column: auto; } .filmstrip { display: flex; max-height: none; overflow-x: auto; } .filmstrip-link { min-width: 12rem; } .inspector { grid-column: auto; } }
      @media (max-width: 38rem) { .site-header, .account { align-items: flex-start; } .site-header { flex-direction: column; } .section-head { align-items: flex-start; flex-direction: column; } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; } }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function formatDate(iso: string): string {
  const [date] = iso.split("T");
  return date?.replaceAll("-", "/") ?? iso;
}

function accountHeader(twitchLogin: string, csrfToken: string): string {
  return `<header class="site-header">
    <a class="brand" href="/dashboard">最自由研究</a>
    <div class="account"><span><strong>${escapeHtml(twitchLogin)}</strong> でログイン中</span>
      <form method="post" action="/logout"><input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}"><button class="ghost" type="submit">ログアウト</button></form>
    </div>
  </header>`;
}

function textPanel(title: string, value: string | null): string {
  return `<section class="panel"><h2>${escapeHtml(title)}</h2><p class="prose">${escapeHtml(value?.trim() || "未記入")}</p></section>`;
}

function listPanel(title: string, values: string[]): string {
  const limited = values.slice(0, 20);
  const items = limited.length
    ? `<ul class="plain-list">${limited.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`
    : `<p class="prose">未記入</p>`;
  const remaining = values.length - limited.length;
  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${items}${remaining > 0 ? `<p class="meta">ほか ${remaining} 件</p>` : ""}</section>`;
}

function slideCompositionLabel(
  slide: NonNullable<ProjectRecord["document"]["deck"]>["slides"][number]
): string {
  if (slide.composition?.mode === "canvas") {
    return `自由配置 ${slide.composition.blocks.length} block`;
  }
  if (slide.composition?.mode === "scene") {
    return `リッチ構成 ${slide.composition.nodes.length} component`;
  }
  return "定型flow";
}

export function landingPage(): Response {
  return new Response(
    shell(
      "最自由研究",
      `<header class="site-header"><a class="brand" href="/">最自由研究</a></header>
       <main><section class="hero">
         <p class="eyebrow">Ultimate freestyle research</p>
         <h1>気になったことを、研究にする。</h1>
         <p class="lead">AIとの対話で自由研究を育て、発表用のWebスライドまで一つの場所で管理します。Twitchで本人確認すると、自分の研究一覧を確認できます。</p>
         <a class="button primary" href="/login">Twitchでログイン</a>
       </section></main>`
    ),
    { headers: headers() }
  );
}

export function dashboardPage(options: {
  twitchLogin: string;
  csrfToken: string;
  projects: ProjectSummary[];
}): Response {
  const cards = options.projects
    .map(
      (project) => `<a class="card-link" href="/dashboard/projects/${escapeHtml(project.project_id)}"><article class="card" data-project-id="${escapeHtml(project.project_id)}">
        <div class="card-top"><span class="stage">${STAGE_LABELS[project.stage]}</span><span class="version">v${project.version}</span></div>
        <h2>${escapeHtml(project.title)}</h2>
        <p class="meta">最終更新 ${escapeHtml(formatDate(project.updated_at))}</p>
      </article></a>`
    )
    .join("");
  const content =
    cards.length > 0
      ? `<div class="grid">${cards}</div>`
      : `<section class="empty"><h2>まだ研究がありません</h2><p>Codexなどの対応AIクライアントから、最自由研究MCPに「新しい研究を作りたい」と話しかけると、ここに追加されます。</p></section>`;

  return new Response(
    shell(
      "自分の研究 — 最自由研究",
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main>
         <div class="section-head"><div><p class="eyebrow">My research</p><h1>自分の研究</h1></div><span class="count">${options.projects.length} / 20 件</span></div>
         ${content}
         <p class="hint">研究を開くと、内容確認、文言の微調整、発表プレビュー、公開操作を行えます。大きな構成変更は接続したAIクライアントから進めます。</p>
       </main>`
    ),
    { headers: headers() }
  );
}

export function projectDetailPage(options: {
  twitchLogin: string;
  csrfToken: string;
  project: ProjectRecord;
  assets: ProjectAsset[];
  publication: PublicationStatus;
}): Response {
  const document = options.project.document;
  const recentLogs = document.logs.slice(-20).reverse();
  const logs = recentLogs.length
    ? recentLogs
        .map(
          (entry) => `<article class="log"><small>${escapeHtml(formatDate(entry.occurred_at))} · ${escapeHtml(entry.kind)}</small><p class="prose">${escapeHtml(entry.text)}</p></article>`
        )
        .join("")
    : `<p class="prose">まだ研究ログがありません。</p>`;
  const slides = document.deck?.slides ?? [];
  const slideRows = slides.length
    ? slides
        .map(
          (slide, index) => `<a class="slide-row" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}"><span>${index + 1}</span><strong>${escapeHtml(slide.title)}<small class="stage">${escapeHtml(slideCompositionLabel(slide))}</small></strong><span>${slide.duration_seconds}秒 · ${slide.reveal_steps + 1}段階</span></a>`
        )
        .join("")
    : `<p class="prose">発表スライドはまだ構成されていません。</p>`;
  const assetCards = options.assets.length
    ? `<div class="asset-grid">${options.assets
        .map(
          (asset) => `<article class="asset" data-asset><img src="${escapeHtml(asset.content_url)}" alt="${escapeHtml(asset.alt_text)}" loading="lazy"><div class="asset-body"><p>${escapeHtml(asset.alt_text || "装飾画像")}</p><p class="meta">${asset.width}×${asset.height} · ${Math.ceil(asset.byte_size / 1024)} KiB</p><button class="ghost" type="button" data-image-delete="/api/images/${escapeHtml(asset.asset_id)}" data-csrf="${escapeHtml(options.csrfToken)}">削除</button></div></article>`
        )
        .join("")}</div>`
    : `<p class="prose">まだ画像がありません。</p>`;
  const preview = options.publication.latest_preview;
  const published = options.publication.published;
  const previewCurrent = preview?.project_version === options.project.version;
  const publicationPanel = `<section class="panel publish-state" data-publication>
    <h2>プレビューと公開</h2>
    <div class="status-row"><span>下書き</span><strong>v${options.project.version}</strong></div>
    <div class="status-row"><span>最新プレビュー</span><strong>${preview === null ? "未作成" : `v${preview.project_version}`}</strong></div>
    <div class="status-row"><span>公開中</span><strong>${published === null ? "未公開" : `v${published.project_version}`}</strong></div>
    ${preview !== null ? `<a class="button ghost" href="/preview/${escapeHtml(preview.revision_id)}" target="_blank" rel="noopener">最新プレビューを開く</a>` : ""}
    ${published !== null && options.publication.slug !== null ? `<a class="button ghost" href="/p/${escapeHtml(options.publication.slug)}" target="_blank" rel="noopener">公開ページを開く</a>` : ""}
    <div class="actions">
      <button type="button" data-create-preview="/api/projects/${escapeHtml(options.project.project_id)}/previews" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}"${slides.length === 0 ? " disabled" : ""}>現在の下書きをプレビュー</button>
      <button class="ghost" type="button" data-publish-preview="/api/projects/${escapeHtml(options.project.project_id)}/publish" data-revision="${escapeHtml(preview?.revision_id ?? "")}" data-csrf="${escapeHtml(options.csrfToken)}"${previewCurrent ? "" : " disabled"}>確認した版を公開</button>
    </div>
    <p class="feedback${preview !== null && !previewCurrent ? " warning" : ""}" data-publish-feedback aria-live="polite">${slides.length === 0 ? "スライドを1枚以上作るとプレビューできます。" : preview !== null && !previewCurrent ? "下書きが変わったため、新しいプレビューの確認が必要です。" : "公開中の版は、下書きを編集しても自動では変わりません。"}</p>
  </section>`;

  return new Response(
    shell(
      `${document.title} — 最自由研究`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main>
         <a class="back" href="/dashboard">← 自分の研究へ戻る</a>
         <div class="card-top"><span class="stage">${STAGE_LABELS[document.stage]}</span><span class="version">v${options.project.version}</span></div>
         <h1 class="detail-title">${escapeHtml(document.title)}</h1>
         <p class="lead">${escapeHtml(document.summary || "概要はまだ記入されていません。")}</p>
         <div class="detail-grid">
           <div class="detail-column">
             <section class="panel"><h2>基本情報を編集</h2>
               <form class="editor" data-project-editor action="/api/projects/${escapeHtml(options.project.project_id)}/fields" data-version="${options.project.version}" data-csrf="${escapeHtml(options.csrfToken)}">
                 <div class="editor-grid">
                   <label>タイトル<input name="title" maxlength="120" required value="${escapeHtml(document.title)}"></label>
                   <label>段階<select name="stage">${Object.entries(STAGE_LABELS).map(([value, label]) => `<option value="${value}"${document.stage === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>
                   <label class="wide">概要<textarea name="summary" maxlength="2000">${escapeHtml(document.summary)}</textarea></label>
                   <label class="wide">研究の問い<textarea name="question" maxlength="2000">${escapeHtml(document.question ?? "")}</textarea></label>
                   <label class="wide">仮説<textarea name="hypothesis" maxlength="4000">${escapeHtml(document.hypothesis ?? "")}</textarea></label>
                   <label class="wide">方法<textarea name="method" maxlength="20000">${escapeHtml(document.method ?? "")}</textarea></label>
                 </div>
                 <div class="actions"><button type="submit">変更を保存</button><span class="version" data-editor-version>v${options.project.version}</span></div>
                 <p class="feedback" data-editor-feedback aria-live="polite"></p>
               </form>
             </section>
             ${textPanel("研究の問い", document.question)}
             ${textPanel("仮説", document.hypothesis)}
             ${textPanel("方法", document.method)}
             ${listPanel("わかったこと", document.findings)}
             ${listPanel("限界・今後の課題", document.limitations)}
             <section class="panel"><h2>研究画像</h2>
               <form class="upload" action="/api/projects/${escapeHtml(options.project.project_id)}/images" data-image-upload data-csrf="${escapeHtml(options.csrfToken)}">
                 <label>画像ファイル<input type="file" accept="image/jpeg,image/png,image/webp" required></label>
                 <label>画像の説明<input name="alt_text" maxlength="500" placeholder="写真や図が何を示しているか"></label>
                 <div class="upload-actions"><button type="submit">画像を追加</button><span class="meta">JPEG / PNG / 静止WebP、10MiBまで</span></div>
                 <p class="feedback" data-feedback aria-live="polite"></p>
               </form>
               ${assetCards}
             </section>
             <section class="panel"><h2>研究ログ</h2>${logs}${document.logs.length > recentLogs.length ? `<p class="meta">最新20件を表示 · 全${document.logs.length}件</p>` : ""}</section>
           </div>
           <aside class="detail-column">
             <section class="panel"><h2>研究情報</h2><dl class="stat-list">
               <dt>段階</dt><dd>${STAGE_LABELS[document.stage]}</dd>
               <dt>version</dt><dd>${options.project.version}</dd>
               <dt>更新日</dt><dd>${escapeHtml(formatDate(options.project.updated_at))}</dd>
               <dt>ログ</dt><dd>${document.logs.length}件</dd>
               <dt>スライド</dt><dd>${slides.length}枚</dd>
             </dl></section>
             <section class="panel"><h2>発表構成</h2>${slideRows}</section>
             ${publicationPanel}
             <p class="hint">大きな構成変更はAIクライアント、文言の微調整と確認・公開はこの画面から行えます。</p>
           </aside>
         </div>
       </main><script src="/assets/dashboard.js" defer></script>`
    ),
    { headers: headers() }
  );
}

export function slideWorkspacePage(options: {
  twitchLogin: string;
  csrfToken: string;
  project: ProjectRecord;
  slideId: string;
}): Response {
  const deck = options.project.document.deck;
  const slideIndex = deck?.slides.findIndex((slide) => slide.id === options.slideId) ?? -1;
  if (deck === null || slideIndex === -1) return projectNotFoundPage();
  const slide = deck.slides[slideIndex];
  if (slide === undefined) return projectNotFoundPage();
  const filmstrip = deck.slides
    .map(
      (item, index) => `<a class="filmstrip-link" data-active="${String(index === slideIndex)}" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(item.id)}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item.title)}</strong></a>`
    )
    .join("");
  const componentOutline =
    slide.composition?.mode === "scene"
      ? `<ul class="component-outline">${slide.composition.nodes
          .map(
            (node) => `<li><code>uf-${escapeHtml(node.kind.replaceAll("_", "-"))}</code><span>${escapeHtml(node.id)}<small>parent: ${escapeHtml(node.parent_id ?? "root")} · step ${node.at}</small></span></li>`
          )
          .join("")}</ul>`
      : slide.composition?.mode === "canvas"
        ? `<ul class="component-outline">${slide.composition.blocks
            .map(
              (block) => `<li><code>${escapeHtml(block.kind)}</code><span>${escapeHtml(block.id)}<small>x ${block.frame.x}% · y ${block.frame.y}% · step ${block.at}</small></span></li>`
            )
            .join("")}</ul>`
        : `<p class="mode-note">定型flowです。本文、段階表示、補足欄から構成されます。AIからsceneへ切り替えると、入れ子のリッチcomponentを利用できます。</p>`;
  const modeNote =
    slide.composition?.mode === "scene"
      ? "登録済みWeb Componentsで構成されています。現在はAIからcomponentを一件ずつ編集でき、この画面では実表示と基本文言を確認できます。"
      : slide.composition?.mode === "canvas"
        ? "従来のflat canvasです。既存表示は維持されます。より複雑な構成はcomponent sceneへ移行できます。"
        : "本文と補足欄を使う定型flowです。";
  return new Response(
    shell(
      `${slide.title} — スライド編集`,
      `${accountHeader(options.twitchLogin, options.csrfToken)}
       <main class="workspace-main">
         <a class="back" href="/dashboard/projects/${escapeHtml(options.project.project_id)}">← 研究詳細へ戻る</a>
         <div class="workspace-head"><div><p class="eyebrow">Slide workspace · ${slideIndex + 1} / ${deck.slides.length}</p><h1>${escapeHtml(slide.title)}</h1></div><div class="workspace-version"><span data-workspace-version>v${options.project.version}</span><a class="button ghost" href="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}/frame?slide=${slideIndex + 1}&step=0" target="_blank" rel="noopener">大きく開く</a></div></div>
         <div class="slide-workspace">
           <nav class="filmstrip" aria-label="スライド一覧">${filmstrip}</nav>
           <section class="panel workspace-preview">
             <div class="workspace-frame"><iframe title="${escapeHtml(slide.title)}の実表示" src="/dashboard/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}/frame?slide=${slideIndex + 1}&step=0" data-slide-frame></iframe></div>
             <div class="step-control"><button class="ghost" type="button" data-step-direction="previous">← 段階</button><output data-step-output>STEP 0 / ${slide.reveal_steps}</output><button class="ghost" type="button" data-step-direction="next">段階 →</button></div>
           </section>
           <aside class="inspector">
             <section class="panel"><h2>スライド設定</h2>
               <form class="editor" data-slide-editor action="/api/projects/${escapeHtml(options.project.project_id)}/slides/${escapeHtml(slide.id)}" data-version="${options.project.version}" data-max-step="${slide.reveal_steps}" data-csrf="${escapeHtml(options.csrfToken)}">
                 <label>タイトル<input name="title" maxlength="120" required value="${escapeHtml(slide.title)}"></label>
                 <div class="editor-grid"><label>想定秒数<input name="duration_seconds" type="number" min="1" max="1200" required value="${slide.duration_seconds}"></label><label>tone<select name="tone">${["dark", "light", "signal", "quiet"].map((tone) => `<option value="${tone}"${slide.tone === tone ? " selected" : ""}>${tone}</option>`).join("")}</select></label></div>
                 <label>定型本文／fallback<textarea name="content_markdown" maxlength="20000" required>${escapeHtml(slide.content_markdown)}</textarea></label>
                 <label>補足欄<textarea name="sidebar_markdown" maxlength="10000">${escapeHtml(slide.sidebar_markdown ?? "")}</textarea></label>
                 <div class="actions"><button type="submit">このスライドを保存</button><span class="version" data-slide-version>v${options.project.version}</span></div>
                 <p class="feedback" data-slide-feedback aria-live="polite"></p>
               </form>
             </section>
             <section class="panel"><h2>${escapeHtml(slideCompositionLabel(slide))}</h2><p class="mode-note">${escapeHtml(modeNote)}</p>${componentOutline}</section>
             <section class="panel"><h2>読み上げ</h2><p class="prose">${escapeHtml(slide.narration?.segments.map((segment) => `STEP ${segment.at}: ${segment.text}`).join("\n\n") || "読み上げはまだありません。")}</p></section>
           </aside>
         </div>
       </main><script src="/assets/dashboard.js" defer></script>`
    ),
    { headers: headers() }
  );
}

export function projectNotFoundPage(): Response {
  return new Response(
    shell(
      "研究が見つかりません — 最自由研究",
      `<main><section class="panel notice"><p class="eyebrow">Not found</p><h1 class="detail-title">研究が見つかりません</h1><p class="lead">削除されたか、このアカウントでは表示できない研究です。</p><a class="button primary" href="/dashboard">自分の研究へ戻る</a></section></main>`
    ),
    { status: 404, headers: headers() }
  );
}

export function redirectPage(
  location: string,
  setCookies: string[] = []
): Response {
  const responseHeaders = headers(setCookies);
  responseHeaders.set("location", location);
  responseHeaders.delete("content-type");
  return new Response(null, { status: 303, headers: responseHeaders });
}

export function webLoginCompletePage(setCookies: string[]): Response {
  return redirectPage("/dashboard", setCookies);
}
