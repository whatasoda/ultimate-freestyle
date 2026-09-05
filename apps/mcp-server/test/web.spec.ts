import { env } from "cloudflare:test";
import {
  createExecutionContext,
  waitOnExecutionContext
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createOAuthProvider } from "../src/auth/oauth";
import { upsertTwitchUser } from "../src/auth/repository";
import { createWebSession } from "../src/auth/web-session";
import { WEB_CSRF_COOKIE } from "../src/auth/security";
import { createProjectAsset } from "../src/assets/repository";
import { PRESENTATION_RENDERER_VERSION } from "../src/presentation/render";
import { createEmptyProject } from "../src/projects/schema";
import { MAX_PROJECT_DOCUMENT_BYTES } from "../src/projects/repository";
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
    AUTH_RATE_LIMITER: env.AUTH_RATE_LIMITER,
    MCP_RATE_LIMITER: env.MCP_RATE_LIMITER,
    WEB_WRITE_RATE_LIMITER: env.WEB_WRITE_RATE_LIMITER,
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
    expect(landingHtml).toContain("Remote MCP対応AI");
    expect(landingHtml).toContain("固定プレビューを最後まで見てから");
    expect(landingHtml).toContain('href="/data"');
    expect(landingHtml).toContain("Webで一枚ずつ確認");
    expect(landingHtml).toContain("確認した版を公開");

    const dataPage = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/data"),
      authEnv
    );
    const dataHtml = await dataPage.text();
    expect(dataPage.status).toBe(200);
    expect(dataHtml).toContain("保存するデータと");
    expect(dataHtml).toContain("監査記録は180日");
    expect(dataHtml).toContain("公開URLは直ちに無効");
    expect(landingHtml).toContain("限定利用者向けの制作・発表ワークスペース");
    expect(landingHtml).toContain('href="/guide"');
    expect(landingHtml).toContain("下書きは本人だけ。公開は明示操作です");
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

    const guide = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/guide"),
      authEnv
    );
    const guideHtml = await guide.text();
    expect(guide.status).toBe(200);
    expect(guideHtml).toContain("最自由研究の<br>はじめかた");
    expect(guideHtml).toContain(
      "codex mcp add saijiyu-kenkyu --url https://saijiyu-kenkyu.2764.moe/mcp"
    );
    expect(guideHtml).toContain("codex mcp login saijiyu-kenkyu");
    expect(guideHtml).toContain(
      "claude mcp add --transport http --scope user saijiyu-kenkyu https://saijiyu-kenkyu.2764.moe/mcp"
    );
    expect(guideHtml).toContain("Claudeのカスタムコネクタへ追加する");
    expect(guideHtml).toContain("Claude、Codex、ChatGPTのどれを使う？");
    expect(guideHtml).toContain("ChatGPTのDeveloper modeへ追加する");
    expect(guideHtml).toContain("カスタムRemote MCPは1件まで");
    expect(guideHtml).toContain("料金より利用可否の確認が先");
    expect(guideHtml).toContain("http://127.0.0.1");
    expect(guideHtml).toContain("Client IDやSecretは入力せず追加します");
    expect(guideHtml).toContain("公開は自動ではありません");
    expect(guideHtml).toContain("認証ボタンを連打しません");
    expect(guide.headers.get("content-security-policy")).toContain(
      "script-src 'self'"
    );

    const guideHead = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/guide", { method: "HEAD" }),
      authEnv
    );
    expect(guideHead.status).toBe(200);
    expect(await guideHead.text()).toBe("");

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
           id, owner_user_id, title, document_json, version,
           idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
      ).bind(
        "10000000-0000-4000-8000-000000000001",
        "twitch-dashboard-viewer-id",
        ownDocument.title,
        JSON.stringify(ownDocument),
        "own-project",
        now,
        now
      ),
      env.DB.prepare(
        `INSERT INTO research_projects (
           id, owner_user_id, title, document_json, version,
           idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
      ).bind(
        "20000000-0000-4000-8000-000000000002",
        "twitch-other-id",
        otherDocument.title,
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
    expect(dashboardHtml).toContain("data-dashboard-theme-toggle");
    expect(dashboardHtml).toContain("data-dashboard-theme-label>ダーク");
    expect(dashboardHtml).toContain("発表 1枚 · 0分30秒");
    expect(dashboardHtml).toContain("プレビュー未作成");
    expect(dashboardHtml).toContain("実表示 未測定");
    expect(dashboardHtml).toContain("次に：実表示 未測定 · プレビュー未作成");
    expect(dashboardHtml).toContain("音声 1/1 完成");
    expect(dashboardHtml).not.toContain("data-project-search");
    expect(dashboardHtml).not.toContain("data-project-filter");
    expect(dashboardHtml).not.toContain("data-project-sort");
    expect(dashboardHtml).toContain("AIクライアントとの接続・再接続");
    expect(dashboardHtml).toContain("https://saijiyu-kenkyu.2764.moe/mcp");
    expect(dashboardHtml).toContain("TwitchのパスワードやtokenをAIへ貼る必要はありません");
    expect(dashboardHtml).toContain("Claude Web／Desktop");
    expect(dashboardHtml).toContain("Developer modeが表示される場合");
    expect(dashboardHtml).toContain('href="/guide#choose"');
    expect(dashboardHtml).toContain('action="/account/delete"');
    expect(dashboardHtml).toContain("DELETE ACCOUNT");
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
    expect(detailHtml).toContain("保存容量");
    expect(detailHtml).not.toContain(`progress max="${MAX_PROJECT_DOCUMENT_BYTES}"`);
    expect(detailHtml).toContain(
      "自分の研究 &lt;script&gt;alert(1)&lt;/script&gt;"
    );
    expect(detailHtml).toContain(
      'action="/api/projects/10000000-0000-4000-8000-000000000001/images"'
    );
    expect(detailHtml).toContain(
      'action="/dashboard/projects/10000000-0000-4000-8000-000000000001/delete"'
    );
    expect(detailHtml).toContain('name="confirmation" required pattern="DELETE"');
    expect(detailHtml).toContain("公開URLも直ちに無効になります");
    expect(detailHtml).toContain('src="/assets/dashboard.js?v=198"');
    expect(detailHtml).toContain('href="/assets/dashboard.css?v=198"');
    expect(detailHtml).toContain(
      '<a class="skip-link" href="#main-content">本文へ移動</a>'
    );
    expect(detailHtml).toContain('<main data-surface="overview" id="main-content" tabindex="-1">');
    expect(detailHtml).toContain('class="project-section-nav" aria-label="この研究の編集項目"');
    expect(detailHtml).toContain('<a href="#publication">プレビューと公開</a>');
    expect(detailHtml).toContain('id="voice-finishing" tabindex="-1"');
    expect(detailHtml).not.toContain("<style>");
    expect(detail.headers.get("content-security-policy")).toContain(
      "style-src 'self' 'unsafe-inline'"
    );
    expect(detailHtml).toContain("data-slide-create");
    expect(detailHtml).toContain("追加して編集する");
    expect(detailHtml).toContain("画像を選択、またはここへドロップ");
    expect(detailHtml).toContain('data-loading-style-pick="research-log"');
    expect(detailHtml).toContain("0ページ目と全スライドの実表示を測定");
    expect(detailHtml).toContain('id="rendered-quality" open');
    expect(detailHtml).toContain('data-rendered-quality-state>未測定');
    expect(detailHtml).toContain("合否は付けません");
    expect(detailHtml).toContain('&quot;id&quot;:&quot;__prelude__&quot;');
    expect(detailHtml).toContain("data-quality-sweep");
    expect(detailHtml).toContain('data-report-url="/api/projects/10000000-0000-4000-8000-000000000001/quality-report"');
    expect(detailHtml).toContain(`data-renderer-version="${PRESENTATION_RENDERER_VERSION}"`);
    expect(detailHtml).toContain('data-project-version="1"');
    expect(detailHtml).toContain("段階を順番に描画");
    expect(detailHtml).toContain('data-prelude-minimum-ms="500"');
    expect(detailHtml).toContain("data-quality-sweep-cancel");
    expect(detailHtml).toContain("data-copy-public");
    expect(detailHtml).toContain('data-published-current="false"');
    expect(detailHtml).toContain('data-preview-current="false"');
    expect(detailHtml).not.toContain("公開前チェック");
    expect(detailHtml).not.toContain("文字量と表示枠");
    expect(detailHtml).toContain('data-can-preview="false"');
    expect(detailHtml).toContain("音声 0/1");
    expect(detailHtml).toContain('<dt>想定時間</dt><dd data-state="ok">0分30秒</dd>');
    expect(detailHtml).not.toContain('href="#basic-information"');
    expect(detailHtml).toContain('id="research-images"');
    expect(detailHtml).toContain('id="presentation-structure"');
    expect(detailHtml).not.toContain("研究内容を編集");
    expect(detailHtml.match(/data-project-editor/g)).toHaveLength(1);
    expect(detailHtml).toContain("公開ページの題名と説明文");
    expect(detailHtml).not.toContain("問いと仮説を保存");
    expect(detailHtml).not.toContain("わかったこと");
    expect(detailHtml).not.toContain("限界・今後の課題");
    expect(detailHtml).toContain("発表画面と0ページ目");
    expect(detailHtml).toContain("data-deck-editor");
    expect(detailHtml).toContain("ワイド 16:9");
    expect(detailHtml).toContain("標準 4:3");
    expect(detailHtml).toContain("完成までの流れ");
    expect(detailHtml).toContain("VOICEVOX<small>0/1区間</small>");
    expect(detailHtml).toContain('<progress max="5" value="1">1 / 5</progress>');
    expect(detailHtml).toContain("プレビュー<small>未作成</small>");
    expect(detailHtml).toContain("現在の下書きをプレビュー");
    expect(detailHtml).not.toContain("追加を頼む文をコピー");
    expect(detailHtml).not.toContain("構成見直しを頼む文をコピー");
    expect(detailHtml).not.toContain("AIで研究を8観点レビュー");
    expect(detailHtml).toContain("VOICEVOX音声は 0 / 1 区間まで生成済みです");
    expect(detailHtml).toMatch(/data-create-preview=[^>]+ disabled/);
    expect(detailHtml).toContain("data-preview-link");
    expect(detailHtml).toContain("data-review-preview");
    expect(detailHtml).toContain("終了画面の到達待ち");
    expect(detailHtml).toContain("data-public-link");
    expect(detailHtml).toContain("data-unpublish");
    expect(detailHtml).toContain("公開を停止");
    expect(detailHtml).toContain("data-upload-preview");
    expect(detailHtml).toContain("保存時に最大2560pxのWebPへ圧縮");
    expect(detailHtml).toContain("data-delete-feedback");
    expect(detailHtml).toContain("data-image-label");
    expect(detailHtml).toContain("data-image-alt");
    expect(detailHtml).toContain("説明を保存");
    expect(detailHtml).toContain("自由配置 1パーツ");
    expect(detailHtml).not.toContain("下書き履歴");

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
            measurements: [{
              slide_id: "intro",
              steps: 2,
              min_fit_scale: 0.68,
              min_fit_scale_step: 1,
              overflow_count: 0,
              max_overflow_px: 0,
              min_contrast_ratio: 3.9,
              min_contrast_required: 4.5,
              contrast_manual_review_count: 0,
              hidden_line_count: 0,
              min_font_size_px: 17.4,
              min_font_size_recommended_px: 24,
              max_overlap_ratio: 0,
              fallback_font_count: 0
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
      measured_slides: 1
    });
    expect(await env.DB.prepare(
      "SELECT results_json FROM project_quality_reports WHERE project_id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first()).toMatchObject({
      results_json: expect.stringContaining('"min_fit_scale":0.68')
    });
    const dashboardWithSavedQuality = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/dashboard", {
        headers: { cookie: browserCookies }
      }),
      authEnv
    );
    expect(await dashboardWithSavedQuality.text()).toContain("実表示 測定済み");
    const detailWithSavedQuality = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const detailWithSavedQualityHtml = await detailWithSavedQuality.text();
    expect(detailWithSavedQualityHtml).toContain("0ページ目と全スライドの実表示を測定 · 測定済み");
    expect(detailWithSavedQualityHtml).toContain('data-rendered-quality-state>測定済み');
    expect(detailWithSavedQualityHtml).toContain('data-saved-quality-result');
    expect(detailWithSavedQualityHtml).toContain("最小縮小率 0.68");
    expect(detailWithSavedQualityHtml).toContain("最小コントラスト 3.90:1（目安 4.5）");
    expect(detailWithSavedQualityHtml).toContain("最小文字 17.4px（目安 24.0px）");
    expect(detailWithSavedQualityHtml).toContain(
      'href="/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/intro">1. はじめに</a>'
    );
    expect(detailHtml).toContain(
      '/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/intro'
    );

    const removedRevisionPage = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/revisions/1",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    expect(removedRevisionPage.status).toBe(404);

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
    expect(voicePageHtml).toContain("次の生成");
    expect(voicePageHtml).toContain("30,000字");
    expect(voicePageHtml).toContain("data-effective-tuning");
    expect(voicePageHtml).toContain("data-voice-profile-tuning-preview");
    expect(voicePageHtml).toContain("data-voice-profile-tuning-reset");
    expect(voicePageHtml).toContain("VOICEVOX標準値へ戻す");
    expect(voicePageHtml).toContain("抑揚・間・前後無音はVOICEVOX生成後");
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
    expect(voicePageHtml).toContain("data-voice-filter-empty");
    expect(voicePageHtml).toContain("固定プレビューを作る前に全区間の生成が必要です");

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
    expect(workspaceHtml).toContain("このスライドをレビュー");
    expect(workspaceHtml).toContain("プレビュー下の編集ドック");
    expect(workspaceHtml).toContain('class="component-detail slide-creator"');
    const reviewUrl =
      "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/review?slide=intro";
    const emptyReview = await requestProvider(
      provider,
      new Request(reviewUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const emptyReviewHtml = await emptyReview.text();
    expect(emptyReview.status).toBe(200);
    expect(emptyReviewHtml).toContain("画面の文章と音声原稿");
    expect(emptyReviewHtml).toContain("画像の説明 · evidence-photo");
    expect(emptyReviewHtml).toContain("最初の読み上げ文");
    expect(emptyReviewHtml).toContain('data-kind="narration"');
    expect(emptyReviewHtml).toContain("AI修正依頼文");
    expect(emptyReviewHtml).toContain('class="review-comments" aria-label="コメントとAI修正依頼文"');
    expect(emptyReviewHtml).not.toContain('<aside class="panel review-comments">');
    expect(emptyReviewHtml).toContain("これは実行コードではありません");
    expect(emptyReviewHtml).toContain("data-review-selection-toolbar");
    expect(emptyReviewHtml).toContain("data-review-selection-action");
    expect(emptyReviewHtml).toContain("近くに出る「コメントを追加」");

    const createReviewCommentResponse = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/review-comments",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": cookieCsrfToken
          },
          body: JSON.stringify({
            target_key: "canvas:evidence-photo:alt_text",
            range_start: 5,
            range_end: 7,
            selected_text: "観察",
            body: "何を観察した画像なのか具体化してください。"
          })
        }
      ),
      authEnv
    );
    expect(createReviewCommentResponse.status).toBe(201);
    const createdReviewComment = await createReviewCommentResponse.json() as {
      comment: { id: string };
    };
    const populatedReview = await requestProvider(
      provider,
      new Request(reviewUrl, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const populatedReviewHtml = await populatedReview.text();
    expect(populatedReviewHtml).toContain("何を観察した画像なのか具体化してください。");
    expect(populatedReviewHtml).toContain("<mark");
    expect(populatedReviewHtml).toContain("現在位置");

    const reviewInstructionResponse = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/review-instruction",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": cookieCsrfToken
          },
          body: JSON.stringify({ comment_ids: [createdReviewComment.comment.id] })
        }
      ),
      authEnv
    );
    expect(reviewInstructionResponse.status).toBe(200);
    expect(await reviewInstructionResponse.json()).toMatchObject({
      ok: true,
      comment_count: 1,
      instruction: expect.stringContaining("何を観察した画像なのか具体化してください。")
    });
    const reviewCommentActionUrl =
      `https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/review-comments/${createdReviewComment.comment.id}`;
    const resolveReviewCommentResponse = await requestProvider(
      provider,
      new Request(reviewCommentActionUrl, {
        method: "PATCH",
        headers: {
          cookie: browserCookies,
          "content-type": "application/json",
          "x-csrf-token": cookieCsrfToken
        },
        body: JSON.stringify({ status: "resolved" })
      }),
      authEnv
    );
    expect(resolveReviewCommentResponse.status).toBe(200);
    expect(await resolveReviewCommentResponse.json()).toMatchObject({ comment: { status: "resolved" } });
    const deleteReviewCommentResponse = await requestProvider(
      provider,
      new Request(reviewCommentActionUrl, {
        method: "DELETE",
        headers: { cookie: browserCookies, "x-csrf-token": cookieCsrfToken }
      }),
      authEnv
    );
    expect(deleteReviewCommentResponse.status).toBe(200);
    expect(workspaceHtml).toContain(
      'href="/assets/dashboard.css?v=198"'
    );
    expect(workspaceHtml).toContain("発表全体の既定:");
    expect(workspaceHtml).toContain("スライド設定として上書きします");
    expect(workspaceHtml).toContain("基本情報と代替テキストを保存");
    expect(workspaceHtml).toContain("発表画面には直接表示されません");
    expect(workspaceHtml).toContain('data-composition-mode="canvas"');
    expect(workspaceHtml).toContain('data-inspector-section="structure" open');
    expect(workspaceHtml).toContain('class="mobile-workspace-tabs" role="tablist" aria-label="モバイル編集表示" hidden');
    expect(workspaceHtml).toContain('data-mobile-pane="preview"');
    expect(workspaceHtml).toContain('data-mobile-pane="edit"');
    expect(workspaceHtml).toContain('data-mobile-pane="slides"');
    expect(workspaceHtml).toContain('role="tablist"');
    expect(workspaceHtml).not.toContain('id="workspace-preview-pane" role="tabpanel"');
    expect(workspaceHtml).toContain('data-mobile-preview-badge');
    expect(workspaceHtml).toContain('data-markdown-action="heading"');
    expect(workspaceHtml).toContain('data-markdown-action="bold"');
    expect(workspaceHtml).toContain('data-markdown-action="table"');
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
    expect(workspaceHtml).toContain("data-filmstrip-search-count");
    expect(workspaceHtml).toContain('data-filmstrip-project="10000000-0000-4000-8000-000000000001"');
    expect(workspaceHtml).toContain("data-content-structure");
    expect(workspaceHtml).toContain("「読み物」組版を試す");
    expect(workspaceHtml).toContain('data-aspect-ratio="16:9"');
    expect(workspaceHtml).toContain("表紙レイアウト");
    expect(workspaceHtml).toContain("左右均等");
    expect(workspaceHtml).toContain("第2アクセント");
    expect(workspaceHtml).toContain("data-frame-loading");
    expect(workspaceHtml).toContain("プレビューを読み込み中…");
    expect(workspaceHtml).toContain("data-narration-settings-editor");
    expect(workspaceHtml).toContain("読み上げ枠の色");
    expect(workspaceHtml).not.toContain('name="appearance_background"');
    expect(workspaceHtml).toContain('narration-palette');
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
    expect(workspaceHtml).toContain("ブラウザ仮試聴は速度・高さ・音量と休符を近似");
    expect(workspaceHtml).toContain("この区間を保存");
    expect(workspaceHtml).toContain('id="narration-segment-0"');
    expect(workspaceHtml).toContain("最初の読み上げ文");
    expect(workspaceHtml).toContain('aria-current="page"');
    expect(workspaceHtml).toContain('data-slide-action="duplicate"');
    expect(workspaceHtml).toContain("data-slide-create");
    expect(workspaceHtml).toContain('data-slide-action="move"');
    expect(workspaceHtml).toContain('data-slide-action="delete"');
    expect(workspaceHtml).toContain("現在有効な設定");
    expect(workspaceHtml).toContain("この編集画面の使い方");
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
    expect(workspaceHtml).toContain('name="design_notes"');
    expect(workspaceHtml).toContain("このデザインの方針");
    expect(workspaceHtml).toContain('data-design-field="motif"');
    expect(workspaceHtml).toContain('data-design-pick="waves"');
    expect(workspaceHtml).toContain('data-design-field="heading_treatment"');
    expect(workspaceHtml).toContain('data-design-pick="outline"');
    expect(workspaceHtml).toContain('data-design-field="image_treatment"');
    expect(workspaceHtml).toContain('data-design-pick="monochrome"');
    expect(workspaceHtml).toContain('data-design-field="panel_treatment"');
    expect(workspaceHtml).toContain('data-design-pick="glass"');
    expect(workspaceHtml).toContain("役割ごとのデザイン差分");
    expect(workspaceHtml).toContain('data-role-style-editor');
    expect(workspaceHtml).toContain('name="role_style_role"');
    expect(workspaceHtml).toContain('<option value="section"');
    expect(workspaceHtml).toContain('<option value="comparison"');
    expect(workspaceHtml).toContain('<option value="result"');
    expect(workspaceHtml).toContain('<option value="closing"');
    expect(workspaceHtml).toContain('name="role_style_panel_treatment"');
    expect(workspaceHtml).toContain('name="role_style_visual_preset"');
    expect(workspaceHtml).toContain('name="role_style_body_font"');
    expect(workspaceHtml).toContain('name="role_style_density"');
    expect(workspaceHtml).toContain('name="role_style_spacing_scale"');
    expect(workspaceHtml).toContain('name="role_style_motion_style"');
    expect(workspaceHtml).not.toContain("AIと研究固有デザインを作る");
    expect(workspaceHtml).not.toContain("3案を相談する文をコピー");
    expect(workspaceHtml).toContain('name="motif_opacity"');
    expect(workspaceHtml).toContain('name="motif_scale"');
    expect(workspaceHtml).toContain("data-template-delete");
    expect(workspaceHtml).toContain('data-visual-pick="neon"');
    expect(workspaceHtml).toContain("配色プリセットを選ぶ");
    expect(workspaceHtml).toContain("data-visual-palette=");
    expect(workspaceHtml).toContain('data-color-text="background"');
    expect(workspaceHtml).toContain('data-font-pick="mincho"');
    expect(workspaceHtml).toContain('data-font-pick="textbook"');
    expect(workspaceHtml).toContain('data-font-pick="handwritten"');
    expect(workspaceHtml).toContain('data-font-pick="condensed"');
    expect(workspaceHtml).toContain("本文と見出しのフォントをまとめて選ぶ");
    expect(workspaceHtml).toContain('data-animation-pick="fade"');
    expect(workspaceHtml).not.toContain('data-animation-pick="wipe"');
    expect(workspaceHtml).toContain("動きをもう一度見る");
    expect(workspaceHtml).toContain('data-tone-pick="signal"');
    expect(workspaceHtml).toContain('data-cover-pick="statement"');
    expect(workspaceHtml).not.toContain('data-cover-pick="band"');
    expect(workspaceHtml).toContain("表紙レイアウトを選ぶ");
    expect(workspaceHtml).toContain('data-narration-display-pick="inline"');
    expect(workspaceHtml).toContain("読み上げ文の表示形式を選ぶ");
    expect(workspaceHtml).toContain('data-region-pick="sidebar-right"');
    expect(workspaceHtml).toContain("本文と補足の領域配置を選ぶ");
    expect(workspaceHtml).toContain("data-narration-settings-editor");
    expect(workspaceHtml).toContain("data-segment-editor");
    expect(workspaceHtml).toContain("data-voice-cue");
    expect(workspaceHtml).toContain("声を変える位置を追加");
    expect(workspaceHtml).toContain("読み上げ前後の余白");
    expect(workspaceHtml).toContain("はじめての読み上げ設定");
    expect(workspaceHtml).toContain("ずんだもん・ノーマル");
    expect(workspaceHtml).toContain("data-component-select");
    expect(workspaceHtml).toContain("data-layout-status");
    expect(workspaceHtml).not.toContain("data-inspector-pane=\"quality\"");

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
    const dashboardStyle = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/assets/dashboard.css"),
      authEnv
    );
    expect(dashboardStyle.status).toBe(200);
    expect(dashboardStyle.headers.get("cache-control")).toBe(
      "no-cache, must-revalidate"
    );
    const versionedDashboardScript = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/assets/dashboard.js?v=198"),
      authEnv
    );
    expect(versionedDashboardScript.status).toBe(200);
    expect(versionedDashboardScript.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    const versionedDashboardStyle = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/assets/dashboard.css?v=198"),
      authEnv
    );
    expect(versionedDashboardStyle.status).toBe(200);
    expect(versionedDashboardStyle.headers.get("content-type")).toContain(
      "text/css"
    );
    expect(versionedDashboardStyle.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    const dashboardScriptHead = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/assets/dashboard.js?v=198", { method: "HEAD" }),
      authEnv
    );
    expect(dashboardScriptHead.status).toBe(200);
    expect(dashboardScriptHead.headers.get("content-type")).toContain("text/javascript");
    expect(dashboardScriptHead.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(await dashboardScriptHead.text()).toBe("");
    const dashboardStyleHead = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/assets/dashboard.css?v=198", { method: "HEAD" }),
      authEnv
    );
    expect(dashboardStyleHead.status).toBe(200);
    expect(dashboardStyleHead.headers.get("content-type")).toContain("text/css");
    expect(await dashboardStyleHead.text()).toBe("");
    const dashboardStyleText = await versionedDashboardStyle.text();
    expect(dashboardStyleText.length).toBeGreaterThan(30_000);
    expect(dashboardStyleText).toContain(".workspace-head { display: grid;");
    expect(dashboardStyleText).toContain("max-width: min(100%, 32ch)");
    expect(dashboardStyleText).toContain("word-break: auto-phrase");
    expect(dashboardStyleText).toContain('--surface-warm: #fff3e8;');
    expect(dashboardStyleText).toContain(':root[data-theme="dark"]');
    expect(dashboardStyleText).toContain('main[data-surface="overview"]');
    expect(dashboardStyleText).toContain('.review-workspace { grid-template-columns: minmax(11rem, 14rem) minmax(0, 1fr);');
    expect(dashboardStyleText).toContain('.workspace-version > .slide-actions { flex: 1 0 100%;');
    expect(dashboardStyleText).toContain(
      ".step-control [data-grid-snap] { grid-column: 1 / -1; }"
    );
    expect(dashboardStyleText).toContain('[id^="research-item-"]');
    expect(dashboardStyleText).toContain(".project-section-nav a:focus-visible { background: var(--surface-accent); color: var(--ink); }");
    expect(dashboardStyleText).not.toContain("var(--text)");
    expect(dashboardStyleText).toContain("--bg: #f6f7f5");
    expect(dashboardStyleText).toContain("background: linear-gradient(var(--bg) 80%, transparent)");
    const definedDashboardTokens = new Set(
      [...dashboardStyleText.matchAll(/--([\w-]+)\s*:/g)].map((match) => match[1])
    );
    const inlineDashboardTokens = new Set([
      "swatch",
      "quality-sweep-aspect",
      "palette-border",
      "palette-background",
      "palette-accent",
      "revision-aspect",
      "workspace-aspect",
      "workspace-aspect-num",
      "component-indent"
    ]);
    const undefinedDashboardTokens = [
      ...new Set([...dashboardStyleText.matchAll(/var\(--([\w-]+)/g)].map((match) => match[1]))
    ].filter((token) => !inlineDashboardTokens.has(token) && !definedDashboardTokens.has(token));
    expect(undefinedDashboardTokens).toEqual([]);
    expect(dashboardStyleText).toContain(
      ".component-outline-row code { grid-column: 1 / -1;"
    );
    expect(dashboardStyleText).toContain(
      '[data-appearance-editor]:not(:has(select[name="role"] option[value="cover"]:checked))'
    );
    expect(dashboardStyleText).toContain(
      '.font-pick[data-font-available="false"]'
    );
    expect(dashboardStyleText).toContain(".voice-filter { position: sticky;");
    expect(dashboardStyleText).toContain(".project-section-nav, .voice-filter {");
    expect(dashboardStyleText).toContain(".voice-status.ready, .voice-status.completed { background: var(--sunken);");
    expect(dashboardStyleText).toContain(".quality-sweep-results, .preflight-list, .revision-slide-list {");
    expect(dashboardStyleText).toContain(".narration-color-pick[aria-pressed=\"true\"]");
    expect(dashboardStyleText).toContain(
      ".voice-filter-tabs { flex-wrap: nowrap;"
    );
    expect(dashboardStyleText).toContain(
      ".voice-review > summary .voice-status { grid-column: 2;"
    );
    expect(dashboardStyleText).toContain(".skip-link:focus { translate: 0;");
    const dashboardScriptText = await dashboardScript.text();
    expect(() => new Function(dashboardScriptText)).not.toThrow();

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
            summary: "Webから保存した概要",
          })
        }
      ),
      authEnv
    );
    expect(fieldUpdate.status).toBe(200);
    expect(await fieldUpdate.json()).toMatchObject({ ok: true, version: 2 });

    const bulkListUpdate = await requestProvider(
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
            expected_version: 2,
            findings: ["一括更新は受け付けない"]
          })
        }
      ),
      authEnv
    );
    expect(bulkListUpdate.status).toBe(422);
    expect(await bulkListUpdate.json()).toMatchObject({
      error: { code: "INVALID_FIELDS" }
    });

    const requestOverFormerLimit = await requestProvider(
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
            expected_version: 2,
            method: "x".repeat(20_000),
            unsupported: "x".repeat(80_000)
          })
        }
      ),
      authEnv
    );
    expect(requestOverFormerLimit.status).toBe(422);
    expect(await requestOverFormerLimit.json()).toMatchObject({
      error: { code: "INVALID_FIELDS" }
    });

    const requestOverCurrentLimit = await requestProvider(
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
            expected_version: 2,
            unsupported: "x".repeat(132 * 1024)
          })
        }
      ),
      authEnv
    );
    expect(requestOverCurrentLimit.status).toBe(413);
    expect(await requestOverCurrentLimit.json()).toMatchObject({
      error: { code: "REQUEST_TOO_LARGE" }
    });

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
            summary: ""
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

    const largeJapaneseSummary = await requestProvider(
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
            summary: "観".repeat(2_000)
          })
        }
      ),
      authEnv
    );
    expect(largeJapaneseSummary.status).toBe(409);
    expect(await largeJapaneseSummary.json()).toMatchObject({
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

    const cleanQualityReport = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/quality-report",
        {
          method: "POST",
          headers: {
            cookie: browserCookies,
            "content-type": "application/json",
            "x-csrf-token": csrfToken ?? ""
          },
          body: JSON.stringify({
            project_version: 4,
            renderer_version: PRESENTATION_RENDERER_VERSION,
            status: "completed",
            completed_checkpoints: 2,
            total_checkpoints: 2,
            measurements: []
          })
        }
      ),
      authEnv
    );
    expect(cleanQualityReport.status).toBe(200);

    const voiceReadyDetail = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const voiceReadyDetailHtml = await voiceReadyDetail.text();
    expect(voiceReadyDetailHtml).toContain("VOICEVOX<small>1/1区間</small>");
    expect(voiceReadyDetailHtml).toMatch(/data-create-preview=[^>]+data-can-preview="true"/);
    expect(voiceReadyDetailHtml).not.toMatch(/data-create-preview=[^>]+ disabled/);

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

    const unreviewedPreviewDetail = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const unreviewedPreviewDetailHtml = await unreviewedPreviewDetail.text();
    expect(unreviewedPreviewDetailHtml).toContain(
      "プレビュー<small>確認待ち</small>"
    );
    expect(unreviewedPreviewDetailHtml).toContain(
      "固定プレビューを最後まで確認する"
    );
    expect(unreviewedPreviewDetailHtml).toContain(
      `href="/preview/${previewResult.revision.revision_id}"`
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

    const reviewedPreviewDetail = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001",
        { headers: { cookie: browserCookies } }
      ),
      authEnv
    );
    const reviewedPreviewDetailHtml = await reviewedPreviewDetail.text();
    expect(reviewedPreviewDetailHtml).toContain(
      "プレビュー<small>確認済み</small>"
    );
    expect(reviewedPreviewDetailHtml).toContain(
      "確認したプレビューを公開する"
    );

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
      version_url: string;
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
    expect(publishedDetailHtml).toContain("公開中");
    expect(publishedDetailHtml).toContain("最新版が公開されています");
    expect(publishedDetailHtml).toContain("この版を確認");
    expect(publishedDetailHtml).toContain(`/preview/${previewResult.revision.revision_id}`);
    expect(publishedDetailHtml).toContain(previewResult.revision.content_hash.slice(0, 8));
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

    expect(publishResult.version_url).toBe(
      `${publishResult.public_url}/r/${previewResult.revision.revision_id}`
    );
    expect(publishedDetailHtml).toContain(
      `data-copy-url="${publishResult.version_url}"`
    );
    const versionPage = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${publishResult.version_url}`),
      authEnv
    );
    expect(versionPage.status).toBe(200);
    expect(versionPage.headers.get("cache-control")).not.toContain("immutable");
    expect(await versionPage.text()).toContain("Webで微調整した研究");

    const unpublishedRevisionId = "20000000-0000-4000-8000-0000000000ff";
    const unpublishedObjectKey = "presentation-revisions/never-published.html";
    await env.MEDIA_BUCKET.put(unpublishedObjectKey, "<html>leaked</html>");
    await env.DB.prepare(
      `INSERT INTO presentation_revisions (
         id, project_id, owner_user_id, project_version, renderer_version,
         object_key, content_hash, byte_size, created_at, reviewed_at, published_at
       )
       SELECT ?, project_id, owner_user_id, project_version, renderer_version,
              ?, content_hash, byte_size, created_at, reviewed_at, NULL
       FROM presentation_revisions WHERE id = ?`
    ).bind(
      unpublishedRevisionId,
      unpublishedObjectKey,
      previewResult.revision.revision_id
    ).run();
    const unpublishedRevisionPage = await requestProvider(
      provider,
      new Request(
        `https://saijiyu-kenkyu.2764.moe${publishResult.public_url}/r/${unpublishedRevisionId}`
      ),
      authEnv
    );
    expect(unpublishedRevisionPage.status).toBe(404);
    await env.DB.prepare("DELETE FROM presentation_revisions WHERE id = ?")
      .bind(unpublishedRevisionId)
      .run();
    await env.MEDIA_BUCKET.delete(unpublishedObjectKey);

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
    const unpublishedVersionPage = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${publishResult.version_url}`),
      authEnv
    );
    expect(unpublishedVersionPage.status).toBe(404);

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
            letter_spacing_em: 0.02,
            panel_treatment: "raised",
            role_styles: {
              result: {
                region_layout: "focus",
                background: "#20152f",
                accent: "#ff7f50",
                visual_preset: "retro-game",
                body_font: "monospace",
                density: "compact",
                spacing_scale: 0.85,
                motion_style: "dramatic",
                motif: "waves",
                heading_treatment: "boxed",
                image_treatment: "monochrome",
                panel_treatment: "glass"
              }
            }
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
        enter_animation: "slide-left",
        panel_treatment: "raised",
        role_styles: {
          result: {
            region_layout: "focus",
            visual_preset: "retro-game",
            body_font: "monospace",
            density: "compact",
            spacing_scale: 0.85,
            motion_style: "dramatic",
            image_treatment: "monochrome",
            panel_treatment: "glass"
          }
        }
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
      body_font: "mincho",
      panel_treatment: "raised",
      role_styles: {
        result: {
          background: "#20152f",
          visual_preset: "retro-game",
          body_font: "monospace",
          density: "compact",
          spacing_scale: 0.85,
          motion_style: "dramatic",
          image_treatment: "monochrome",
          panel_treatment: "glass"
        }
      }
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
              columns: 3
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
    expect(typographyWorkspaceHtml).not.toContain('name="body_scale"');

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
    const staleProfileTuningUpdate = await requestProvider(
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
              speedScale: 1,
              pitchScale: 0,
              intonationScale: 1,
              volumeScale: 1,
              pauseLengthScale: 1,
              prePhonemeLength: 0.1,
              postPhonemeLength: 0.1
            }
          })
        }
      ),
      authEnv
    );
    expect(staleProfileTuningUpdate.status).toBe(409);
    expect(await staleProfileTuningUpdate.json()).toMatchObject({
      current_version: 11,
      error: { code: "PROJECT_VERSION_CONFLICT" }
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
    const duplicateSceneTree = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/stack-1/actions",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 26, action: "duplicate" })
        }
      ),
      authEnv
    );
    expect(duplicateSceneTree.status).toBe(200);
    expect(await duplicateSceneTree.json()).toMatchObject({
      ok: true,
      version: 27,
      result_component_id: "stack-1-copy",
      affected_component_count: 2
    });
    const duplicatedSceneDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const duplicatedProjectDocument = JSON.parse(duplicatedSceneDocument!.document_json);
    const duplicatedSlide = duplicatedProjectDocument.deck.slides[0];
    const duplicatedNodes = duplicatedSlide.composition.nodes;
    expect(duplicatedNodes.find((node: { id: string }) => node.id === "stack-1-copy")).toMatchObject({ kind: "stack", parent_id: null });
    expect(duplicatedNodes.find((node: { id: string }) => node.id === "markdown-1-copy")).toMatchObject({ kind: "markdown", parent_id: "stack-1-copy" });
    duplicatedSlide.reveal_blocks = [];
    for (const segment of duplicatedSlide.narration?.segments ?? []) segment.at = 0;
    for (const node of duplicatedNodes) {
      node.at = node.id === "stack-1-copy" || node.parent_id === "stack-1-copy" ? 5 : 0;
      for (const item of node.items ?? []) item.at = 0;
    }
    duplicatedSlide.reveal_steps = 5;
    await env.DB.prepare(
      "UPDATE research_projects SET document_json = ? WHERE id = ?"
    ).bind(JSON.stringify(duplicatedProjectDocument), "10000000-0000-4000-8000-000000000001").run();
    const deleteSceneTree = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/stack-1-copy/actions",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 27, action: "delete_tree" })
        }
      ),
      authEnv
    );
    expect(deleteSceneTree.status).toBe(200);
    expect(await deleteSceneTree.json()).toMatchObject({
      ok: true,
      version: 28,
      result_component_id: null,
      affected_component_count: 2
    });
    const afterTreeDeleteDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    expect(JSON.parse(afterTreeDeleteDocument!.document_json).deck.slides[0].reveal_steps).toBe(0);
    const moveSceneChild = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/markdown-1",
        {
          method: "PATCH",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 28, component: { ...createdChild, parent_id: null, order: 0 } })
        }
      ),
      authEnv
    );
    expect(moveSceneChild.status).toBe(200);
    expect(await moveSceneChild.json()).toMatchObject({ ok: true, version: 29, component_id: "markdown-1" });
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
          body: JSON.stringify({ expected_version: 29, component: { ...createdStack, parent_id: "stack-1" } })
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
          body: JSON.stringify({ expected_version: 29, kind: "bar_chart", parent_id: "stack-1", asset_id: null })
        }
      ),
      authEnv
    );
    expect(createChartComponent.status).toBe(200);
    expect(await createChartComponent.json()).toMatchObject({ ok: true, version: 30, component_id: "bar-chart-1" });
    const addChartItem = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/bar-chart-1/items",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 30, action: "add" })
        }
      ),
      authEnv
    );
    expect(addChartItem.status).toBe(200);
    expect(await addChartItem.json()).toMatchObject({ ok: true, version: 31, result_item_id: "item-2" });
    const moveChartItem = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/bar-chart-1/items",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 31, action: "move", item_id: "item-2", position: 0 })
        }
      ),
      authEnv
    );
    expect(moveChartItem.status).toBe(200);
    expect(await moveChartItem.json()).toMatchObject({ ok: true, version: 32, result_item_id: "item-2" });
    const deleteChartItem = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/components/bar-chart-1/items",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 32, action: "delete", item_id: "item-1" })
        }
      ),
      authEnv
    );
    expect(deleteChartItem.status).toBe(200);
    expect(await deleteChartItem.json()).toMatchObject({ ok: true, version: 33, result_item_id: null });
    const createScenePattern = await requestProvider(
      provider,
      new Request(
        "https://saijiyu-kenkyu.2764.moe/api/projects/10000000-0000-4000-8000-000000000001/slides/intro/patterns",
        {
          method: "POST",
          headers: { cookie: browserCookies, "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
          body: JSON.stringify({ expected_version: 33, pattern: "pattern-key-metrics", parent_id: null })
        }
      ),
      authEnv
    );
    expect(createScenePattern.status).toBe(200);
    expect(await createScenePattern.json()).toMatchObject({
      ok: true,
      version: 34,
      component_id: "group-key-metrics-1",
      component_ids: expect.arrayContaining([
        "group-key-metrics-1-heading",
        "group-key-metrics-1-metric-3"
      ])
    });
    const patternedDocument = await env.DB.prepare(
      "SELECT document_json FROM research_projects WHERE id = ?"
    ).bind("10000000-0000-4000-8000-000000000001").first<{ document_json: string }>();
    const patternedNodes = JSON.parse(patternedDocument!.document_json).deck.slides[0].composition.nodes;
    expect(patternedNodes.find((node: { id: string }) => node.id === "group-key-metrics-1")).toMatchObject({
      kind: "stack",
      frame: { x: 5, y: 5, width: 90, height: 90 }
    });
    expect(patternedNodes.find((node: { id: string }) => node.id === "group-key-metrics-1-metric-3")).toMatchObject({
      kind: "metric",
      parent_id: "group-key-metrics-1-items"
    });
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
            expected_version: 34,
            composition_background: "#223344",
            composition_clip_content: false
          })
        }
      ),
      authEnv
    );
    expect(updateComposition.status).toBe(200);
    expect(await updateComposition.json()).toMatchObject({ ok: true, version: 35 });
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
          body: JSON.stringify({ expected_version: 35, title: "Webから追加", position: 1, template: "scene" })
        }
      ),
      authEnv
    );
    expect(createSlide.status).toBe(200);
    const createSlideResult = await createSlide.json() as { slide_id: string; version: number; next_url: string };
    expect(createSlideResult).toMatchObject({ version: 36 });
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
          body: JSON.stringify({ expected_version: 36, title: "自由構成へ変換", position: 2, template: "flow" })
        }
      ),
      authEnv
    );
    expect(createFlowSlide.status).toBe(200);
    const createFlowResult = await createFlowSlide.json() as { slide_id: string; version: number };
    expect(createFlowResult.version).toBe(37);
    const flowWorkspace = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/${createFlowResult.slide_id}`, { headers: { cookie: browserCookies } }),
      authEnv
    );
    const flowWorkspaceHtml = await flowWorkspace.text();
    expect(flowWorkspaceHtml).toContain('data-composition-mode="flow"');
    expect(flowWorkspaceHtml).toContain('data-inspector-section="content" open');
    expect(flowWorkspaceHtml).toContain('class="inspector-tabs" role="tablist" aria-label="編集項目" hidden');
    expect(flowWorkspaceHtml).toContain('id="inspector-tab-content" type="button" role="tab"');
    expect(flowWorkspaceHtml).not.toContain('data-inspector-pane="quality"');
    expect(flowWorkspaceHtml).toContain('id="inspector-tab-content"');
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
          body: JSON.stringify({ expected_version: 37, mode: "canvas" })
        }
      ),
      authEnv
    );
    expect(createComposition.status).toBe(200);
    expect(await createComposition.json()).toMatchObject({ ok: true, version: 38, mode: "canvas" });
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
        draft_version: 38,
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

    const removedRestore = await requestProvider(
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
          body: JSON.stringify({ expected_version: 38 })
        }
      ),
      authEnv
    );
    expect(removedRestore.status).toBe(404);

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
            expected_version: 38,
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
    expect(longSlideResult.version).toBe(39);
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
            expected_version: 39,
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
    expect(splitResult.version).toBe(40);
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

  it("deletes the signed-in account and clears its MCP grants", async () => {
    const authEnv = createAuthEnv();
    const provider = createOAuthProvider(
      authEnv,
      async () => Response.json({ protected: true })
    );
    const userId = await upsertTwitchUser(
      env.DB,
      {
        client_id: "twitch-client-id",
        login: "delete-web-viewer",
        scopes: ["user:read:follows", "user:read:subscriptions"],
        user_id: "delete-web-viewer-id",
        expires_in: 3600
      },
      "2026-08-01T00:00:00.000Z"
    );
    const session = await createWebSession(env.DB, {
      userId
    });
    const cookie = session.cookies
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    const csrfToken = cookie.match(
      new RegExp(`(?:^|; )${WEB_CSRF_COOKIE}=([^;]+)`)
    )?.[1];
    expect(csrfToken).toBeTruthy();
    const body = new URLSearchParams({
      csrf_token: csrfToken ?? "",
      twitch_login: "delete-web-viewer",
      confirmation: "DELETE ACCOUNT"
    });

    const response = await requestProvider(
      provider,
      new Request("https://saijiyu-kenkyu.2764.moe/account/delete", {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/x-www-form-urlencoded"
        },
        body
      }),
      authEnv
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("アカウントを削除しました");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(
      env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first()
    ).resolves.toBeNull();
  });
});
