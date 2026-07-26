import { env } from "cloudflare:test";
import {
  createExecutionContext,
  waitOnExecutionContext
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createOAuthProvider } from "../src/auth/oauth";
import { createEmptyProject } from "../src/projects/schema";
import type { Fetcher } from "../src/auth/twitch";

function createAuthEnv(): Env {
  return {
    OAUTH_KV: env.OAUTH_KV,
    AUTH_STATE_KV: env.AUTH_STATE_KV,
    DB: env.DB,
    MCP_AUTH_MODE: "twitch",
    TWITCH_BROADCASTER_ID: "67879379",
    TWITCH_BROADCASTER_LOGIN: "kashiwo",
    TWITCH_REDIRECT_URI: "https://saijiyu-kenkyu.2764.moe/oauth/twitch/callback",
    MIN_FOLLOW_DAYS: "30",
    ELIGIBILITY_CACHE_TTL_SECONDS: "1800",
    TWITCH_CLIENT_ID: "twitch-client-id",
    TWITCH_CLIENT_SECRET: "twitch-client-secret"
  };
}

function queuedFetch(responses: Response[]): Fetcher {
  return async () => {
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("Unexpected Twitch fetch call.");
    }
    return response;
  };
}

async function requestProvider(
  provider: ReturnType<typeof createOAuthProvider>,
  request: Request,
  authEnv: Env
): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await provider.fetch(request, authEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function cookiePair(setCookie: string, name: string): string {
  const match = setCookie.match(new RegExp(`(?:^|, )(${name}=[^;]+)`));
  if (match?.[1] === undefined) {
    throw new Error(`${name} cookie was not set.`);
  }
  return match[1];
}

function jsonResponse(body: object, status = 200): Response {
  return Response.json(body, { status });
}

describe("Web dashboard", () => {
  it("logs in with Twitch and shows only the owner's projects", async () => {
    const authEnv = createAuthEnv();
    const twitchFetch = queuedFetch([
      jsonResponse({
        access_token: "twitch-access",
        refresh_token: "twitch-refresh",
        expires_in: 3600,
        scope: ["user:read:follows", "user:read:subscriptions"],
        token_type: "bearer"
      }),
      jsonResponse({
        client_id: "twitch-client-id",
        login: "viewer<script>",
        scopes: ["user:read:follows", "user:read:subscriptions"],
        user_id: "dashboard-viewer-id",
        expires_in: 3600
      }),
      jsonResponse({
        data: [
          {
            broadcaster_id: "67879379",
            followed_at: "2020-01-01T00:00:00.000Z"
          }
        ]
      }),
      jsonResponse({}, 404)
    ]);
    const provider = createOAuthProvider(
      authEnv,
      async () => Response.json({ protected: true }),
      twitchFetch
    );

    const landing = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/"),
      authEnv
    );
    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain("Twitchでログイン");
    expect(landing.headers.get("content-security-policy")).toContain(
      "default-src 'none'"
    );

    const unauthenticatedDashboard = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/dashboard"),
      authEnv
    );
    expect(unauthenticatedDashboard.status).toBe(303);
    expect(unauthenticatedDashboard.headers.get("location")).toBe("/");

    const login = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/login"),
      authEnv
    );
    expect(login.status).toBe(200);
    const loginHtml = await login.text();
    const twitchAuthorize = new URL(
      loginHtml.match(/class="button" href="([^"]+)"/)?.[1].replaceAll(
        "&amp;",
        "&"
      ) ?? "https://invalid.example"
    );
    expect(twitchAuthorize.origin).toBe("https://id.twitch.tv");
    const stateCookie = cookiePair(
      login.headers.get("set-cookie") ?? "",
      "__Host-SAIJIYU_TWITCH_STATE"
    );

    const callback = new URL(authEnv.TWITCH_REDIRECT_URI);
    callback.search = new URLSearchParams({
      code: "twitch-code",
      state: twitchAuthorize.searchParams.get("state") ?? ""
    }).toString();
    const loginComplete = await requestProvider(
      provider,
      new Request(callback, { headers: { cookie: stateCookie } }),
      authEnv
    );
    expect(loginComplete.status).toBe(303);
    expect(loginComplete.headers.get("location")).toBe("/dashboard");
    const setCookie = loginComplete.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Host-SAIJIYU_SESSION=");
    expect(setCookie).toContain("__Host-SAIJIYU_WEB_CSRF=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    const sessionCookie = cookiePair(setCookie, "__Host-SAIJIYU_SESSION");
    const csrfCookie = cookiePair(setCookie, "__Host-SAIJIYU_WEB_CSRF");
    const browserCookies = `${sessionCookie}; ${csrfCookie}`;

    const sessionWithoutCsrf = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/dashboard", {
        headers: { cookie: sessionCookie }
      }),
      authEnv
    );
    expect(sessionWithoutCsrf.status).toBe(303);
    expect(sessionWithoutCsrf.headers.get("location")).toBe("/");

    const emptyDashboard = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/dashboard", {
        headers: { cookie: browserCookies }
      }),
      authEnv
    );
    expect(emptyDashboard.status).toBe(200);
    expect(await emptyDashboard.text()).toContain("まだ研究がありません");

    const now = "2026-07-26T10:00:00.000Z";
    const ownDocument = createEmptyProject("自分の研究 <script>alert(1)</script>");
    ownDocument.summary = "研究の概要です";
    ownDocument.question = "なぜこうなるのか？";
    ownDocument.findings = ["観察した結果"];
    const otherDocument = createEmptyProject("他人だけに見える研究");
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).bind("twitch-other-id", "other-id", "other", now, now),
      env.DB.prepare(
        `INSERT INTO research_projects (
           id, owner_user_id, title, stage, document_json, version,
           idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      ).bind(
        "10000000-0000-4000-8000-000000000001",
        "twitch-dashboard-viewer-id",
        ownDocument.title,
        ownDocument.stage,
        JSON.stringify(ownDocument),
        "own-project",
        now,
        now
      ),
      env.DB.prepare(
        `INSERT INTO research_projects (
           id, owner_user_id, title, stage, document_json, version,
           idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      ).bind(
        "20000000-0000-4000-8000-000000000002",
        "twitch-other-id",
        otherDocument.title,
        otherDocument.stage,
        JSON.stringify(otherDocument),
        "other-project",
        now,
        now
      )
    ]);

    const dashboard = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/dashboard", {
        headers: { cookie: browserCookies }
      }),
      authEnv
    );
    const dashboardHtml = await dashboard.text();
    expect(dashboard.status).toBe(200);
    expect(dashboardHtml).toContain("自分の研究 &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(dashboardHtml).not.toContain("他人だけに見える研究");
    expect(dashboardHtml).toContain("viewer&lt;script&gt;");
    expect(dashboardHtml).not.toContain("viewer<script>");
    expect(dashboardHtml).toContain("1 / 20 件");
    expect(dashboardHtml).toContain(
      'href="/dashboard/projects/10000000-0000-4000-8000-000000000001"'
    );

    const detail = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const detailHtml = await detail.text();
    expect(detail.status).toBe(200);
    expect(detailHtml).toContain("研究の概要です");
    expect(detailHtml).toContain("なぜこうなるのか？");
    expect(detailHtml).toContain("観察した結果");
    expect(detailHtml).toContain(
      "自分の研究 &lt;script&gt;alert(1)&lt;/script&gt;"
    );

    const otherDetail = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/20000000-0000-4000-8000-000000000002",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    expect(otherDetail.status).toBe(404);
    expect(await otherDetail.text()).not.toContain("他人だけに見える研究");

    const csrfToken = dashboardHtml.match(
      /name="csrf_token" value="([^"]+)"/
    )?.[1];
    expect(csrfToken).toBeTruthy();
    const logoutBody = new URLSearchParams({ csrf_token: csrfToken ?? "" });
    const logout = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/logout", {
        method: "POST",
        headers: {
          cookie: browserCookies,
          "content-length": String(logoutBody.toString().length),
          "content-type": "application/x-www-form-urlencoded"
        },
        body: logoutBody
      }),
      authEnv
    );
    expect(logout.status).toBe(303);
    expect(logout.headers.get("location")).toBe("/");
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const afterLogout = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/dashboard", {
        headers: { cookie: browserCookies }
      }),
      authEnv
    );
    expect(afterLogout.status).toBe(303);
    expect(afterLogout.headers.get("location")).toBe("/");
  });
});
