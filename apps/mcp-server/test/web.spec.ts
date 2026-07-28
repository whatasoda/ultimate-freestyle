import { env } from "cloudflare:test";
import {
  createExecutionContext,
  waitOnExecutionContext
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createOAuthProvider } from "../src/auth/oauth";
import { createProjectAsset } from "../src/assets/repository";
import { PRESENTATION_RENDERER_VERSION } from "../src/presentation/render";
import { createEmptyProject } from "../src/projects/schema";
import type { Fetcher } from "../src/auth/twitch";

function createAuthEnv(): Env {
  return {
    OAUTH_KV: env.OAUTH_KV,
    AUTH_STATE_KV: env.AUTH_STATE_KV,
    MEDIA_BUCKET: env.MEDIA_BUCKET,
    DB: env.DB,
    IMAGES: env.IMAGES,
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
    const presentationAssetId = "30000000-0000-4000-8000-000000000003";
    const ownDocument = createEmptyProject("自分の研究 <script>alert(1)</script>");
    ownDocument.summary = "研究の概要です";
    ownDocument.question = "なぜこうなるのか？";
    ownDocument.findings = ["観察した結果"];
    ownDocument.deck = {
      short_title: "自分の研究",
      description: "",
      author: "viewer",
      year: 2026,
      accent: "#9d7bff",
      layout: "minimal",
      narration_defaults: null,
      templates: [
        {
          id: "lab",
          name: "実験ノート",
          region_layout: "sidebar-right",
          sidebar_width_percent: 30,
          background: "#111827",
          surface: "#172033",
          foreground: "#f8fafc",
          muted: "#a9b5c7",
          accent: "#9d7bff",
          corner_radius_px: 12,
          spacing_scale: 1,
          font_scale: 1,
          enter_animation: "fade",
          reveal_animation: "rise",
          visual_preset: "scientific",
          body_font: "gothic",
          heading_font: "display",
          density: "comfortable",
          motion_style: "calm",
          body_weight: 400,
          heading_weight: 800,
          line_height: 1.5,
          letter_spacing_em: 0
        }
      ],
      default_template_id: "lab",
      voicevox: {
        catalog_revision: "test-catalog",
        default_profile_id: "zundamon",
        profiles: [
          {
            id: "zundamon",
            label: "ずんだもん・ノーマル",
            speaker_uuid: "40000000-0000-4000-8000-000000000004",
            speaker_name: "ずんだもん",
            style_id: 3,
            style_name: "ノーマル",
            tuning: { speedScale: 1.1 }
          }
        ]
      },
      slides: [
        {
          id: "intro",
          title: "はじめに",
          duration_seconds: 30,
          reveal_steps: 0,
          tone: "dark",
          template_id: "lab",
          enter_animation: "fade",
          content_markdown: "# 自分の研究",
          reveal_blocks: [],
          sidebar_markdown: null,
          narration: {
            display: "commentary",
            speaker: null,
            appearance: {
              placement: "overlay-bottom",
              size: "normal",
              speaker_visible: true,
              progress_visible: true,
              text_scale: 1,
              max_lines: 3
            },
            segments: [
              {
                at: 0,
                text: "最初の読み上げ文",
                audio_src: "/stale-audio.mp3",
                speaker: "ずんだもん",
                voice_profile_id: "zundamon",
                voice_tuning: { pitchScale: 0.02 }
              }
            ]
          },
          composition: {
            mode: "canvas",
            background: "#102030",
            clip_content: true,
            blocks: [
              {
                id: "evidence-photo",
                kind: "image",
                frame: { x: 8, y: 12, width: 84, height: 76 },
                z_index: 1,
                at: 0,
                animation: "fade",
                asset_id: presentationAssetId,
                alt_text: "固定される観察画像",
                fit: "contain"
              }
            ]
          }
        }
      ]
    };
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
    const presentationSourceKey = `project-images/${presentationAssetId}.webp`;
    await env.MEDIA_BUCKET.put(
      presentationSourceKey,
      new Uint8Array([82, 73, 70, 70]),
      { httpMetadata: { contentType: "image/webp" } }
    );
    await createProjectAsset(env.DB, {
      assetId: presentationAssetId,
      projectId: "10000000-0000-4000-8000-000000000001",
      ownerUserId: "twitch-dashboard-viewer-id",
      objectKey: presentationSourceKey,
      originalFilename: "evidence.webp",
      altText: "固定される観察画像",
      width: 16,
      height: 9,
      byteSize: 4
    });

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
    expect(detailHtml).toContain(
      'action="/api/projects/10000000-0000-4000-8000-000000000001/images"'
    );
    expect(detailHtml).toContain('src="/assets/dashboard.js?v=2"');
    expect(detailHtml).toContain("基本情報を編集");
    expect(detailHtml).toContain("現在の下書きをプレビュー");
    expect(detailHtml).toContain("自由配置 1 block");
    expect(detailHtml).toContain(
      '/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/intro'
    );

    const workspaceUrl =
      "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/intro";
    const workspace = await requestProvider(
      provider,
      new Request(workspaceUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const workspaceHtml = await workspace.text();
    expect(workspace.status).toBe(200);
    expect(workspaceHtml).toContain("Slide workspace");
    expect(workspaceHtml).toContain("内容を保存");
    expect(workspaceHtml).toContain("自由配置 1 block");
    expect(workspaceHtml).toContain("data-slide-frame");
    expect(workspaceHtml).toContain("data-frame-loading");
    expect(workspaceHtml).toContain("プレビューを読み込み中…");
    expect(workspaceHtml).toContain("data-narration-settings-editor");
    expect(workspaceHtml).toContain("この区間を保存");
    expect(workspaceHtml).toContain("最初の読み上げ文");
    expect(workspaceHtml).toContain('aria-current="page"');
    expect(workspaceHtml).toContain("現在有効な設定");
    expect(workspaceHtml).toContain("実験ノート");
    expect(workspaceHtml).toContain("サイエンス");
    expect(workspaceHtml).toContain("強調見出し");
    expect(workspaceHtml).toContain("data-template-editor");
    expect(workspaceHtml).toContain("data-narration-settings-editor");
    expect(workspaceHtml).toContain("data-segment-editor");
    expect(workspaceHtml).toContain("VOICEVOX音声あり");
    expect(workspaceHtml).toContain("ずんだもん・ノーマル");
    expect(workspaceHtml).toContain("全設定を確認");
    expect(workspaceHtml).toContain("data-layout-status");
    expect(workspaceHtml).toContain('data-base-count="');

    const frameUrl = `${workspaceUrl}/frame?slide=1&step=0`;
    const frame = await requestProvider(
      provider,
      new Request(frameUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const frameHtml = await frame.text();
    expect(frame.status).toBe(200);
    expect(frame.headers.get("cache-control")).toBe("private, no-store");
    expect(frame.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'self'"
    );
    expect(frame.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(frameHtml).toContain('data-editor-frame="true"');
    expect(frameHtml).toContain('frame-ancestors \'self\'');
    const frameWithoutSession = await requestProvider(
      provider,
      new Request(frameUrl),
      authEnv
    );
    expect(frameWithoutSession.status).toBe(404);

    const dashboardScript = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/assets/dashboard.js"),
      authEnv
    );
    expect(dashboardScript.status).toBe(200);
    expect(dashboardScript.headers.get("content-type")).toContain(
      "text/javascript"
    );
    expect(dashboardScript.headers.get("cache-control")).toBe(
      "no-cache, must-revalidate"
    );
    const dashboardScriptText = await dashboardScript.text();
    expect(() => new Function(dashboardScriptText)).not.toThrow();
    expect(dashboardScriptText).toContain("queueMicrotask(syncFramePosition)");
    expect(dashboardScriptText).toContain("qualitySummary.dataset.baseCount");

    const rejectedUpload = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/images",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "image/png" },
          body: new Uint8Array([1, 2, 3])
        }
      ),
      authEnv
    );
    expect(rejectedUpload.status).toBe(403);

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
    const fieldUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/fields",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 1,
            title: "Webで微調整した研究",
            stage: "design",
            summary: "Webから保存した概要",
            question: "微調整後の問い？",
            hypothesis: "",
            method: ""
          })
        }
      ),
      authEnv
    );
    expect(fieldUpdate.status).toBe(200);
    expect(await fieldUpdate.json()).toMatchObject({ ok: true, version: 2 });

    const conflictUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/fields",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 1,
            title: "競合する変更",
            stage: "design",
            summary: "",
            question: "",
            hypothesis: "",
            method: ""
          })
        }
      ),
      authEnv
    );
    expect(conflictUpdate.status).toBe(409);
    expect(await conflictUpdate.json()).toMatchObject({
      ok: false,
      current_version: 2,
      error: { code: "PROJECT_VERSION_CONFLICT" }
    });

    const slideUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 2,
            title: "一枚ずつ確認できる結果",
            duration_seconds: 45,
            tone: "signal",
            content_markdown: "# Webから調整したfallback",
            sidebar_markdown: "読み上げない補足"
          })
        }
      ),
      authEnv
    );
    expect(slideUpdate.status).toBe(200);
    expect(await slideUpdate.json()).toMatchObject({
      ok: true,
      slide_id: "intro",
      version: 3
    });
    const staleSlideUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 2,
            title: "競合",
            duration_seconds: 45,
            tone: "signal",
            content_markdown: "fallback",
            sidebar_markdown: ""
          })
        }
      ),
      authEnv
    );
    expect(staleSlideUpdate.status).toBe(409);
    expect(await staleSlideUpdate.json()).toMatchObject({
      current_version: 3,
      error: { code: "PROJECT_VERSION_CONFLICT" }
    });

    const narrationUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/narration",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 3,
            segments: [{ at: 0, text: "Webで調整した読み上げ文" }]
          })
        }
      ),
      authEnv
    );
    expect(narrationUpdate.status).toBe(200);
    expect(await narrationUpdate.json()).toMatchObject({
      ok: true,
      slide_id: "intro",
      version: 4
    });

    const updatedWorkspace = await requestProvider(
      provider,
      new Request(workspaceUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    expect(updatedWorkspace.status).toBe(200);
    const updatedWorkspaceHtml = await updatedWorkspace.text();
    expect(updatedWorkspaceHtml).toContain("一枚ずつ確認できる結果");
    expect(updatedWorkspaceHtml).toContain("Webで調整した読み上げ文");

    const previewCreate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/previews",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ expected_version: 4 })
        }
      ),
      authEnv
    );
    expect(previewCreate.status).toBe(201);
    const previewResult = (await previewCreate.json()) as {
      revision: {
        revision_id: string;
        project_version: number;
        renderer_version: string;
      };
      preview_url: string;
    };
    expect(previewResult.revision.project_version).toBe(4);
    expect(previewResult.revision.renderer_version).toBe(
      PRESENTATION_RENDERER_VERSION
    );

    const previewPage = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${previewResult.preview_url}`, {
        headers: { cookie: browserCookies }
      }),
      authEnv
    );
    expect(previewPage.status).toBe(200);
    const previewHtml = await previewPage.text();
    expect(previewHtml).toContain("Webで微調整した研究");
    expect(previewHtml).toContain("Webで調整した読み上げ文");
    expect(previewHtml).not.toContain("/stale-audio.mp3");
    const presentationAssetUrl = `/presentation-assets/${previewResult.revision.revision_id}/${presentationAssetId}`;
    expect(previewHtml).toContain(presentationAssetUrl);

    const privateAssetWithoutSession = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${presentationAssetUrl}`),
      authEnv
    );
    expect(privateAssetWithoutSession.status).toBe(404);
    const privateAsset = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${presentationAssetUrl}`, {
        headers: { cookie: browserCookies }
      }),
      authEnv
    );
    expect(privateAsset.status).toBe(200);
    expect(privateAsset.headers.get("cache-control")).toBe("private, no-store");
    await env.MEDIA_BUCKET.delete(presentationSourceKey);

    await env.DB.prepare(
      "UPDATE presentation_revisions SET renderer_version = 'uf-renderer@1' WHERE id = ?"
    ).bind(previewResult.revision.revision_id).run();
    const staleRendererDetail = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const staleRendererHtml = await staleRendererDetail.text();
    expect(staleRendererHtml).toContain("uf-renderer@1 · 要再生成");
    expect(staleRendererHtml).toContain(
      "表示エンジンが更新されたため、新しいプレビューの確認が必要です。"
    );
    const staleRendererPublish = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/publish",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            revision_id: previewResult.revision.revision_id
          })
        }
      ),
      authEnv
    );
    expect(staleRendererPublish.status).toBe(409);
    expect(await staleRendererPublish.json()).toMatchObject({
      error: { code: "PREVIEW_STALE" }
    });
    await env.DB.prepare(
      "UPDATE presentation_revisions SET renderer_version = ? WHERE id = ?"
    ).bind(
      PRESENTATION_RENDERER_VERSION,
      previewResult.revision.revision_id
    ).run();

    const publish = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/publish",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ revision_id: previewResult.revision.revision_id })
        }
      ),
      authEnv
    );
    expect(publish.status).toBe(200);
    const publishResult = (await publish.json()) as { public_url: string };
    const publicPage = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${publishResult.public_url}`),
      authEnv
    );
    expect(publicPage.status).toBe(200);
    expect(publicPage.headers.get("cache-control")).toContain("max-age=60");
    expect(publicPage.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'"
    );
    expect(await publicPage.text()).toContain("Webで微調整した研究");
    const publishedAsset = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${presentationAssetUrl}`),
      authEnv
    );
    expect(publishedAsset.status).toBe(200);
    expect(publishedAsset.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await publishedAsset.arrayBuffer())).toEqual(
      new Uint8Array([82, 73, 70, 70])
    );

    const templateUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/templates/lab",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 4,
            name: "読みやすい実験ノート",
            region_layout: "sidebar-left",
            sidebar_width_percent: 34,
            background: "#102030",
            surface: "#182838",
            foreground: "#f8fafc",
            muted: "#b8c5d4",
            accent: "#62d6ff",
            corner_radius_px: 16,
            spacing_scale: 1.05,
            font_scale: 0.95,
            enter_animation: "slide-left",
            reveal_animation: "pop",
            visual_preset: "editorial",
            body_font: "mincho",
            heading_font: "gothic",
            density: "spacious",
            motion_style: "snappy",
            body_weight: 500,
            heading_weight: 900,
            line_height: 1.6,
            letter_spacing_em: 0.02
          })
        }
      ),
      authEnv
    );
    expect(templateUpdate.status).toBe(200);
    expect(await templateUpdate.json()).toMatchObject({
      ok: true,
      template_id: "lab",
      version: 5
    });

    const narrationSettingsUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/narration/settings",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 5,
            display: "dialogue",
            speaker: "案内役",
            appearance: {
              placement: "overlay-bottom",
              size: "large",
              text_align: "start",
              speaker_visible: true,
              progress_visible: false,
              text_scale: 1.1,
              max_lines: 4
            }
          })
        }
      ),
      authEnv
    );
    expect(narrationSettingsUpdate.status).toBe(200);
    expect(await narrationSettingsUpdate.json()).toMatchObject({
      ok: true,
      slide_id: "intro",
      version: 6
    });

    const invalidProfileUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/narration/segments/0",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 6,
            text: "保存されない文",
            speaker: null,
            voice_profile_id: "missing-profile",
            voice_tuning: null
          })
        }
      ),
      authEnv
    );
    expect(invalidProfileUpdate.status).toBe(404);
    expect(await invalidProfileUpdate.json()).toMatchObject({
      error: { code: "VOICE_PROFILE_NOT_FOUND" }
    });

    const narrationSegmentUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/narration/segments/0",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 6,
            text: "調声もWebから確認できる読み上げ文",
            speaker: "ずんだもん",
            voice_profile_id: "zundamon",
            voice_tuning: {
              speedScale: 1.2,
              pitchScale: 0.03,
              intonationScale: 1.1
            }
          })
        }
      ),
      authEnv
    );
    expect(narrationSegmentUpdate.status).toBe(200);
    expect(await narrationSegmentUpdate.json()).toMatchObject({
      ok: true,
      at: 0,
      version: 7
    });

    const customizedWorkspace = await requestProvider(
      provider,
      new Request(workspaceUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const customizedWorkspaceHtml = await customizedWorkspace.text();
    expect(customizedWorkspaceHtml).toContain("読みやすい実験ノート");
    expect(customizedWorkspaceHtml).toContain("エディトリアル");
    expect(customizedWorkspaceHtml).toContain("ADV会話枠");
    expect(customizedWorkspaceHtml).toContain("調声もWebから確認できる読み上げ文");
    expect(customizedWorkspaceHtml).toContain("ブラウザ音声で代替");

    const unsupportedUpload = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/images?filename=bad.svg",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "image/svg+xml",
            "x-csrf-token": csrfToken ?? ""
          },
          body: "<svg></svg>"
        }
      ),
      authEnv
    );
    expect(unsupportedUpload.status).toBe(422);
    expect(await unsupportedUpload.json()).toMatchObject({
      ok: false,
      error: { code: "IMAGE_TYPE_UNSUPPORTED" }
    });
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
