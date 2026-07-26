import { escapeHtml } from "../auth/pages";
import type { ProjectRecord, ProjectSummary } from "../projects/schema";

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
      .slide-row:first-of-type { border-top: 0; }
      .slide-row span { color: var(--muted); font-size: .85rem; }
      .slide-row strong { overflow-wrap: anywhere; }
      .notice { max-width: 42rem; margin: 3rem auto; text-align: center; }
      form { margin: 0; }
      @media (max-width: 48rem) { .detail-grid { grid-template-columns: 1fr; } }
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
         <p class="hint">現在は一覧表示まで対応しています。研究内容の確認・編集・公開操作は、接続したAIクライアントから行えます。</p>
       </main>`
    ),
    { headers: headers() }
  );
}

export function projectDetailPage(options: {
  twitchLogin: string;
  csrfToken: string;
  project: ProjectRecord;
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
          (slide, index) => `<div class="slide-row"><span>${index + 1}</span><strong>${escapeHtml(slide.title)}</strong><span>${slide.duration_seconds}秒 · ${slide.reveal_steps + 1}段階</span></div>`
        )
        .join("")
    : `<p class="prose">発表スライドはまだ構成されていません。</p>`;

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
             ${textPanel("研究の問い", document.question)}
             ${textPanel("仮説", document.hypothesis)}
             ${textPanel("方法", document.method)}
             ${listPanel("わかったこと", document.findings)}
             ${listPanel("限界・今後の課題", document.limitations)}
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
             <p class="hint">編集・評価・スライド構成は、接続したAIクライアントから行えます。</p>
           </aside>
         </div>
       </main>`
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
