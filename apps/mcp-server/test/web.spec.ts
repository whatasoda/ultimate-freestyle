import { env } from "cloudflare:test";
import {
  createExecutionContext,
  waitOnExecutionContext
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createOAuthProvider } from "../src/auth/oauth";
import { createProjectAsset } from "../src/assets/repository";
import { PRESENTATION_RENDERER_VERSION } from "../src/presentation/render";
import { DASHBOARD_SCRIPT } from "../src/web/assets";
import { createEmptyProject } from "../src/projects/schema";
import type { Fetcher } from "../src/auth/twitch";
import {
  VOICEVOX_ENGINE
} from "@ultimate-freestyle/research-schema/voice-generation";
import {
  createVoiceGenerationJob,
  type VoiceGenerationMessage
} from "../src/voicevox/service";

function createAuthEnv(): Env {
  return {
    OAUTH_KV: env.OAUTH_KV,
    AUTH_STATE_KV: env.AUTH_STATE_KV,
    MEDIA_BUCKET: env.MEDIA_BUCKET,
    DB: env.DB,
    VOICE_JOBS_QUEUE: env.VOICE_JOBS_QUEUE,
    VOICEVOX_CONTAINER: env.VOICEVOX_CONTAINER,
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
    const landingHtml = await landing.text();
    expect(landingHtml).toContain("Twitchでログイン");
    expect(landingHtml).toContain("kashiwoを30日以上フォロー");
    expect(landingHtml).toContain("現在サブスク中");
    expect(landingHtml).toContain("AIと研究を作る");
    expect(landingHtml).toContain("Remote MCPに対応したAIアプリ");
    expect(landingHtml).toContain("固定プレビューを最後まで見てから");
    expect(landingHtml).toContain("Webで一枚ずつ確認");
    expect(landingHtml).toContain("確認した版を公開");
    expect(landing.headers.get("content-security-policy")).toContain(
      "default-src 'none'"
    );

    const landingHead = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/", { method: "HEAD" }),
      authEnv
    );
    expect(landingHead.status).toBe(200);
    expect(await landingHead.text()).toBe("");
    expect(landingHead.headers.get("content-type")).toContain("text/html");
    expect(landingHead.headers.get("content-security-policy")).toContain(
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
    const cookieCsrfToken = csrfCookie.split("=").slice(1).join("=");

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
            speaker_uuid: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
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
        `INSERT INTO project_draft_revisions (
           project_id, owner_user_id, version, document_json, source, created_at
         ) VALUES (?, ?, 1, ?, 'created', ?)`
      ).bind(
        "10000000-0000-4000-8000-000000000001",
        "twitch-dashboard-viewer-id",
        JSON.stringify(ownDocument),
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
    expect(dashboardHtml).toContain("data-project-search");
    expect(dashboardHtml).toContain("タイトル・制作段階");
    expect(dashboardHtml).toContain("data-project-card");
    expect(dashboardHtml).toContain("発表 1枚 · 0分30秒");
    expect(dashboardHtml).toContain("data-project-search-empty");
    expect(dashboardHtml).toContain('data-project-filter="ready"');
    expect(dashboardHtml).toContain('data-project-filter="published"');
    expect(dashboardHtml).toContain('data-project-filter="attention"');
    expect(dashboardHtml).toContain('data-project-filter="missing"');
    expect(dashboardHtml).toContain('data-project-state="attention"');
    expect(dashboardHtml).toContain('data-needs-attention="true"');
    expect(dashboardHtml).toContain("プレビュー未作成");
    expect(dashboardHtml).toContain("次に：プレビュー未作成");
    expect(dashboardHtml).toContain("音声 1/1 完成");
    expect(dashboardHtml).toContain("data-project-sort");
    expect(dashboardHtml).toContain("発表時間が長い順");
    expect(dashboardHtml).toContain("AIクライアントとの接続方法");
    expect(dashboardHtml).toContain("https://saijiyu-kenkyu.2764.moe/mcp");
    expect(dashboardHtml).toContain("TwitchのパスワードやtokenをAIへ貼る必要はありません");
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
    expect(detailHtml).toContain('src="/assets/dashboard.js?v=124"');
    expect(DASHBOARD_SCRIPT).toContain("背景模様・透明度を含む概算のため目視確認");
    expect(detailHtml).toContain("data-slide-create");
    expect(detailHtml).toContain("追加して編集する");
    expect(detailHtml).toContain("画像を選択、またはここへドロップ");
    expect(detailHtml).toContain('data-loading-style-pick="research-log"');
    expect(DASHBOARD_SCRIPT).toContain('dropzone.addEventListener("drop"');
    expect(detailHtml).toContain("0ページ目と全スライドの実表示を一括確認");
    expect(detailHtml).toContain('&quot;id&quot;:&quot;__prelude__&quot;');
    expect(detailHtml).toContain("data-quality-sweep");
    expect(detailHtml).toContain('data-report-url="/api/projects/10000000-0000-4000-8000-000000000001/quality-report"');
    expect(detailHtml).toContain(`data-renderer-version="${PRESENTATION_RENDERER_VERSION}"`);
    expect(detailHtml).toContain('data-project-version="1"');
    expect(detailHtml).toContain("段階を順番に描画");
    expect(DASHBOARD_SCRIPT).toContain("advanceQualitySweep");
    expect(DASHBOARD_SCRIPT).toContain('url.searchParams.set("prelude", "1")');
    expect(DASHBOARD_SCRIPT).toContain("Number(data.step) !== sweepStep");
    expect(DASHBOARD_SCRIPT).toContain('slide.id === "__prelude__" && data.ready !== true');
    expect(DASHBOARD_SCRIPT).toContain("qualitySweepButton.dataset.preludeMinimumMs");
    expect(detailHtml).toContain('data-prelude-minimum-ms="500"');
    expect(DASHBOARD_SCRIPT).toContain("推奨色を入力");
    expect(DASHBOARD_SCRIPT).toContain('item.id === "flow:sidebar" ? "muted" : "foreground"');
    expect(detailHtml).toContain("data-quality-sweep-cancel");
    expect(DASHBOARD_SCRIPT).toContain("ultimate-freestyle:set-position");
    expect(detailHtml).toContain("data-copy-public");
    expect(detailHtml).toContain('data-published-current="false"');
    expect(detailHtml).toContain('data-preview-current="false"');
    expect(DASHBOARD_SCRIPT).toContain("公開URLをコピーしました");
    expect(DASHBOARD_SCRIPT).toContain("大きな画像を圧縮しています");
    expect(DASHBOARD_SCRIPT).toContain('未保存 " + dirtyCount + "件');
    expect(DASHBOARD_SCRIPT).toContain("publicationBaseDisabled");
    expect(DASHBOARD_SCRIPT).toContain('publishButton.dataset.previewCurrent = "false"');
    expect(DASHBOARD_SCRIPT).toContain('publishButton.dataset.previewReviewed = "false"');
    expect(DASHBOARD_SCRIPT).not.toContain("disabledBeforeDirty");
    expect(DASHBOARD_SCRIPT).toContain("templates[templateId]?.template_name");
    expect(DASHBOARD_SCRIPT).toContain("result.affected_slides.total");
    expect(DASHBOARD_SCRIPT).toContain("appearanceEditor.dataset.previewTemplates = JSON.stringify(templates)");
    expect(DASHBOARD_SCRIPT).toContain("...template");
    expect(DASHBOARD_SCRIPT).toContain("apply_line_height");
    expect(DASHBOARD_SCRIPT).toContain('templates[""] = previewTemplate(result.default_template)');
    expect(DASHBOARD_SCRIPT).toContain("activeFilmstrip.dataset.roleLabel = nextRole");
    expect(DASHBOARD_SCRIPT).toContain('button.textContent = "修正欄へ"');
    expect(DASHBOARD_SCRIPT).toContain("固定プレビューを準備しています…");
    expect(DASHBOARD_SCRIPT).toContain("文字の見切れ、読み上げ、自動送り");
    expect(DASHBOARD_SCRIPT).toContain("ultimate-freestyle:preview-review");
    expect(DASHBOARD_SCRIPT).toContain("recordCompletedPreview");
    expect(detailHtml).toContain("公開前チェック ·");
    expect(detailHtml).toContain("基本 2/4 · おすすめ 3/4");
    expect(detailHtml).toContain("公開版の画像容量");
    expect(detailHtml).toContain("表紙スライド · おすすめ");
    expect(detailHtml).toContain("文字量と表示枠 · おすすめ");
    expect(detailHtml).toContain('data-state="recommendation"');
    expect(detailHtml).toContain("研究の問いと方法");
    expect(detailHtml).toContain("表紙スライド");
    expect(detailHtml).toContain("画像の説明");
    expect(detailHtml).toContain("表示・読み上げ文");
    expect(detailHtml).toContain("音声 0/1");
    expect(detailHtml).toContain("想定発表時間");
    expect(detailHtml).toContain('<dt>想定時間</dt><dd data-state="ok">0分30秒</dd>');
    expect(detailHtml).toContain("固定プレビュー");
    expect(detailHtml).toContain("修正へ →");
    expect(detailHtml).toContain('href="#basic-information"');
    expect(detailHtml).toContain('id="research-images"');
    expect(detailHtml).toContain('id="presentation-structure"');
    expect(detailHtml).toContain("基本情報を編集");
    expect(detailHtml).toContain("発表画面と0ページ目");
    expect(detailHtml).toContain("data-deck-editor");
    expect(detailHtml).toContain("ワイド 16:9");
    expect(detailHtml).toContain("標準 4:3");
    expect(detailHtml).toContain("完成までの流れ");
    expect(detailHtml).toContain("研究の問いと方法を整理する");
    expect(detailHtml).toContain("現在の下書きをプレビュー");
    expect(detailHtml).toContain("AIでスライドを追加・構成変更");
    expect(detailHtml).toContain("追加を頼む文をコピー");
    expect(detailHtml).toContain("構成見直しを頼む文をコピー");
    expect(detailHtml).toContain("AIで研究を8観点レビュー");
    expect(detailHtml).toContain("評価を頼む文をコピー");
    expect(detailHtml).toContain("根拠がない項目はNE");
    expect(detailHtml).toContain("VOICEVOX音声は 0 / 1 区間まで生成済みです");
    expect(detailHtml).not.toMatch(/data-create-preview=[^>]+ disabled/);
    expect(detailHtml).toContain("data-preview-link");
    expect(detailHtml).toContain("data-review-preview");
    expect(detailHtml).toContain("終了画面の到達待ち");
    expect(DASHBOARD_SCRIPT).not.toContain("固定プレビューを最後の終了画面まで確認しましたか？");
    expect(detailHtml).toContain("data-public-link");
    expect(detailHtml).toContain("data-unpublish");
    expect(detailHtml).toContain("公開を停止");
    expect(DASHBOARD_SCRIPT).toContain('method: "DELETE"');
    expect(DASHBOARD_SCRIPT).toContain("固定プレビューと編集内容は残っています");
    expect(detailHtml).toContain("data-upload-preview");
    expect(detailHtml).toContain("保存時に最大2560pxのWebPへ圧縮");
    expect(detailHtml).toContain("data-delete-feedback");
    expect(detailHtml).toContain("data-image-label");
    expect(detailHtml).toContain("data-image-alt");
    expect(detailHtml).toContain("説明を保存");
    expect(detailHtml).toContain("自由配置 1パーツ");
    expect(detailHtml).toContain("/revisions/1\">内容を確認");
    expect(detailHtml).toContain("直近10版を必ず残し、最大50版・合計8MiB");

    const qualityReport = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/quality-report",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": cookieCsrfToken
          },
          body: JSON.stringify({
            project_version: 1,
            renderer_version: PRESENTATION_RENDERER_VERSION,
            status: "completed",
            completed_checkpoints: 2,
            total_checkpoints: 2,
            issue_count: 1,
            results: [{
              slide_id: "intro",
              message: "STEP 1: 小さすぎる文字1か所",
              warning: true
            }]
          })
        }
      ),
      authEnv
    );
    expect(qualityReport.status).toBe(200);
    expect(await qualityReport.json()).toMatchObject({
      ok: true,
      project_version: 1,
      status: "completed",
      issue_count: 1
    });
    expect(await env.DB.prepare(
      "SELECT issue_count, results_json FROM project_quality_reports WHERE project_id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first()).toMatchObject({
      issue_count: 1,
      results_json: expect.stringContaining("小さすぎる文字")
    });
    expect(detailHtml).toContain(
      '/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/intro'
    );

    const draftRevision = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/revisions/1",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const draftRevisionHtml = await draftRevision.text();
    expect(draftRevision.status).toBe(200);
    expect(draftRevisionHtml).toContain("v1を復元前に確認");
    expect(draftRevisionHtml).toContain("現在版 v1 との差");
    expect(draftRevisionHtml).toContain("これは現在の下書きです");
    expect(draftRevisionHtml).toContain("研究内容</dt><dd>変更なし");
    expect(draftRevisionHtml).toContain("発表全体の設定</dt><dd>変更なし");
    expect(draftRevisionHtml).toContain("<span>同じ</span>");
    expect(draftRevisionHtml).toContain("/revisions/1/frame?slide=0&amp;step=0");

    const draftRevisionFrame = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/revisions/1/frame?slide=0&step=0",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    expect(draftRevisionFrame.status).toBe(200);
    expect(await draftRevisionFrame.text()).toContain('data-renderer-version="uf-renderer@102"');

    const voicePage = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/voice",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const voicePageHtml = await voicePage.text();
    expect(voicePage.status).toBe(200);
    expect(voicePageHtml).toContain("40話者・118種類");
    expect(voicePageHtml).toContain('value="voicevox-style-3" selected');
    expect(voicePageHtml).toContain('data-voice-speaker');
    expect(voicePageHtml).toContain('data-voice-selection-form');
    expect(voicePageHtml).toContain('data-initial-profile="voicevox-style-3"');
    expect(voicePageHtml).toContain('value="四国めたん"');
    expect(voicePageHtml).toContain('data-voice-catalog');
    expect(voicePageHtml).toContain("7種の調声値");
    expect(voicePageHtml).toContain("既定のトーンを細かく調整");
    expect(voicePageHtml).toContain('data-voice-profile-tuning');
    expect(voicePageHtml).toContain('data-voicevox-sample="/api/projects/10000000-0000-4000-8000-000000000001/voice/sample"');
    expect(voicePageHtml).toContain("選択中の声をVOICEVOXで試聴");
    expect(voicePageHtml).toContain("初回はContainer起動に時間がかかる場合があります");
    expect(voicePageHtml).toContain("/voice/profile/tuning");
    expect(voicePageHtml).toContain('name="tuning_speedScale"');
    expect(voicePageHtml).toContain("実効調声を確認");
    expect(voicePageHtml).toContain("音声概算");
    expect(voicePageHtml).toContain("生成対象");
    expect(voicePageHtml).toContain("30,000字");
    expect(voicePageHtml).toContain("data-effective-tuning");
    expect(voicePageHtml).toContain("data-voice-profile-tuning-preview");
    expect(voicePageHtml).toContain("data-voice-profile-tuning-reset");
    expect(voicePageHtml).toContain("VOICEVOX標準値へ戻す");
    expect(voicePageHtml).toContain("抑揚・間・前後無音はVOICEVOX生成後");
    expect(DASHBOARD_SCRIPT).toContain("既定のトーンを保存しています");
    expect(DASHBOARD_SCRIPT).toContain("これは最自由研究の読み上げテストです");
    expect(DASHBOARD_SCRIPT).toContain("rebuildVoiceStyles");
    expect(voicePageHtml).toContain("おすすめの声");
    expect(voicePageHtml).toContain('data-voice-configured="true"');
    expect(voicePageHtml).toContain("該当区間の再生成が必要になります");
    expect(voicePageHtml).toContain('data-voice-filter="needs_generation"');
    expect(voicePageHtml).toContain("data-voice-search");
    expect(voicePageHtml).toContain("要生成（失敗含む）");
    expect(voicePageHtml).toContain("data-voice-visible");
    expect(voicePageHtml).toContain("スライド名・原稿・声を検索");
    expect(voicePageHtml).toContain("data-voice-preview-feedback");
    expect(voicePageHtml).toContain("?step=0&narration=0#narration-segment-0");
    expect(DASHBOARD_SCRIPT).toContain("data-voice-preview-seek");
    expect(DASHBOARD_SCRIPT).toContain("updatePreviewTimeline");
    expect(voicePageHtml).toContain("data-voice-filter-empty");
    expect(voicePageHtml).toContain("音声生成は任意です");

    const workspaceUrl =
      "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/intro";
    const workspace = await requestProvider(
      provider,
      new Request(workspaceUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const workspaceHtml = await workspace.text();
    expect(workspace.status).toBe(200);
    expect(workspaceHtml).toContain("スライド編集");
    expect(workspaceHtml).toContain(".workspace-head { display: grid;");
    expect(workspaceHtml).toContain("max-width: min(100%, 32ch)");
    expect(workspaceHtml).toContain("word-break: auto-phrase");
    expect(workspaceHtml).toContain("発表全体の既定:");
    expect(workspaceHtml).toContain("スライド設定として上書きします");
    expect(workspaceHtml).toContain("基本情報と代替テキストを保存");
    expect(workspaceHtml).toContain("発表画面には直接表示されません");
    expect(workspaceHtml).toContain('data-composition-mode="canvas"');
    expect(workspaceHtml).toContain('data-inspector-section="structure" open');
    expect(workspaceHtml).toContain('class="mobile-workspace-tabs"');
    expect(workspaceHtml).toContain('.step-control [data-grid-snap] { grid-column: 1 / -1; }');
    expect(workspaceHtml).toContain('.component-outline-row code { grid-column: 1 / -1;');
    expect(workspaceHtml).toContain('data-mobile-pane="preview"');
    expect(workspaceHtml).toContain('data-mobile-pane="edit"');
    expect(workspaceHtml).toContain('data-mobile-pane="slides"');
    expect(workspaceHtml).toContain('role="tablist"');
    expect(workspaceHtml).toContain('role="tabpanel"');
    expect(workspaceHtml).toContain('data-mobile-preview-badge');
    expect(workspaceHtml).toContain('data-markdown-action="heading"');
    expect(workspaceHtml).toContain('data-markdown-action="bold"');
    expect(workspaceHtml).toContain('data-markdown-action="table"');
    expect(DASHBOARD_SCRIPT).toContain('field.dispatchEvent(new Event("input"');
    expect(DASHBOARD_SCRIPT).toContain("updateRecommendedBodyLimit");
    expect(DASHBOARD_SCRIPT).toContain("data-component-color-hex");
    expect(workspaceHtml).toContain("自由配置 1パーツ");
    expect(workspaceHtml).toContain("data-canvas-block-editor");
    expect(workspaceHtml).toContain("位置と大きさ");
    expect(workspaceHtml).toContain("重なり順");
    expect(workspaceHtml).toContain("/blocks/evidence-photo");
    expect(workspaceHtml).toContain('data-canvas-block-action="duplicate"');
    expect(workspaceHtml).toContain('data-canvas-block-action="delete"');
    expect(workspaceHtml).toContain("data-canvas-block-create");
    expect(workspaceHtml).toContain("表示パーツを追加");
    expect(workspaceHtml).toContain("data-composition-editor");
    expect(workspaceHtml).toContain("スライド枠外を隠す");
    expect(workspaceHtml).toContain("data-slide-frame");
    expect(workspaceHtml).toContain("data-content-structure");
    expect(workspaceHtml).toContain("「読み物」組版を試す");
    expect(workspaceHtml).toContain('data-aspect-ratio="16:9"');
    expect(workspaceHtml).toContain("表紙レイアウト");
    expect(workspaceHtml).toContain('[data-appearance-editor]:has(select[name="role"] option[value="content"]:checked)');
    expect(workspaceHtml).toContain("左右均等");
    expect(workspaceHtml).toContain("第2アクセント");
    expect(workspaceHtml).toContain("data-frame-loading");
    expect(workspaceHtml).toContain("プレビューを読み込み中…");
    expect(workspaceHtml).toContain("data-narration-settings-editor");
    expect(workspaceHtml).toContain("読み上げ枠の色");
    expect(workspaceHtml).toContain('name="appearance_background"');
    expect(workspaceHtml).toContain("話者・進捗色");
    expect(workspaceHtml).toContain("夜のパネル");
    expect(workspaceHtml).toContain("ずんだ色");
    expect(workspaceHtml).toContain("形式の既定");
    expect(workspaceHtml).toContain("data-segment-speech-preview");
    expect(workspaceHtml).toContain("data-segment-voicevox-sample");
    expect(workspaceHtml).toContain("data-segment-duration");
    expect(workspaceHtml).toContain("data-profile-tunings");
    expect(workspaceHtml).toContain("data-profile-catalogs");
    expect(workspaceHtml).toContain("この声をVOICEVOXで試聴");
    expect(workspaceHtml).toContain("STEP目安");
    expect(workspaceHtml).toContain("data-narration-segment-delete");
    expect(workspaceHtml).toContain('data-inspector-section="design"');
    expect(workspaceHtml).toContain('data-inspector-section="narration"');
    expect(workspaceHtml).toContain("ブラウザ仮試聴では速度・高さ・音量を近似");
    expect(workspaceHtml).toContain("この区間を保存");
    expect(workspaceHtml).toContain('id="narration-segment-0"');
    expect(workspaceHtml).toContain("最初の読み上げ文");
    expect(workspaceHtml).toContain('aria-current="page"');
    expect(workspaceHtml).toContain('data-slide-action="duplicate"');
    expect(workspaceHtml).toContain("data-slide-create");
    expect(workspaceHtml).toContain('data-slide-action="move"');
    expect(workspaceHtml).toContain('data-slide-action="delete"');
    expect(workspaceHtml).toContain("現在有効な設定");
    expect(workspaceHtml).toContain("data-preview-templates");
    expect(workspaceHtml).toContain("&quot;background&quot;:&quot;#111827&quot;");
    expect(workspaceHtml).toContain("&quot;sidebar_width_percent&quot;:30");
    expect(workspaceHtml).toContain("data-workspace-duration");
    expect(workspaceHtml).toContain("実験ノート");
    expect(workspaceHtml).toContain("サイエンス");
    expect(workspaceHtml).toContain("ミュージアム");
    expect(workspaceHtml).toContain("ターミナル");
    expect(workspaceHtml).toContain('data-visual-pick="museum"');
    expect(workspaceHtml).toContain('data-visual-pick="terminal"');
    expect(workspaceHtml).toContain("強調見出し");
    expect(workspaceHtml).toContain("data-template-editor");
    expect(workspaceHtml).toContain("data-template-delete");
    expect(workspaceHtml).toContain('name="make_default"');
    expect(workspaceHtml).toContain('data-visual-pick="neon"');
    expect(workspaceHtml).toContain("配色プリセットを選ぶ");
    expect(workspaceHtml).toContain("data-visual-palette=");
    expect(workspaceHtml).toContain('data-color-text="background"');
    expect(workspaceHtml).toContain('data-font-pick="mincho"');
    expect(workspaceHtml).toContain('data-font-pick="textbook"');
    expect(workspaceHtml).toContain('data-font-pick="handwritten"');
    expect(workspaceHtml).toContain('data-font-pick="condensed"');
    expect(workspaceHtml).toContain("本文と見出しのフォントをまとめて選ぶ");
    expect(workspaceHtml).toContain('data-animation-pick="wipe"');
    expect(workspaceHtml).toContain("動きをもう一度見る");
    expect(workspaceHtml).toContain('data-tone-pick="signal"');
    expect(workspaceHtml).toContain('data-cover-pick="statement"');
    expect(workspaceHtml).toContain('data-cover-pick="band"');
    expect(workspaceHtml).toContain('data-cover-pick="corner"');
    expect(workspaceHtml).toContain('data-cover-pick="frame"');
    expect(workspaceHtml).toContain("表紙レイアウトを選ぶ");
    expect(workspaceHtml).toContain('data-narration-display-pick="inline"');
    expect(workspaceHtml).toContain("読み上げ文の表示形式を選ぶ");
    expect(workspaceHtml).toContain('data-region-pick="sidebar-right"');
    expect(workspaceHtml).toContain("本文と補足の領域配置を選ぶ");
    expect(workspaceHtml).toContain("data-template-create");
    expect(workspaceHtml).toContain("編集できるテンプレートを追加");
    expect(workspaceHtml).toContain("data-narration-settings-editor");
    expect(workspaceHtml).toContain("data-segment-editor");
    expect(workspaceHtml).toContain("VOICEVOX音声が未生成");
    expect(workspaceHtml).toContain("ずんだもん・ノーマル");
    expect(workspaceHtml).toContain("data-component-select");
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
    const preludeFrame = await requestProvider(
      provider,
      new Request(`${frameUrl}&prelude=1`, {
        headers: { cookie: browserCookies }
      }),
      authEnv
    );
    const preludeFrameHtml = await preludeFrame.text();
    expect(preludeFrame.status).toBe(200);
    expect(preludeFrameHtml).toContain('data-editor-prelude="true"');
    expect(preludeFrameHtml).toContain("slide_id: '__prelude__'");
    expect(preludeFrameHtml).toMatch(/<section class="prelude"[^>]*>\s*<div/);
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
    expect(dashboardScriptText).toContain("Array.isArray(data.fits)");
    expect(dashboardScriptText).toContain("70%未満まで縮小");
    expect(dashboardScriptText).toContain("小さすぎる文字");
    expect(dashboardScriptText).toContain("表示パーツの重なり");
    expect(dashboardScriptText).toContain("ultimate-freestyle:save-component");
    expect(dashboardScriptText).toContain("未保存の変更はありません");
    expect(dashboardScriptText).toContain("syncPageVersion(result.version)");
    expect(dashboardScriptText).toContain('addEventListener("beforeunload"');
    expect(dashboardScriptText).toContain("ultimate-freestyle:form-draft:");
    expect(dashboardScriptText).toContain("更新前の未保存入力を復元しました");
    expect(dashboardScriptText).toContain("現在版へ入力を適用");
    expect(dashboardScriptText).toContain("退避内容をコピー");
    expect(dashboardScriptText).toContain("current_version: Number(result.current_version)");
    expect(dashboardScriptText).toContain("ultimate-freestyle:version-changed");
    expect(dashboardScriptText).toContain('field.maxLength * 0.9');
    expect(dashboardScriptText).toContain('event.key.toLowerCase() !== "s"');
    expect(dashboardScriptText).toContain("form.requestSubmit()");
    expect(dashboardScriptText).toContain('setAttribute("aria-busy", "true")');
    expect(dashboardScriptText).toContain("data-project-search-empty");
    expect(dashboardScriptText).toContain("filterProjects");
    expect(dashboardScriptText).toContain("ultimate-freestyle:quality-sweep:");
    expect(dashboardScriptText).toContain("data-voicevox-sample");
    expect(dashboardScriptText).toContain("data-segment-voicevox-sample");
    expect(dashboardScriptText).toContain("未保存の声とトーンで短い固定文");
    expect(dashboardScriptText).toContain('voicevoxSampleButton.textContent = "準備を中止"');
    expect(dashboardScriptText).toContain('response.headers.get("x-voicevox-cache")');
    expect(dashboardScriptText).toContain('persistQualitySweep("completed")');
    expect(dashboardScriptText).toContain('void saveQualitySweep("completed")');
    expect(dashboardScriptText).toContain("前回の確認結果：");
    expect(dashboardScriptText).toContain('card.dataset.needsAttention === "true"');
    expect(dashboardScriptText).toContain("updateImagePreview");
    expect(dashboardScriptText).toContain("URL.revokeObjectURL");
    expect(dashboardScriptText).toContain("画像の解像度を確認しています");
    expect(dashboardScriptText).toContain("width * height > 40_000_000");
    expect(dashboardScriptText).toContain("setPreviewFocus");
    expect(dashboardScriptText).toContain("workspace-preview-focus");
    expect(dashboardScriptText).toContain("workspace-mobile-pane");
    expect(dashboardScriptText).toContain('#narration-segment-');
    expect(dashboardScriptText).toContain('setMobilePane("edit")');
    expect(dashboardScriptText).toContain('setMobilePane("edit")');
    expect(dashboardScriptText).toContain('event.key === "ArrowRight"');
    expect(dashboardScriptText).toContain('mobilePreviewPending');
    expect(dashboardScriptText).toContain('const markMobilePreviewPending = (awaitDiagnostics = false)');
    expect(dashboardScriptText).toContain('previewFrameLoadedGeneration === previewFrameGeneration');
    expect(dashboardScriptText).toContain('confirmMobilePreview()');
    expect(dashboardScriptText).not.toContain('if (pane === "preview") document.body.dataset.mobilePreviewPending = "false"');
    expect(dashboardScriptText).toContain("const apiErrorMessage =");
    expect(dashboardScriptText).toContain("別の画面またはAIから先に更新されました");
    expect(dashboardScriptText).toContain("サーバーと通信できませんでした");
    expect(dashboardScriptText).toContain("publicLink.hidden = false");
    expect(dashboardScriptText).toContain("到達記録を再試行");
    expect(dashboardScriptText).toContain("500 * (2 ** (reviewRetryCount - 1))");
    expect(dashboardScriptText).toContain("reloadPublicationWhenSafe(publishFeedback)");
    expect(dashboardScriptText).toContain('[data-versioned-form], [data-project-editor]');
    expect(dashboardScriptText).toContain("syncPublicationDirtyState(dirtyCount)");
    expect(dashboardScriptText).toContain("未保存の入力を保護するため自動再読み込みを止めました");
    expect(dashboardScriptText).toContain("result.voice_generation_required");
    expect(dashboardScriptText).toContain("VOICEVOX音声を再生成してください");
    expect(dashboardScriptText).toContain("ultimate-freestyle:voice-selection:");
    expect(dashboardScriptText).toContain("ultimate-freestyle:voice-tuning:");
    expect(dashboardScriptText).toContain("未保存選択を復元しました");
    expect(dashboardScriptText).toContain("未保存のトーン調整を復元しました");
    expect(dashboardScriptText).toContain("結果を反映しています");
    expect(dashboardScriptText).toContain('job.status === "completed" ? 800 : 1200');
    expect(dashboardScriptText).toContain("この画像はスライドで使用中です");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-fields");
    expect(dashboardScriptText).toContain("入力内容をプレビューへ反映しています");
    expect(dashboardScriptText).toContain("代替テキストを編集中です");
    expect(dashboardScriptText).toContain("基本情報と代替テキストを保存しました");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-typography");
    expect(dashboardScriptText).toContain("組版をプレビューへ反映しています");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-template");
    expect(dashboardScriptText).toContain("テンプレートをプレビューへ反映しています");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-appearance");
    expect(dashboardScriptText).toContain("スライド外観をプレビューへ反映しています");
    expect(dashboardScriptText).toContain("const colorContrast =");
    expect(dashboardScriptText).toContain("4.5:1未満の組み合わせを見直してください");
    expect(dashboardScriptText).toContain("button.dataset.copySuccess");
    expect(dashboardScriptText).toContain("まだ画像がありません");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-narration-settings");
    expect(dashboardScriptText).toContain("data-narration-color-preview");
    expect(dashboardScriptText).toContain("data-narration-color-pick");
    expect(dashboardScriptText).toContain("data-narration-color-reset");
    expect(dashboardScriptText).toContain('item.id === "narration" ? "appearance_foreground"');
    expect(dashboardScriptText).toContain("読み上げ枠をプレビューへ反映しています");
    expect(dashboardScriptText).toContain("説明を保存しています");
    expect(dashboardScriptText).toContain("SpeechSynthesisUtterance");
    expect(dashboardScriptText).toContain('segmentTuningValue(form, "speedScale"');
    expect(dashboardScriptText).toContain("updateSegmentDuration(form)");
    expect(dashboardScriptText).toContain("profileTunings[profileSelect.value]");
    expect(dashboardScriptText).toContain('field.placeholder = "実効 "');
    expect(dashboardScriptText).toContain("button.dataset.effectiveTuning");
    expect(dashboardScriptText).toContain("workspace-inspector");
    expect(dashboardScriptText).toContain("data-scene-component-editor");
    expect(dashboardScriptText).toContain("ultimate-freestyle:select-component");
    expect(dashboardScriptText).toContain("ultimate-freestyle:move-component");
    expect(dashboardScriptText).toContain("保存すると確定します");
    expect(dashboardScriptText).toContain('["x", "y", "width", "height"]');
    expect(dashboardScriptText).toContain("ultimate-freestyle:set-editor-options");
    expect(dashboardScriptText).toContain("ultimate-freestyle:grid-snap");
    expect(dashboardScriptText).toContain("data-component-frame-reset");
    expect(dashboardScriptText).toContain("form.dataset.component = JSON.stringify");
    expect(dashboardScriptText).toContain("data-slide-create");
    expect(dashboardScriptText).toContain("data-composition-create");
    expect(dashboardScriptText).toContain("読み上げ文の省略");
    expect(dashboardScriptText).toContain("data.clamps");
    expect(dashboardScriptText).toContain("data-scene-component-action");
    expect(dashboardScriptText).toContain("data-scene-component-create");
    expect(dashboardScriptText).toContain("data-scene-item-action");
    expect(dashboardScriptText).toContain("data-component-order");
    expect(dashboardScriptText).toContain("form.requestSubmit()");
    expect(dashboardScriptText).toContain("updateContentStructure");
    expect(dashboardScriptText).toContain("spokenCharacters / 6");
    expect(dashboardScriptText).toContain("data-component-field");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-scene-component");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-canvas-block");
    expect(dashboardScriptText).toContain("syncSceneComponentDraft(form)");
    expect(dashboardScriptText).toContain("syncCanvasBlockDraft(form)");
    expect(dashboardScriptText).not.toContain("syncSceneComponentDrafts");
    expect(dashboardScriptText).not.toContain("syncCanvasBlockDrafts");
    expect(dashboardScriptText).toContain("data-canvas-block-editor");
    expect(dashboardScriptText).toContain("data-canvas-block-action");
    expect(dashboardScriptText).toContain("data-canvas-block-create");
    expect(dashboardScriptText).toContain("表示パーツを複製しています");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-composition");
    expect(dashboardScriptText).toContain("表示パーツの変更をプレビューへ反映しています");
    expect(dashboardScriptText).toContain("data-component-frame-toggle");
    expect(dashboardScriptText).toContain("fontProbeContext.measureText");
    expect(dashboardScriptText).toContain("localFontAvailable");
    expect(dashboardScriptText).toContain("button.dataset.fontAvailable = String(available)");
    expect(dashboardScriptText).toContain("ultimate-freestyle:persist-drafts");
    expect(dashboardScriptText).toContain('positionUrl.searchParams.set("step", String(currentStep))');
    expect(dashboardScriptText).toContain('positionUrl.searchParams.set("component", workspace.dataset.selectedComponent)');
    expect(dashboardScriptText).toContain('history.replaceState(history.state, "", positionUrl)');
    expect(dashboardScriptText).toContain('positionUrl.searchParams.set("narration", workspace.dataset.selectedNarration)');
    expect(dashboardScriptText).toContain("data-component-search");
    expect(dashboardScriptText).toContain('row.hidden = !matches');
    expect(dashboardScriptText).toContain("ultimate-freestyle:set-editor-selection");
    expect(dashboardScriptText).toContain("navigateToComponent(data.component_id)");
    expect(dashboardScriptText).toContain("component.frame = null");
    expect(dashboardScriptText).toContain("左位置と幅の合計を100%以内にしてください");
    expect(dashboardScriptText).toContain("スライド枠を越えています");
    expect(dashboardScriptText).toContain("data-component-frame-preset");
    expect(dashboardScriptText).toContain("data-component-style-reset");
    expect(dashboardScriptText).toContain("delete owner[key]");
    expect(dashboardScriptText).toContain("changingConfiguredVoice");
    expect(dashboardScriptText).toContain("新しい声で再生成が必要になります");

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
    const altUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/images/30000000-0000-4000-8000-000000000003",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ alt_text: "Webで更新した画像説明" })
        }
      ),
      authEnv
    );
    expect(altUpdate.status).toBe(200);
    expect(await altUpdate.json()).toMatchObject({
      ok: true,
      asset: { alt_text: "Webで更新した画像説明" }
    });
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
            method: "",
            findings: ["Webで整理した結果"],
            limitations: ["追加の測定が必要"]
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

    const incompletePreview = await requestProvider(
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
    expect(incompletePreview.status).toBe(409);
    expect(await incompletePreview.json()).toMatchObject({
      error: { code: "VOICE_INCOMPLETE" }
    });

    const queuedVoice: VoiceGenerationMessage[] = [];
    const voiceJob = await createVoiceGenerationJob(
      {
        DB: env.DB,
        VOICE_JOBS_QUEUE: {
          sendBatch: async (
            messages: Array<{ body: VoiceGenerationMessage }>
          ) => queuedVoice.push(...messages.map((message) => message.body))
        } as unknown as Queue<VoiceGenerationMessage>
      },
      {
        ownerUserId: "twitch-dashboard-viewer-id",
        projectId: "10000000-0000-4000-8000-000000000001",
        expectedVersion: 4,
        idempotencyKey: "71000000-0000-4000-8000-000000000007"
      }
    );
    expect(voiceJob.job.status).toBe("queued");
    expect(queuedVoice).toHaveLength(1);
    const fingerprint = queuedVoice[0]!.fingerprint;
    const voiceObjectKey = `voice-cache/test/${fingerprint}.mp3`;
    const voiceBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]);
    await env.MEDIA_BUCKET.put(voiceObjectKey, voiceBytes, {
      httpMetadata: { contentType: "audio/mpeg" }
    });
    await env.DB.prepare(
      `INSERT INTO voice_audio_artifacts (
         fingerprint, owner_user_id, project_id, object_key, content_hash,
         mime_type, byte_size, engine_version, image_digest, created_at
       ) VALUES (?, ?, ?, ?, ?, 'audio/mpeg', ?, ?, ?, ?)`
    ).bind(
      fingerprint,
      "twitch-dashboard-viewer-id",
      "10000000-0000-4000-8000-000000000001",
      voiceObjectKey,
      "a".repeat(64),
      voiceBytes.byteLength,
      VOICEVOX_ENGINE.version,
      VOICEVOX_ENGINE.imageDigest,
      now
    ).run();

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
        content_hash: string;
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
    expect(previewHtml).toContain(`"previewRevisionId":"${previewResult.revision.revision_id}"`);
    expect(previewHtml).toContain("ultimate-freestyle:preview-completed:");
    expect(previewHtml).not.toContain("/stale-audio.mp3");
    const presentationAudioUrl = `/presentation-audio/${previewResult.revision.revision_id}/intro/0.mp3`;
    expect(previewHtml).toContain(presentationAudioUrl);
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
    const privateAudioWithoutSession = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${presentationAudioUrl}`),
      authEnv
    );
    expect(privateAudioWithoutSession.status).toBe(404);
    const privateAudio = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${presentationAudioUrl}`, {
        headers: { cookie: browserCookies }
      }),
      authEnv
    );
    expect(privateAudio.status).toBe(200);
    expect(privateAudio.headers.get("content-type")).toBe("audio/mpeg");
    await env.MEDIA_BUCKET.delete(voiceObjectKey);
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

    const overDurationDocument = structuredClone(ownDocument);
    overDurationDocument.deck!.slides[0].duration_seconds = 1_200;
    overDurationDocument.deck!.slides.push({
      ...structuredClone(overDurationDocument.deck!.slides[0]),
      id: "over-duration",
      title: "時間超過確認",
      duration_seconds: 1
    });
    await env.DB.prepare(
      "UPDATE research_projects SET document_json = ? WHERE id = ?"
    ).bind(
      JSON.stringify(overDurationDocument),
      "10000000-0000-4000-8000-000000000001"
    ).run();
    const overDurationPublish = await requestProvider(
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
    expect(overDurationPublish.status).toBe(409);
    expect(await overDurationPublish.json()).toMatchObject({
      error: { code: "PRESENTATION_DURATION_EXCEEDED" }
    });
    await env.DB.prepare(
      "UPDATE research_projects SET document_json = ? WHERE id = ?"
    ).bind(
      JSON.stringify(ownDocument),
      "10000000-0000-4000-8000-000000000001"
    ).run();

    const unreviewedPublish = await requestProvider(
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
    expect(unreviewedPublish.status).toBe(409);
    expect(await unreviewedPublish.json()).toMatchObject({
      error: { code: "PREVIEW_NOT_REVIEWED" }
    });
    const review = await requestProvider(
      provider,
      new Request(
        `https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/previews/${previewResult.revision.revision_id}/review`,
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "x-csrf-token": csrfToken ?? ""
          }
        }
      ),
      authEnv
    );
    expect(review.status).toBe(200);
    expect(await review.json()).toMatchObject({
      publication: {
        latest_preview: {
          revision_id: previewResult.revision.revision_id,
          reviewed_at: expect.any(String)
        }
      }
    });

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
    const publishResult = (await publish.json()) as {
      public_url: string;
      publication: {
        published_history: Array<{ revision_id: string }>;
        events: Array<{ action: string; from_revision_id: string | null; to_revision_id: string | null }>;
      };
    };
    expect(publishResult.publication.published_history).toContainEqual({
      revision_id: previewResult.revision.revision_id,
      project_id: "10000000-0000-4000-8000-000000000001",
      project_version: 4,
      renderer_version: PRESENTATION_RENDERER_VERSION,
      object_key: expect.any(String),
      content_hash: expect.any(String),
      byte_size: expect.any(Number),
      created_at: expect.any(String),
      reviewed_at: expect.any(String),
      published_at: expect.any(String)
    });
    expect(publishResult.publication.events[0]).toMatchObject({
      action: "publish",
      from_revision_id: null,
      to_revision_id: previewResult.revision.revision_id,
      to_project_version: 4
    });
    const publishedDetail = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const publishedDetailHtml = await publishedDetail.text();
    expect(publishedDetailHtml).toContain("公開可能な過去版 · 1件");
    expect(publishedDetailHtml).toContain("公開操作履歴 · 1件");
    expect(publishedDetailHtml).toContain("公開開始");
    expect(publishedDetailHtml).toContain("非公開 → v4");
    expect(publishedDetailHtml).toContain("下書き履歴 · 4件");
    expect(publishedDetailHtml).toContain("公開中");
    expect(publishedDetailHtml).toContain("この版を確認");
    expect(publishedDetailHtml).toContain(`/preview/${previewResult.revision.revision_id}`);
    expect(publishedDetailHtml).toContain(previewResult.revision.content_hash.slice(0, 8));
    expect(DASHBOARD_SCRIPT).toContain("data-publish-rollback");
    expect(DASHBOARD_SCRIPT).toContain("以前の公開版へ戻しました");
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
    const publishedAudio = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${presentationAudioUrl}`),
      authEnv
    );
    expect(publishedAudio.status).toBe(200);
    expect(publishedAudio.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await publishedAudio.arrayBuffer())).toEqual(voiceBytes);

    const unpublish = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/publish",
        {
          method: "DELETE",
          headers: {
            cookie: browserCookies,
            "x-csrf-token": csrfToken ?? ""
          }
        }
      ),
      authEnv
    );
    expect(unpublish.status).toBe(200);
    expect(await unpublish.json()).toMatchObject({
      publication: {
        published: null,
        events: expect.arrayContaining([
          expect.objectContaining({
            action: "unpublish",
            from_project_version: 4,
            to_project_version: null
          })
        ])
      },
      public_url: null
    });
    const unpublishedPage = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${publishResult.public_url}`),
      authEnv
    );
    expect(unpublishedPage.status).toBe(404);

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
      template: {
        name: "読みやすい実験ノート",
        enter_animation: "slide-left"
      },
      default_template_id: "lab",
      default_template: {
        id: "lab",
        visual_preset: "editorial",
        body_font: "mincho",
        region_layout: "sidebar-left"
      },
      deck_layout: "minimal",
      affected_slides: { direct: 1, inherited: 0, total: 1 },
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
              max_lines: 4,
              background: "#102030",
              foreground: "#f8fafc",
              border_color: "#91ddff",
              accent: "#ffcf32",
              corner_radius_px: 18
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
    const narrationAppearanceDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    expect(JSON.parse(narrationAppearanceDocument!.document_json).deck.slides[0].narration.appearance).toMatchObject({
      background: "#102030",
      foreground: "#f8fafc",
      border_color: "#91ddff",
      accent: "#ffcf32",
      corner_radius_px: 18
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
      voice_generation_required: true,
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

    const deckSettingsUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/presentation/settings",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 7,
            aspect_ratio: "4:3",
            loading_screen: {
              enabled: true,
              style: "research-log",
              message: "実験道具を準備しています",
              show_progress: false,
              minimum_duration_ms: 900
            }
          })
        }
      ),
      authEnv
    );
    expect(deckSettingsUpdate.status).toBe(200);
    expect(await deckSettingsUpdate.json()).toMatchObject({
      ok: true,
      version: 8
    });

    const fourThreeWorkspace = await requestProvider(
      provider,
      new Request(workspaceUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const fourThreeWorkspaceHtml = await fourThreeWorkspace.text();
    expect(fourThreeWorkspaceHtml).toContain('data-aspect-ratio="4:3"');
    expect(fourThreeWorkspaceHtml).toContain("--workspace-aspect:4 / 3");
    expect(fourThreeWorkspaceHtml).toContain("data-template-impact");
    expect(fourThreeWorkspaceHtml).toContain("直接指定 1枚・既定を継承 0枚");

    const templateCreate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/templates",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 8,
            template_id: "web-variant",
            name: "実験ノートの派生",
            visual_preset: "neon",
            source_template_id: "lab",
            make_default: false
          })
        }
      ),
      authEnv
    );
    expect(templateCreate.status).toBe(201);
    expect(await templateCreate.json()).toMatchObject({
      ok: true,
      template_id: "web-variant",
      version: 9
    });
    const templateDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const clonedTemplate = JSON.parse(templateDocument!.document_json).deck.templates.find(
      (template: { id: string }) => template.id === "web-variant"
    );
    expect(clonedTemplate).toMatchObject({
      name: "実験ノートの派生",
      visual_preset: "editorial",
      background: "#102030",
      body_font: "mincho"
    });

    const typographyUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/typography",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 9,
            typography: {
              preset: "columns",
              columns: 3,
              body_scale: 0.6,
              heading_scale: 0.7,
              line_height: 1.55,
              paragraph_spacing_em: 0.6,
              column_gap_em: 2.4,
              text_align: "start",
              vertical_align: "start"
            }
          })
        }
      ),
      authEnv
    );
    expect(typographyUpdate.status).toBe(200);
    expect(await typographyUpdate.json()).toMatchObject({
      ok: true,
      slide_id: "intro",
      version: 10
    });

    const typographyWorkspace = await requestProvider(
      provider,
      new Request(workspaceUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const typographyWorkspaceHtml = await typographyWorkspace.text();
    expect(typographyWorkspaceHtml).toContain("2段組み（長文） · 3段");
    expect(typographyWorkspaceHtml).toContain('data-typography-editor');
    expect(typographyWorkspaceHtml).toContain('name="body_scale"');

    const profileTuningUpdate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/voice/profile/tuning",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 10,
            tuning: {
              speedScale: 1.2,
              pitchScale: 0.05,
              intonationScale: 1.1,
              volumeScale: 0.9,
              pauseLengthScale: 1.15,
              prePhonemeLength: 0.12,
              postPhonemeLength: 0.18
            }
          })
        }
      ),
      authEnv
    );
    expect(profileTuningUpdate.status).toBe(200);
    expect(await profileTuningUpdate.json()).toMatchObject({
      ok: true,
      version: 11,
      voice_generation_required: true
    });
    const tunedDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    expect(JSON.parse(tunedDocument!.document_json).deck.voicevox.profiles[0].tuning).toMatchObject({
      speedScale: 1.2,
      pauseLengthScale: 1.15
    });

    const duplicateSlide = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/actions",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ expected_version: 11, action: "duplicate" })
        }
      ),
      authEnv
    );
    expect(duplicateSlide.status).toBe(200);
    const duplicateResult = (await duplicateSlide.json()) as {
      slide_id: string;
      version: number;
      next_url: string;
    };
    expect(duplicateResult).toMatchObject({ version: 12 });
    expect(duplicateResult.next_url).toContain(duplicateResult.slide_id);
    const duplicatedDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const duplicatedSlides = JSON.parse(duplicatedDocument!.document_json).deck.slides;
    expect(duplicatedSlides).toHaveLength(2);
    expect(duplicatedSlides[1]).toMatchObject({
      id: duplicateResult.slide_id,
      title: "はじめに（複製）",
      narration: { segments: [{ audio_src: null }] }
    });

    const moveSlide = await requestProvider(
      provider,
      new Request(
        `https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/${duplicateResult.slide_id}/actions`,
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ expected_version: 12, action: "move", position: 0 })
        }
      ),
      authEnv
    );
    expect(moveSlide.status).toBe(200);
    expect(await moveSlide.json()).toMatchObject({ version: 13 });

    const deleteSlide = await requestProvider(
      provider,
      new Request(
        `https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/${duplicateResult.slide_id}/actions`,
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ expected_version: 13, action: "delete" })
        }
      ),
      authEnv
    );
    expect(deleteSlide.status).toBe(200);
    expect(await deleteSlide.json()).toMatchObject({
      version: 14,
      slide_id: "intro"
    });
    const deleteLastSlide = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/actions",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ expected_version: 14, action: "delete" })
        }
      ),
      authEnv
    );
    expect(deleteLastSlide.status).toBe(409);
    expect(await deleteLastSlide.json()).toMatchObject({
      error: { code: "LAST_SLIDE_REQUIRED" }
    });

    const deleteNarrationSegment = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/narration/segments/0",
        {
          method: "DELETE",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ expected_version: 14 })
        }
      ),
      authEnv
    );
    expect(deleteNarrationSegment.status).toBe(200);
    expect(await deleteNarrationSegment.json()).toMatchObject({ version: 15, at: 0 });
    const workspaceWithoutNarration = await requestProvider(
      provider,
      new Request(workspaceUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const workspaceWithoutNarrationHtml = await workspaceWithoutNarration.text();
    expect(workspaceWithoutNarrationHtml).toContain("data-narration-segment-create");
    expect(workspaceWithoutNarrationHtml).toContain("data-segment-preview");
    expect(workspaceWithoutNarrationHtml).toContain('data-slide-id="intro"');
    expect(workspaceWithoutNarrationHtml).toContain("data-segment-speech-preview");
    expect(workspaceWithoutNarrationHtml).toContain('data-segment-speech-preview aria-pressed="false" disabled');
    expect(workspaceWithoutNarrationHtml).toContain("既定の声をVOICEVOXで試聴");
    expect(workspaceWithoutNarrationHtml).toContain("data-duration-breakdown");
    expect(workspaceWithoutNarrationHtml).toContain("同じSTEPへ移動します");
    expect(workspaceWithoutNarrationHtml).toContain("最初の原稿を入力できます");

    const createNarrationSegment = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/narration/segments",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 15,
            at: 0,
            text: "Webから追加した読み上げ文"
          })
        }
      ),
      authEnv
    );
    expect(createNarrationSegment.status).toBe(200);
    expect(await createNarrationSegment.json()).toMatchObject({ version: 16, at: 0 });

    const deleteTemplate = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/templates/lab",
        {
          method: "DELETE",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ expected_version: 16 })
        }
      ),
      authEnv
    );
    expect(deleteTemplate.status).toBe(200);
    expect(await deleteTemplate.json()).toMatchObject({
      ok: true,
      template_id: "lab",
      version: 17
    });
    const documentWithoutTemplate = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const deletedTemplateDeck = JSON.parse(documentWithoutTemplate!.document_json).deck;
    expect(deletedTemplateDeck.default_template_id).toBeNull();
    expect(deletedTemplateDeck.slides[0].template_id).toBeNull();
    expect(deletedTemplateDeck.templates.some((template: { id: string }) => template.id === "lab")).toBe(false);

    const sceneDocument = JSON.parse(documentWithoutTemplate!.document_json);
    const updateCanvasBlock = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/blocks/evidence-photo",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 17,
            block: {
              ...sceneDocument.deck.slides[0].composition.blocks[0],
              frame: { x: 10, y: 14, width: 80, height: 70 },
              alt_text: "Webで更新した配置画像"
            }
          })
        }
      ),
      authEnv
    );
    expect(updateCanvasBlock.status).toBe(200);
    expect(await updateCanvasBlock.json()).toMatchObject({ ok: true, version: 18, block_id: "evidence-photo" });
    const canvasDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    expect(JSON.parse(canvasDocument!.document_json).deck.slides[0].composition.blocks[0]).toMatchObject({
      alt_text: "Webで更新した配置画像",
      frame: { x: 10, y: 14, width: 80, height: 70 }
    });
    const duplicateCanvasBlock = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/blocks/evidence-photo/actions",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 18, action: "duplicate" })
        }
      ),
      authEnv
    );
    expect(duplicateCanvasBlock.status).toBe(200);
    expect(await duplicateCanvasBlock.json()).toMatchObject({ ok: true, version: 19, result_block_id: "evidence-photo-copy" });
    const deleteCanvasBlock = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/blocks/evidence-photo-copy/actions",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 19, action: "delete" })
        }
      ),
      authEnv
    );
    expect(deleteCanvasBlock.status).toBe(200);
    expect(await deleteCanvasBlock.json()).toMatchObject({ ok: true, version: 20, result_block_id: null });
    const createCanvasBlock = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/blocks",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 20, kind: "shape", asset_id: null })
        }
      ),
      authEnv
    );
    expect(createCanvasBlock.status).toBe(200);
    expect(await createCanvasBlock.json()).toMatchObject({ ok: true, version: 21, block_id: "shape-1" });
    sceneDocument.deck.slides[0].composition = {
      mode: "scene",
      runtime_version: "uf-runtime@1",
      background: "#102030",
      clip_content: true,
      nodes: [{
        id: "web-note",
        kind: "markdown",
        parent_id: null,
        order: 0,
        at: 0,
        animation: "fade",
        frame: null,
        markdown: "Webで位置も編集する"
      }]
    };
    await env.DB.prepare(
      "UPDATE research_projects SET document_json = ? WHERE id = ?"
    ).bind(JSON.stringify(sceneDocument), "10000000-0000-4000-8000-000000000001").run();
    const positionComponent = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/web-note",
        {
          method: "PATCH",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 21,
            component: {
              ...sceneDocument.deck.slides[0].composition.nodes[0],
              frame: { x: 8, y: 12, width: 84, height: 72 }
            }
          })
        }
      ),
      authEnv
    );
    expect(positionComponent.status).toBe(200);
    expect(await positionComponent.json()).toMatchObject({ ok: true, version: 22 });
    const positionedDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const positionedNode = JSON.parse(positionedDocument!.document_json).deck.slides[0].composition.nodes[0];
    expect(positionedNode.frame).toEqual({
      x: 8,
      y: 12,
      width: 84,
      height: 72
    });
    expect(positionedNode.style).toBeUndefined();
    const duplicateSceneComponent = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/web-note/actions",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 22, action: "duplicate" })
        }
      ),
      authEnv
    );
    expect(duplicateSceneComponent.status).toBe(200);
    expect(await duplicateSceneComponent.json()).toMatchObject({ ok: true, version: 23, result_component_id: "web-note-copy" });
    const deleteSceneComponent = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/web-note-copy/actions",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 23, action: "delete" })
        }
      ),
      authEnv
    );
    expect(deleteSceneComponent.status).toBe(200);
    expect(await deleteSceneComponent.json()).toMatchObject({ ok: true, version: 24, result_component_id: null });
    const createSceneContainer = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 24, kind: "stack", parent_id: null, asset_id: null })
        }
      ),
      authEnv
    );
    expect(createSceneContainer.status).toBe(200);
    expect(await createSceneContainer.json()).toMatchObject({ ok: true, version: 25, component_id: "stack-1" });
    const createSceneChild = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 25, kind: "markdown", parent_id: "stack-1", asset_id: null })
        }
      ),
      authEnv
    );
    expect(createSceneChild.status).toBe(200);
    expect(await createSceneChild.json()).toMatchObject({ ok: true, version: 26, component_id: "markdown-1" });
    const createdSceneDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const createdNodes = JSON.parse(createdSceneDocument!.document_json).deck.slides[0].composition.nodes;
    const createdStack = createdNodes.find((node: { id: string }) => node.id === "stack-1");
    expect(createdStack).toMatchObject({ kind: "stack", parent_id: null });
    expect(createdNodes.find((node: { id: string }) => node.id === "markdown-1")).toMatchObject({ kind: "markdown", parent_id: "stack-1", frame: null });
    const createdChild = createdNodes.find((node: { id: string }) => node.id === "markdown-1");
    const moveSceneChild = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/markdown-1",
        {
          method: "PATCH",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 26, component: { ...createdChild, parent_id: null, order: 0 } })
        }
      ),
      authEnv
    );
    expect(moveSceneChild.status).toBe(200);
    expect(await moveSceneChild.json()).toMatchObject({ ok: true, version: 27, component_id: "markdown-1" });
    const movedSceneDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const movedNodes = JSON.parse(movedSceneDocument!.document_json).deck.slides[0].composition.nodes;
    expect(movedNodes.find((node: { id: string }) => node.id === "markdown-1")).toMatchObject({ parent_id: null, order: 0 });
    const cycleSceneComponent = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/stack-1",
        {
          method: "PATCH",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 27, component: { ...createdStack, parent_id: "stack-1" } })
        }
      ),
      authEnv
    );
    expect(cycleSceneComponent.status).toBe(422);
    expect(await cycleSceneComponent.json()).toMatchObject({ ok: false, error: { code: "INVALID_FIELDS" } });
    const createChartComponent = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 27, kind: "bar_chart", parent_id: "stack-1", asset_id: null })
        }
      ),
      authEnv
    );
    expect(createChartComponent.status).toBe(200);
    expect(await createChartComponent.json()).toMatchObject({ ok: true, version: 28, component_id: "bar-chart-1" });
    const addChartItem = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/bar-chart-1/items",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 28, action: "add" })
        }
      ),
      authEnv
    );
    expect(addChartItem.status).toBe(200);
    expect(await addChartItem.json()).toMatchObject({ ok: true, version: 29, result_item_id: "item-2" });
    const moveChartItem = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/bar-chart-1/items",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 29, action: "move", item_id: "item-2", position: 0 })
        }
      ),
      authEnv
    );
    expect(moveChartItem.status).toBe(200);
    expect(await moveChartItem.json()).toMatchObject({ ok: true, version: 30, result_item_id: "item-2" });
    const deleteChartItem = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/bar-chart-1/items",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 30, action: "delete", item_id: "item-1" })
        }
      ),
      authEnv
    );
    expect(deleteChartItem.status).toBe(200);
    expect(await deleteChartItem.json()).toMatchObject({ ok: true, version: 31, result_item_id: null });
    const updateComposition = await requestProvider(
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
            expected_version: 31,
            composition_background: "#223344",
            composition_clip_content: false
          })
        }
      ),
      authEnv
    );
    expect(updateComposition.status).toBe(200);
    expect(await updateComposition.json()).toMatchObject({ ok: true, version: 32 });
    const recoloredDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    expect(JSON.parse(recoloredDocument!.document_json).deck.slides[0].composition).toMatchObject({
      background: "#223344",
      clip_content: false
    });
    const createSlide = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 32, title: "Webから追加", position: 1, template: "scene" })
        }
      ),
      authEnv
    );
    expect(createSlide.status).toBe(200);
    const createSlideResult = await createSlide.json() as { slide_id: string; version: number; next_url: string };
    expect(createSlideResult).toMatchObject({ version: 33 });
    expect(createSlideResult.next_url).toContain(createSlideResult.slide_id);
    const documentWithCreatedSlide = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const createdSlide = JSON.parse(documentWithCreatedSlide!.document_json).deck.slides[1];
    expect(createdSlide).toMatchObject({
      id: createSlideResult.slide_id,
      title: "Webから追加",
      composition: { mode: "scene", runtime_version: "uf-runtime@1" }
    });
    const createFlowSlide = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 33, title: "自由構成へ変換", position: 2, template: "flow" })
        }
      ),
      authEnv
    );
    expect(createFlowSlide.status).toBe(200);
    const createFlowResult = await createFlowSlide.json() as { slide_id: string; version: number };
    expect(createFlowResult.version).toBe(34);
    const flowWorkspace = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/${createFlowResult.slide_id}`, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const flowWorkspaceHtml = await flowWorkspace.text();
    expect(flowWorkspaceHtml).toContain('data-composition-mode="flow"');
    expect(flowWorkspaceHtml).toContain('data-inspector-section="content" open');
    expect(flowWorkspaceHtml).toContain("内容を保存");
    expect(flowWorkspaceHtml).toContain("data-composition-create");
    expect(flowWorkspaceHtml).toContain("選んだ自由構成を開始");
    const createComposition = await requestProvider(
      provider,
      new Request(
        `https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/${createFlowResult.slide_id}/composition`,
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 34, mode: "canvas" })
        }
      ),
      authEnv
    );
    expect(createComposition.status).toBe(200);
    expect(await createComposition.json()).toMatchObject({ ok: true, version: 35, mode: "canvas" });
    const documentWithComposition = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const convertedSlide = JSON.parse(documentWithComposition!.document_json).deck.slides.find((item: { id: string }) => item.id === createFlowResult.slide_id);
    expect(convertedSlide.composition).toMatchObject({ mode: "canvas", blocks: [{ id: "main-text", kind: "markdown" }] });

    const rollbackPublish = await requestProvider(
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
    expect(rollbackPublish.status).toBe(200);
    expect(await rollbackPublish.json()).toMatchObject({
      publication: {
        draft_version: 35,
        published: { revision_id: previewResult.revision.revision_id, project_version: 4 },
        events: expect.arrayContaining([
          expect.objectContaining({
            action: "rollback",
            from_project_version: null,
            to_project_version: 4
          })
        ])
      }
    });
    const rolledBackPage = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${publishResult.public_url}`),
      authEnv
    );
    expect(rolledBackPage.status).toBe(200);
    expect(await rolledBackPage.text()).toContain("Webで微調整した研究");

    const restoreDraft = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/revisions/4/restore",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({ expected_version: 35 })
        }
      ),
      authEnv
    );
    expect(restoreDraft.status).toBe(200);
    expect(await restoreDraft.json()).toMatchObject({
      ok: true,
      restored_from_version: 4,
      version: 36
    });
    const restoredDetail = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const restoredDetailHtml = await restoredDetail.text();
    expect(restoredDetailHtml).toContain("下書き履歴 · 36件");
    expect(restoredDetailHtml).toContain("v36");
    expect(restoredDetailHtml).toContain("復元");
    expect(DASHBOARD_SCRIPT).toContain("data-draft-restore");
    expect(DASHBOARD_SCRIPT).toContain("現在の保存済み下書きも履歴に残ります");

    const createLongSlide = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 36,
            title: "長文を分ける",
            position: 1,
            template: "flow"
          })
        }
      ),
      authEnv
    );
    expect(createLongSlide.status).toBe(200);
    const longSlideResult = await createLongSlide.json() as {
      slide_id: string;
      version: number;
    };
    expect(longSlideResult.version).toBe(37);
    const longSlideWorkspace = await requestProvider(
      provider,
      new Request(
        `https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/${longSlideResult.slide_id}`,
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const longSlideWorkspaceHtml = await longSlideWorkspace.text();
    expect(longSlideWorkspaceHtml).toContain("カーソル位置で2枚に分割");
    expect(longSlideWorkspaceHtml).toContain("data-slide-split");
    const splitContent = "## 前半\n\n観察した条件を詳しく説明します。\n\n## 後半\n\n結果と考察を詳しく説明します。";
    const splitOffset = splitContent.indexOf("## 後半");
    const beforeSplitRow = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const beforeSplitDocument = JSON.parse(beforeSplitRow!.document_json);
    const longSlide = beforeSplitDocument.deck.slides.find(
      (item: { id: string }) => item.id === longSlideResult.slide_id
    );
    const narrationTemplate = beforeSplitDocument.deck.slides[0].narration;
    const segmentTemplate = narrationTemplate.segments[0];
    longSlide.reveal_steps = 3;
    longSlide.reveal_blocks = [
      { at: 1, markdown: "前半の追加情報" },
      { at: 3, markdown: "後半の追加情報" }
    ];
    longSlide.narration = {
      ...narrationTemplate,
      segments: [
        { ...segmentTemplate, at: 0, text: "前半の導入", audio_src: null },
        { ...segmentTemplate, at: 2, text: "後半の導入", audio_src: null },
        { ...segmentTemplate, at: 3, text: "後半の結論", audio_src: null }
      ]
    };
    await env.DB.prepare(
      "UPDATE research_projects SET document_json = ? WHERE id = ?"
    ).bind(JSON.stringify(beforeSplitDocument), "10000000-0000-4000-8000-000000000001").run();
    const splitLongSlide = await requestProvider(
      provider,
      new Request(
        `https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/${longSlideResult.slide_id}/split`,
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            expected_version: 37,
            split_offset: splitOffset,
            title: "長文を分ける",
            duration_seconds: 60,
            content_markdown: splitContent,
            sidebar_markdown: "前半だけの補足"
          })
        }
      ),
      authEnv
    );
    expect(splitLongSlide.status).toBe(200);
    const splitResult = await splitLongSlide.json() as {
      version: number;
      next_slide_id: string;
    };
    expect(splitResult.version).toBe(38);
    const splitDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{
      document_json: string;
    }>();
    const splitSlides = JSON.parse(splitDocument!.document_json).deck.slides;
    const splitBefore = splitSlides.find(
      (item: { id: string }) => item.id === longSlideResult.slide_id
    );
    const splitAfter = splitSlides.find(
      (item: { id: string }) => item.id === splitResult.next_slide_id
    );
    expect(splitBefore).toMatchObject({
      title: "長文を分ける",
      content_markdown: "## 前半\n\n観察した条件を詳しく説明します。",
      sidebar_markdown: "前半だけの補足",
      reveal_steps: 1,
      reveal_blocks: [{ at: 1, markdown: "前半の追加情報" }],
      narration: { segments: [{ at: 0, text: "前半の導入" }] }
    });
    expect(splitAfter).toMatchObject({
      title: "長文を分ける（続き）",
      content_markdown: "## 後半\n\n結果と考察を詳しく説明します。",
      sidebar_markdown: "前半だけの補足",
      reveal_steps: 1,
      reveal_blocks: [{ at: 1, markdown: "後半の追加情報" }],
      narration: {
        segments: [
          { at: 0, text: "後半の導入" },
          { at: 1, text: "後半の結論" }
        ]
      },
      composition: null
    });
    expect(splitBefore.duration_seconds + splitAfter.duration_seconds).toBe(60);
    expect(DASHBOARD_SCRIPT).toContain("本文の先頭と末尾以外へカーソルを置いてください");
    expect(DASHBOARD_SCRIPT).toContain("内容以外の未保存設定を先に保存してください");
    expect(DASHBOARD_SCRIPT).toContain("段階表示と読み上げは想定時間の位置に応じて前後へ分けます");
    expect(DASHBOARD_SCRIPT).toContain("sessionStorage.removeItem(form.dataset.draftKey)");

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
  }, 10_000);
});
