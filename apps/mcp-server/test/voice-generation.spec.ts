import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { getProject } from "../src/projects/repository";
import { createEmptyProject } from "../src/projects/schema";
import {
  createVoiceGenerationJob,
  getVoiceGenerationJob,
  getOrCreateVoiceSample,
  getVoiceProjectStatus,
  hydrateProjectVoice,
  processVoiceGenerationMessage,
  resolveVoiceArtifacts,
  setupZundamonProfile,
  type VoiceGenerationMessage
} from "../src/voicevox/service";

describe("VOICEVOX generation", () => {
  it("generates an exact style sample once and reuses the shared cache", async () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01]);
    let synthesisCount = 0;
    let synthesisBody: unknown;
    const containerNamespace = {
      getByName: () => ({
        startAndWaitForPorts: async () => undefined,
        fetch: async (_url: string, init: RequestInit) => {
          synthesisCount += 1;
          synthesisBody = JSON.parse(String(init.body));
          return new Response(mp3, {
            headers: { "content-type": "audio/mpeg", "content-length": String(mp3.byteLength) }
          });
        }
      })
    } as unknown as Env["VOICEVOX_CONTAINER"];
    let cacheMissCount = 0;
    const options = {
      profileId: "voicevox-style-117",
      tuning: {
        speedScale: 1.13,
        pitchScale: 0.07,
        intonationScale: 1.2,
        volumeScale: 0.9,
        pauseLengthScale: 1.1,
        prePhonemeLength: 0.12,
        postPhonemeLength: 0.18
      },
      onCacheMiss: async () => { cacheMissCount += 1; }
    };

    const first = await getOrCreateVoiceSample(
      { MEDIA_BUCKET: env.MEDIA_BUCKET, VOICEVOX_CONTAINER: containerNamespace },
      options
    );
    const second = await getOrCreateVoiceSample(
      { MEDIA_BUCKET: env.MEDIA_BUCKET, VOICEVOX_CONTAINER: containerNamespace },
      options
    );

    expect(first).toMatchObject({ cached: false, profileLabel: "あんこもん・ささやき" });
    expect(second).toMatchObject({ cached: true, fingerprint: first.fingerprint });
    expect(synthesisCount).toBe(1);
    expect(cacheMissCount).toBe(1);
    expect(synthesisBody).toMatchObject({
      style_id: 117,
      tuning: { speedScale: 1.13, intonationScale: 1.2 }
    });
  });

  it("shows narration segments before a VOICEVOX profile is configured", async () => {
    const userId = "51000000-0000-4000-8000-000000000005";
    const projectId = "61000000-0000-4000-8000-000000000006";
    const now = "2026-07-29T00:00:00.000Z";
    const document = createEmptyProject("音声設定前テスト");
    document.deck = {
      short_title: "設定前テスト",
      description: "",
      author: "tester",
      year: 2026,
      accent: "#8bd450",
      layout: "minimal",
      narration_defaults: null,
      voicevox: null,
      slides: [
        {
          id: "intro",
          title: "設定前でも見える原稿",
          duration_seconds: 10,
          reveal_steps: 0,
          tone: "dark",
          content_markdown: "# 音声設定前テスト",
          reveal_blocks: [],
          sidebar_markdown: null,
          narration: {
            display: "commentary",
            speaker: null,
            segments: [
              {
                at: 0,
                text: "声を決める前にも原稿を確認できます。",
                audio_src: null
              }
            ]
          }
        }
      ]
    };
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(userId, "voice-unconfigured-user", "voice-unconfigured", now, now),
      env.DB.prepare(
        `INSERT INTO research_projects (
           id, owner_user_id, title, stage, document_json, version,
           idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      ).bind(
        projectId,
        userId,
        document.title,
        document.stage,
        JSON.stringify(document),
        "voice-unconfigured-test",
        now,
        now
      )
    ]);

    const status = await getVoiceProjectStatus(env.DB, userId, projectId);

    expect(status).toMatchObject({
      configured: false,
      default_profile: null,
      summary: { total: 1, ready: 0, needs_generation: 1 },
      segments: [
        {
          slide_id: "intro",
          text: "声を決める前にも原稿を確認できます。",
          profile_label: null,
          effective_tuning: { speedScale: 1 },
          status: "needs_generation"
        }
      ]
    });
  });

  it("generates, stores, and hydrates an MP3 narration segment", async () => {
    const userId = "50000000-0000-4000-8000-000000000005";
    const projectId = "60000000-0000-4000-8000-000000000006";
    const now = "2026-07-29T00:00:00.000Z";
    const document = createEmptyProject("音声生成テスト");
    document.deck = {
      short_title: "音声テスト",
      description: "",
      author: "tester",
      year: 2026,
      accent: "#8bd450",
      layout: "minimal",
      narration_defaults: null,
      voicevox: null,
      slides: [
        {
          id: "intro",
          title: "音声テスト",
          duration_seconds: 10,
          reveal_steps: 0,
          tone: "dark",
          content_markdown: "# 音声テスト",
          reveal_blocks: [],
          sidebar_markdown: null,
          narration: {
            display: "commentary",
            speaker: null,
            segments: [
              {
                at: 0,
                text: "ずんだもんの音声を生成します。",
                audio_src: null
              }
            ]
          }
        }
      ]
    };
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, twitch_user_id, twitch_login, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(userId, "voice-test-user", "voice-test", now, now),
      env.DB.prepare(
        `INSERT INTO research_projects (
           id, owner_user_id, title, stage, document_json, version,
           idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      ).bind(
        projectId,
        userId,
        document.title,
        document.stage,
        JSON.stringify(document),
        "voice-generation-test",
        now,
        now
      )
    ]);

    const configured = await setupZundamonProfile(env.DB, {
      ownerUserId: userId,
      projectId,
      expectedVersion: 1
    });
    expect(configured.version).toBe(2);
    expect(configured.document.deck?.voicevox?.profiles[0]?.style_id).toBe(3);

    const queued: VoiceGenerationMessage[] = [];
    const queue = {
      sendBatch: async (messages: Array<{ body: VoiceGenerationMessage }>) => {
        queued.push(...messages.map((message) => message.body));
      }
    } as unknown as Queue<VoiceGenerationMessage>;
    const created = await createVoiceGenerationJob(
      { DB: env.DB, VOICE_JOBS_QUEUE: queue },
      {
        ownerUserId: userId,
        projectId,
        expectedVersion: 2,
        idempotencyKey: "70000000-0000-4000-8000-000000000007"
      }
    );
    expect(created.replayed).toBe(false);
    expect(created.job.status).toBe("queued");
    expect(queued).toHaveLength(1);

    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
    let synthesisBody: unknown;
    const container = {
      startAndWaitForPorts: async () => undefined,
      fetch: async (_url: string, init: RequestInit) => {
        synthesisBody = JSON.parse(String(init.body));
        return new Response(mp3, {
          headers: {
            "content-type": "audio/mpeg",
            "content-length": String(mp3.byteLength)
          }
        });
      }
    };
    const containerNamespace = {
      getByName: () => container
    } as unknown as Env["VOICEVOX_CONTAINER"];
    await processVoiceGenerationMessage(
      {
        DB: env.DB,
        MEDIA_BUCKET: env.MEDIA_BUCKET,
        VOICEVOX_CONTAINER: containerNamespace
      },
      queued[0]!
    );

    expect(synthesisBody).toMatchObject({
      text: "ずんだもんの音声を生成します。",
      style_id: 3,
      tuning: { speedScale: 1.05 }
    });
    const job = await getVoiceGenerationJob(
      env.DB,
      userId,
      projectId,
      created.job.job_id
    );
    expect(job).toMatchObject({
      status: "completed",
      completed_segments: 1,
      failed_segments: 0
    });
    const status = await getVoiceProjectStatus(env.DB, userId, projectId);
    expect(status?.summary).toMatchObject({ total: 1, ready: 1, needs_generation: 0 });
    expect(status?.segments[0]?.effective_tuning).toMatchObject({
      speedScale: 1.05,
      pitchScale: 0,
      intonationScale: 1
    });
    const storedProject = await getProject(env.DB, userId, projectId);
    expect(storedProject).not.toBeNull();
    const artifacts = await resolveVoiceArtifacts(
      env.DB,
      userId,
      storedProject!
    );
    expect(artifacts).toHaveLength(1);
    const hydrated = hydrateProjectVoice(
      storedProject!,
      artifacts,
      (segment) => `/voice/${segment.fingerprint}.mp3`
    );
    expect(
      hydrated.document.deck?.slides[0]?.narration?.segments[0]?.audio_src
    ).toMatch(/^\/voice\/[0-9a-f]{64}\.mp3$/);
  });
});
