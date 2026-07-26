import type { ClientInfo } from "@cloudflare/workers-oauth-provider";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pageHeaders(setCookies?: string | string[]): Headers {
  const headers = new Headers({
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
  if (setCookies !== undefined) {
    for (const cookie of Array.isArray(setCookies) ? setCookies : [setCookies]) {
      headers.append("set-cookie", cookie);
    }
  }
  return headers;
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #10151f; color: #f3f6fb; }
      main { box-sizing: border-box; width: min(92vw, 42rem); padding: 2rem; border: 1px solid #344258; border-radius: 1rem; background: #172131; box-shadow: 0 1.5rem 4rem #0007; }
      h1 { margin-top: 0; font-size: clamp(1.5rem, 5vw, 2.25rem); }
      p, li { line-height: 1.7; color: #cad5e4; }
      code { color: #a9e2ff; }
      button, .button { box-sizing: border-box; display: block; width: 100%; margin-top: 1rem; padding: .9rem 1.2rem; border: 0; border-radius: .65rem; background: #8b5cf6; color: white; font: inherit; font-weight: 700; text-align: center; text-decoration: none; cursor: pointer; }
      .muted { font-size: .9rem; color: #91a1b7; }
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
  const clientName = escapeHtml(options.client.clientName ?? "MCPクライアント");
  const scopes = options.scopes
    .map((scope) => `<li><code>${escapeHtml(scope)}</code></li>`)
    .join("");
  return new Response(
    layout(
      "最自由研究への接続",
      `<h1>最自由研究への接続</h1>
       <p><strong>${clientName}</strong> が次の権限を要求しています。</p>
       <ul>${scopes}</ul>
       <p>Twitchで本人確認し、対象チャンネルのフォロー期間またはサブスク状態を確認します。TwitchトークンがMCPクライアントへ渡ることはありません。</p>
       <form method="post">
         <input type="hidden" name="csrf_token" value="${escapeHtml(options.csrfToken)}">
         <button type="submit">Twitchで確認して許可</button>
       </form>
       <p class="muted">許可しない場合はこの画面を閉じてください。</p>`
    ),
    { headers: pageHeaders(options.setCookie) }
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
    { status, headers: pageHeaders(setCookie) }
  );
}

export function externalAuthorizationPage(
  authorizationUrl: URL,
  setCookies: string[]
): Response {
  const href = escapeHtml(authorizationUrl.href);
  return new Response(
    layout(
      "Twitchで認証",
      `<h1>Twitchで認証</h1>
       <p>最自由研究への接続を続けるには、Twitchの認可画面を開いてください。</p>
       <a class="button" href="${href}">Twitchの認可画面を開く</a>
       <p class="muted">新しい画面で許可した後、自動的にCodexへ戻ります。このページへ戻る必要はありません。</p>`
    ),
    { headers: pageHeaders(setCookies) }
  );
}
