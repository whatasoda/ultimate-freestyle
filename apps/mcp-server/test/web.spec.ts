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
    expect(dashboardHtml).toContain("data-project-search");
    expect(dashboardHtml).toContain("タイトル・制作段階");
    expect(dashboardHtml).toContain("data-project-card");
    expect(dashboardHtml).toContain("発表 1枚 · 0分30秒");
    expect(dashboardHtml).toContain("data-project-search-empty");
    expect(dashboardHtml).toContain('data-project-filter="ready"');
    expect(dashboardHtml).toContain('data-project-filter="missing"');
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
    expect(detailHtml).toContain('src="/assets/dashboard.js?v=65"');
    expect(detailHtml).toContain("画像を選択、またはここへドロップ");
    expect(detailHtml).toContain('data-loading-style-pick="research-log"');
    expect(DASHBOARD_SCRIPT).toContain('dropzone.addEventListener("drop"');
    expect(detailHtml).toContain("全スライドの実表示を一括確認");
    expect(detailHtml).toContain("data-quality-sweep");
    expect(detailHtml).toContain("data-quality-sweep-cancel");
    expect(DASHBOARD_SCRIPT).toContain("ultimate-freestyle:set-position");
    expect(detailHtml).toContain("data-copy-public");
    expect(detailHtml).toContain('data-published-current="false"');
    expect(DASHBOARD_SCRIPT).toContain("公開URLをコピーしました");
    expect(DASHBOARD_SCRIPT).toContain("大きな画像を圧縮しています");
    expect(DASHBOARD_SCRIPT).toContain('未保存 " + dirtyCount + "件');
    expect(DASHBOARD_SCRIPT).toContain('button.textContent = "修正欄へ"');
    expect(DASHBOARD_SCRIPT).toContain("固定プレビューを準備しています…");
    expect(DASHBOARD_SCRIPT).toContain("文字の見切れ、読み上げ、自動送り");
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
    expect(detailHtml).toContain("data-public-link");
    expect(detailHtml).toContain("data-upload-preview");
    expect(detailHtml).toContain("保存時に最大2560pxのWebPへ圧縮");
    expect(detailHtml).toContain("data-delete-feedback");
    expect(detailHtml).toContain("data-image-label");
    expect(detailHtml).toContain("data-image-alt");
    expect(detailHtml).toContain("説明を保存");
    expect(detailHtml).toContain("自由配置 1 block");
    expect(detailHtml).toContain(
      '/dashboard/projects/10000000-0000-4000-8000-000000000001/slides/intro'
    );

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
    expect(voicePageHtml).toContain('value="四国めたん"');
    expect(voicePageHtml).toContain('data-voice-catalog');
    expect(voicePageHtml).toContain("7種の調声値");
    expect(voicePageHtml).toContain("既定のトーンを細かく調整");
    expect(voicePageHtml).toContain('data-voice-profile-tuning');
    expect(voicePageHtml).toContain("/voice/profile/tuning");
    expect(voicePageHtml).toContain('name="tuning_speedScale"');
    expect(voicePageHtml).toContain("実効調声を確認");
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
    expect(workspaceHtml).toContain("Slide workspace");
    expect(workspaceHtml).toContain("内容を保存");
    expect(workspaceHtml).toContain('data-markdown-action="heading"');
    expect(workspaceHtml).toContain('data-markdown-action="bold"');
    expect(workspaceHtml).toContain('data-markdown-action="table"');
    expect(DASHBOARD_SCRIPT).toContain('field.dispatchEvent(new Event("input"');
    expect(workspaceHtml).toContain("自由配置 1 block");
    expect(workspaceHtml).toContain("data-slide-frame");
    expect(workspaceHtml).toContain('data-aspect-ratio="16:9"');
    expect(workspaceHtml).toContain("表紙レイアウト");
    expect(workspaceHtml).toContain("左右均等");
    expect(workspaceHtml).toContain("第2アクセント");
    expect(workspaceHtml).toContain("data-frame-loading");
    expect(workspaceHtml).toContain("プレビューを読み込み中…");
    expect(workspaceHtml).toContain("data-narration-settings-editor");
    expect(workspaceHtml).toContain("data-segment-speech-preview");
    expect(workspaceHtml).toContain("data-segment-duration");
    expect(workspaceHtml).toContain("STEP目安");
    expect(workspaceHtml).toContain("data-narration-segment-delete");
    expect(workspaceHtml).toContain('data-inspector-section="design"');
    expect(workspaceHtml).toContain('data-inspector-section="narration"');
    expect(workspaceHtml).toContain("ブラウザ仮試聴では速度・高さ・音量を近似");
    expect(workspaceHtml).toContain("この区間を保存");
    expect(workspaceHtml).toContain("最初の読み上げ文");
    expect(workspaceHtml).toContain('aria-current="page"');
    expect(workspaceHtml).toContain('data-slide-action="duplicate"');
    expect(workspaceHtml).toContain('data-slide-action="move"');
    expect(workspaceHtml).toContain('data-slide-action="delete"');
    expect(workspaceHtml).toContain("現在有効な設定");
    expect(workspaceHtml).toContain("data-workspace-duration");
    expect(workspaceHtml).toContain("実験ノート");
    expect(workspaceHtml).toContain("サイエンス");
    expect(workspaceHtml).toContain("強調見出し");
    expect(workspaceHtml).toContain("data-template-editor");
    expect(workspaceHtml).toContain("data-template-delete");
    expect(workspaceHtml).toContain('name="make_default"');
    expect(workspaceHtml).toContain('data-visual-pick="neon"');
    expect(workspaceHtml).toContain("配色presetを選ぶ");
    expect(workspaceHtml).toContain("data-visual-palette=");
    expect(workspaceHtml).toContain('data-color-text="background"');
    expect(workspaceHtml).toContain('data-font-pick="mincho"');
    expect(workspaceHtml).toContain("本文と見出しのfontをまとめて選ぶ");
    expect(workspaceHtml).toContain('data-animation-pick="wipe"');
    expect(workspaceHtml).toContain("動きをもう一度見る");
    expect(workspaceHtml).toContain('data-tone-pick="signal"');
    expect(workspaceHtml).toContain('data-cover-pick="statement"');
    expect(workspaceHtml).toContain("表紙レイアウトを選ぶ");
    expect(workspaceHtml).toContain('data-narration-display-pick="inline"');
    expect(workspaceHtml).toContain("読み上げ文の表示形式を選ぶ");
    expect(workspaceHtml).toContain('data-region-pick="sidebar-right"');
    expect(workspaceHtml).toContain("本文と補足の領域配置を選ぶ");
    expect(workspaceHtml).toContain("data-template-create");
    expect(workspaceHtml).toContain("編集できるtemplateを追加");
    expect(workspaceHtml).toContain("data-narration-settings-editor");
    expect(workspaceHtml).toContain("data-segment-editor");
    expect(workspaceHtml).toContain("VOICEVOX音声が未生成");
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
    expect(dashboardScriptText).toContain("Array.isArray(data.fits)");
    expect(dashboardScriptText).toContain("70%未満まで縮小");
    expect(dashboardScriptText).toContain("syncPageVersion(result.version)");
    expect(dashboardScriptText).toContain('addEventListener("beforeunload"');
    expect(dashboardScriptText).toContain('field.maxLength * 0.9');
    expect(dashboardScriptText).toContain('event.key.toLowerCase() !== "s"');
    expect(dashboardScriptText).toContain("form.requestSubmit()");
    expect(dashboardScriptText).toContain('setAttribute("aria-busy", "true")');
    expect(dashboardScriptText).toContain("data-project-search-empty");
    expect(dashboardScriptText).toContain("filterProjects");
    expect(dashboardScriptText).toContain("updateImagePreview");
    expect(dashboardScriptText).toContain("URL.revokeObjectURL");
    expect(dashboardScriptText).toContain("画像の解像度を確認しています");
    expect(dashboardScriptText).toContain("width * height > 40_000_000");
    expect(dashboardScriptText).toContain("setPreviewFocus");
    expect(dashboardScriptText).toContain("workspace-preview-focus");
    expect(dashboardScriptText).toContain("const apiErrorMessage =");
    expect(dashboardScriptText).toContain("別の画面またはAIから先に更新されました");
    expect(dashboardScriptText).toContain("サーバーと通信できませんでした");
    expect(dashboardScriptText).toContain("publicLink.hidden = false");
    expect(dashboardScriptText).toContain("result.voice_generation_required");
    expect(dashboardScriptText).toContain("VOICEVOX音声を再生成してください");
    expect(dashboardScriptText).toContain("結果を反映しています");
    expect(dashboardScriptText).toContain('job.status === "completed" ? 800 : 1200');
    expect(dashboardScriptText).toContain("この画像はスライドで使用中です");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-fields");
    expect(dashboardScriptText).toContain("入力内容をプレビューへ反映しています");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-typography");
    expect(dashboardScriptText).toContain("組版をプレビューへ反映しています");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-template");
    expect(dashboardScriptText).toContain("templateをプレビューへ反映しています");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-appearance");
    expect(dashboardScriptText).toContain("スライド外観をプレビューへ反映しています");
    expect(dashboardScriptText).toContain("const colorContrast =");
    expect(dashboardScriptText).toContain("4.5:1未満の組み合わせを見直してください");
    expect(dashboardScriptText).toContain("button.dataset.copySuccess");
    expect(dashboardScriptText).toContain("まだ画像がありません");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-narration-settings");
    expect(dashboardScriptText).toContain("読み上げ枠をプレビューへ反映しています");
    expect(dashboardScriptText).toContain("説明を保存しています");
    expect(dashboardScriptText).toContain("SpeechSynthesisUtterance");
    expect(dashboardScriptText).toContain('segmentTuningValue(form, "speedScale"');
    expect(dashboardScriptText).toContain("updateSegmentDuration(form)");
    expect(dashboardScriptText).toContain("button.dataset.effectiveTuning");
    expect(dashboardScriptText).toContain("workspace-inspector");
    expect(dashboardScriptText).toContain("data-scene-component-editor");
    expect(dashboardScriptText).toContain("data-component-field");
    expect(dashboardScriptText).toContain("ultimate-freestyle:preview-scene-component");
    expect(dashboardScriptText).toContain("componentの文言をプレビューへ反映しています");
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
    const publishedAudio = await requestProvider(
      provider,
      new Request(`https://saijiyu-kenkyu.2764.moe${presentationAudioUrl}`),
      authEnv
    );
    expect(publishedAudio.status).toBe(200);
    expect(publishedAudio.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await publishedAudio.arrayBuffer())).toEqual(voiceBytes);

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
