import type { ClientInfo } from "@cloudflare/workers-oauth-provider";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pageHeaders(options?: {
  setCookies?: string | string[];
  scriptNonce?: string;
}): Headers {
  const scriptPolicy = options?.scriptNonce
    ? [`script-src 'nonce-${options.scriptNonce}'`]
    : [];
  const headers = new Headers({
    "cache-control": "no-store",
    "content-security-policy": [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      ...scriptPolicy,
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'"
    ].join("; "),
    "content-type": "text/html; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  if (options?.setCookies !== undefined) {
    for (const cookie of Array.isArray(options.setCookies)
      ? options.setCookies
      : [options.setCookies]) {
      headers.append("set-cookie", cookie);
    }
  }
  return headers;
}

function layout(title: string, body: string, head = ""): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    ${head}
    <style>
      :root { color-scheme: dark; font-family: Inter, "Noto Sans JP", system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 50% 0%, #27324a 0, #10151f 48%); color: #f3f6fb; }
      main { box-sizing: border-box; width: min(92vw, 42rem); padding: clamp(1.5rem, 5vw, 2.5rem); border: 1px solid #344258; border-radius: 1.25rem; background: #172131ee; box-shadow: 0 1.5rem 4rem #0007; }
      h1 { margin-top: 0; font-size: clamp(1.5rem, 5vw, 2.25rem); }
      p, li { line-height: 1.7; color: #cad5e4; }
      code { color: #a9e2ff; }
      button, .button { box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: .65rem; width: 100%; margin-top: 1rem; padding: .9rem 1.2rem; border: 0; border-radius: .65rem; background: #8b5cf6; color: white; font: inherit; font-weight: 700; text-align: center; text-decoration: none; cursor: pointer; transition: transform .15s ease, background .15s ease, opacity .15s ease; }
      button:hover, .button:hover { background: #7c4df0; transform: translateY(-1px); }
      button:focus-visible, .button:focus-visible { outline: .2rem solid #c4b5fd; outline-offset: .2rem; }
      button:disabled { cursor: wait; opacity: .78; transform: none; }
      .muted { font-size: .9rem; color: #91a1b7; }
      .eyebrow { margin: 0 0 .6rem; color: #a9e2ff; font-size: .8rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
      .feedback { display: flex; align-items: center; gap: .65rem; margin: 1rem 0 0; color: #c4b5fd; font-weight: 650; }
      .spinner { display: inline-block; width: 1rem; height: 1rem; flex: 0 0 auto; border: .16rem solid #ffffff55; border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }
      button .spinner { display: none; }
      button[aria-busy="true"] .spinner { display: inline-block; }
      .success-mark { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; margin-bottom: 1.25rem; border-radius: 50%; background: #34d39922; border: 1px solid #34d39977; color: #6ee7b7; font-size: 2rem; font-weight: 900; }
      .english { padding-top: 1rem; border-top: 1px solid #344258; color: #aebdd0; }
      [hidden] { display: none !important; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
    </style>
  </head>
  <body><main>${body}</main></body>
</html>`;
}

export function consentPage(options: {
  client: ClientInfo;
  scopes: string[];
  csrfToken: string;
  setCookie: string;
}): Response {
  const scriptNonce = crypto.randomUUID();
  const clientName = escapeHtml(options.client.clientName ?? "MCPクライアント");
  const scopes = options.scopes
    .map((scope) => `<li><code>${escapeHtml(scope)}</code></li>`)
    .join("");
  return new Response(
    layout(
      "最自由研究への接続",
      `<p class="eyebrow">Secure connection</p>
       <h1>最自由研究への接続</h1>
       <p><strong>${clientName}</strong> が次の権限を要求しています。</p>
       <ul>${scopes}</ul>
       <p>Twitchで本人確認し、対象チャンネルのフォロー期間またはサブスク状態を確認します。TwitchトークンがMCPクライアントへ渡ることはありません。</p>
       <form id="authorize-form" method="post">
         <input type="hidden" name="csrf_token" value="${escapeHtml(options.csrfToken)}">
         <button id="authorize-button" type="submit">
           <span class="spinner" aria-hidden="true"></span>
           <span id="authorize-button-label">Twitchで確認して許可</span>
         </button>
         <p id="authorize-feedback" class="feedback" role="status" aria-live="polite" hidden>
           Twitchへの接続を準備しています…
         </p>
       </form>
       <p class="muted">許可しない場合はこの画面を閉じてください。</p>
       <script nonce="${scriptNonce}">
         (() => {
           const form = document.getElementById("authorize-form");
           const button = document.getElementById("authorize-button");
           const label = document.getElementById("authorize-button-label");
           const feedback = document.getElementById("authorize-feedback");
           if (!(form instanceof HTMLFormElement) || !(button instanceof HTMLButtonElement)) return;
           let submitting = false;
           form.addEventListener("submit", (event) => {
             event.preventDefault();
             if (submitting) return;
             submitting = true;
             button.disabled = true;
             button.setAttribute("aria-busy", "true");
             if (label !== null) label.textContent = "処理中…";
             if (feedback !== null) feedback.hidden = false;
             requestAnimationFrame(() => form.submit());
           });
         })();
       </script>`
    ),
    {
      headers: pageHeaders({
        setCookies: options.setCookie,
        scriptNonce
      })
    }
  );
}

export function messagePage(
  title: string,
  message: string,
  status: number,
  setCookie?: string
): Response {
  return new Response(
    layout(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`),
    { status, headers: pageHeaders({ setCookies: setCookie }) }
  );
}

export function externalAuthorizationPage(
  authorizationUrl: URL,
  setCookies: string[]
): Response {
  const href = escapeHtml(authorizationUrl.href);
  return new Response(
    layout(
      "Twitchへ移動中",
      `<p class="eyebrow">Step 2</p>
       <h1>Twitchへ移動しています</h1>
       <p class="feedback" role="status"><span class="spinner" aria-hidden="true"></span>認可画面を準備しています…</p>
       <p class="muted">自動的に移動しない場合のみ、下のボタンを押してください。</p>
       <a class="button" href="${href}">Twitchへ進む</a>`,
      `<meta http-equiv="refresh" content="0;url=${href}">`
    ),
    { headers: pageHeaders({ setCookies }) }
  );
}

export function authorizationCompletePage(
  redirectTo: string,
  setCookie: string
): Response {
  const href = escapeHtml(redirectTo);
  return new Response(
    layout(
      "接続を完了しています",
      `<div class="success-mark" aria-hidden="true">✓</div>
       <p class="eyebrow">Twitch verified</p>
       <h1>Twitchでの確認が完了しました</h1>
       <p>Codexまたは接続元のアプリとの接続を完了しています。まもなく接続元の完了画面へ移動します。</p>
       <p class="feedback" role="status"><span class="spinner" aria-hidden="true"></span>接続を仕上げています…</p>
       <div class="english" lang="en">
         <strong>Twitch verification complete.</strong>
         <p>Finishing the connection to Codex or your MCP client. You will be redirected to the client's completion page shortly.</p>
       </div>
       <a class="button" data-redirect-url="${href}" href="${href}">接続を完了する / Continue</a>
       <p class="muted">自動的に移動しない場合のみ、上のボタンを押してください。</p>`,
      `<meta http-equiv="refresh" content="2;url=${href}">`
    ),
    { headers: pageHeaders({ setCookies: setCookie }) }
  );
}
