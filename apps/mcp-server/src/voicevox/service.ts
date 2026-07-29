import {
  createVoiceGenerationInput,
  fingerprintVoiceGenerationInput,
  VOICEVOX_ENGINE,
  ZUNDAMON_NORMAL_PROFILE,
  type VoiceGenerationInput
} from "@ultimate-freestyle/research-schema/voice-generation";
import { findVoicevoxCatalogProfile } from "@ultimate-freestyle/research-schema/voicevox-catalog";
import { z } from "zod";

import { getProject, mutateProject } from "../projects/repository";
import type { ProjectRecord } from "../projects/schema";

const MAX_JOBS_PER_MONTH = 20;
const MAX_CHARACTERS_PER_MONTH = 200_000;
const MAX_JOB_CHARACTERS = 30_000;
const MAX_SEGMENTS_PER_JOB = 100;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export type VoiceGenerationMessage = {
  job_id: string;
  segment_id: string;
  fingerprint: string;
};

export type VoiceSegmentPlan = {
  segmentId: string;
  slideId: string;
  slideTitle: string;
  at: number;
  text: string;
  speaker: string | null;
  profileId: string;
  profileLabel: string;
  input: VoiceGenerationInput;
  fingerprint: string;
  artifact: VoiceArtifactRow | null;
};

export type VoiceArtifactRow = {
  fingerprint: string;
  object_key: string;
  content_hash: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
};

type VoiceJobRow = {
  id: string;
  project_id: string;
  requested_version: number;
  status: string;
  total_segments: number;
  completed_segments: number;
  failed_segments: number;
  cached_segments: number;
  total_characters: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type VoiceJob = {
  job_id: string;
  project_id: string;
  requested_version: number;
  status: string;
  total_segments: number;
  completed_segments: number;
  failed_segments: number;
  cached_segments: number;
  total_characters: number;
  error: { code: string; message: string } | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  status_url: string;
};

export type VoiceProjectStatus = {
  project_id: string;
  version: number;
  configured: boolean;
  default_profile: {
    id: string;
    label: string;
    speaker_name: string;
    style_name: string;
  } | null;
  summary: {
    total: number;
    ready: number;
    needs_generation: number;
    failed: number;
    queued: number;
  };
  segments: Array<{
    slide_id: string;
    slide_title: string;
    at: number;
    text: string;
    speaker: string | null;
    profile_label: string;
    status: "ready" | "needs_generation" | "queued" | "failed";
    audio_url: string | null;
  }>;
  active_job: VoiceJob | null;
  latest_job: VoiceJob | null;
};

export class VoiceGenerationError extends Error {
  constructor(
    readonly code:
      | "PROJECT_NOT_FOUND"
      | "PROJECT_VERSION_CONFLICT"
      | "VOICE_NOT_CONFIGURED"
      | "VOICE_PROFILE_NOT_FOUND"
      | "NO_NARRATION"
      | "VOICE_JOB_LIMIT"
      | "VOICE_CHARACTER_LIMIT"
      | "VOICE_JOB_NOT_FOUND"
      | "VOICE_GENERATION_FAILED",
    message: string,
    readonly currentVersion?: number
  ) {
    super(message);
  }
}

const generationInputSchema = z.object({
  text: z.string().min(1).max(2_000),
  speakerUuid: z.string().uuid(),
  styleId: z.number().int().nonnegative(),
  tuning: z.object({
    speedScale: z.number(),
    pitchScale: z.number(),
    intonationScale: z.number(),
    volumeScale: z.number(),
    pauseLengthScale: z.number(),
    prePhonemeLength: z.number(),
    postPhonemeLength: z.number()
  }),
  engine: z.object({
    version: z.string(),
    imageDigest: z.string(),
    catalogRevision: z.string(),
    dictionaryRevision: z.string()
  }),
  codec: z.object({
    format: z.literal("mp3"),
    channels: z.literal(1),
    sampleRate: z.literal(24_000),
    bitrateKbps: z.literal(64)
  })
});

function toJob(row: VoiceJobRow): VoiceJob {
  return {
    job_id: row.id,
    project_id: row.project_id,
    requested_version: row.requested_version,
    status: row.status,
    total_segments: row.total_segments,
    completed_segments: row.completed_segments,
    failed_segments: row.failed_segments,
    cached_segments: row.cached_segments,
    total_characters: row.total_characters,
    error:
      row.error_code === null
        ? null
        : { code: row.error_code, message: row.error_message ?? "音声生成に失敗しました。" },
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    status_url: `/api/projects/${row.project_id}/voice/jobs/${row.id}`
  };
}

async function buildVoicePlan(
  db: D1Database,
  ownerUserId: string,
  project: ProjectRecord
): Promise<VoiceSegmentPlan[]> {
  const deck = project.document.deck;
  if (deck === null) return [];
  const profiles = new Map(
    (deck.voicevox?.profiles ?? []).map((profile) => [profile.id, profile])
  );
  const defaultProfile = deck.voicevox
    ? profiles.get(deck.voicevox.default_profile_id)
    : undefined;
  if (defaultProfile === undefined) return [];

  const unresolved: Array<Omit<VoiceSegmentPlan, "fingerprint" | "artifact">> = [];
  for (const slide of deck.slides) {
    for (const segment of slide.narration?.segments ?? []) {
      const profile =
        (segment.voice_profile_id
          ? profiles.get(segment.voice_profile_id)
          : undefined) ?? defaultProfile;
      if (profile === undefined) continue;
      unresolved.push({
        segmentId: `${slide.id}:${segment.at}`,
        slideId: slide.id,
        slideTitle: slide.title,
        at: segment.at,
        text: segment.text,
        speaker:
          segment.speaker ?? slide.narration?.speaker ?? deck.narration_defaults?.speaker ?? null,
        profileId: profile.id,
        profileLabel: profile.label,
        input: createVoiceGenerationInput({
          text: segment.text,
          speakerUuid: profile.speaker_uuid,
          styleId: profile.style_id,
          profileTuning: profile.tuning,
          segmentTuning: segment.voice_tuning
        })
      });
    }
  }
  const planned = await Promise.all(
    unresolved.map(async (segment) => ({
      ...segment,
      fingerprint: await fingerprintVoiceGenerationInput(segment.input)
    }))
  );
  if (planned.length === 0) return [];
  const placeholders = planned.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT fingerprint, object_key, content_hash, mime_type, byte_size, created_at
       FROM voice_audio_artifacts
       WHERE owner_user_id = ? AND project_id = ?
         AND fingerprint IN (${placeholders})`
    )
    .bind(ownerUserId, project.project_id, ...planned.map((item) => item.fingerprint))
    .all<VoiceArtifactRow>();
  const artifacts = new Map(rows.results.map((row) => [row.fingerprint, row]));
  return planned.map((segment) => ({
    ...segment,
    artifact: artifacts.get(segment.fingerprint) ?? null
  }));
}

export async function setupVoicevoxProfile(
  db: D1Database,
  options: {
    ownerUserId: string;
    projectId: string;
    expectedVersion: number;
    profileId: string;
  }
): Promise<ProjectRecord> {
  const catalogProfile = findVoicevoxCatalogProfile(options.profileId);
  if (catalogProfile === undefined) {
    throw new VoiceGenerationError(
      "VOICE_PROFILE_NOT_FOUND",
      "選択したVOICEVOXの声が見つかりません。"
    );
  }
  return mutateProject(db, {
    ownerUserId: options.ownerUserId,
    projectId: options.projectId,
    expectedVersion: options.expectedVersion,
    mutate: (document) => {
      if (document.deck === null) {
        throw new VoiceGenerationError(
          "VOICE_NOT_CONFIGURED",
          "発表スライドを作成してから音声を設定してください。"
        );
      }
      const profile = {
        id: catalogProfile.id,
        label: catalogProfile.label,
        speaker_uuid: catalogProfile.speakerUuid,
        speaker_name: catalogProfile.speakerName,
        style_id: catalogProfile.styleId,
        style_name: catalogProfile.styleName,
        tuning:
          catalogProfile.styleId === ZUNDAMON_NORMAL_PROFILE.styleId
            ? { ...ZUNDAMON_NORMAL_PROFILE.tuning }
            : null
      };
      const existing = document.deck.voicevox?.profiles ?? [];
      const profiles = existing.filter((item) => item.id !== profile.id);
      profiles.unshift(profile);
      document.deck.voicevox = {
        catalog_revision: VOICEVOX_ENGINE.catalogRevision,
        default_profile_id: profile.id,
        profiles
      };
      document.deck.narration_defaults ??= {
        display: "commentary",
        speaker: profile.speaker_name,
        credit: null
      };
      document.deck.narration_defaults.speaker ??= profile.speaker_name;
    }
  });
}

export async function setupZundamonProfile(
  db: D1Database,
  options: {
    ownerUserId: string;
    projectId: string;
    expectedVersion: number;
  }
): Promise<ProjectRecord> {
  return setupVoicevoxProfile(db, {
    ...options,
    profileId: ZUNDAMON_NORMAL_PROFILE.id
  });
}

async function findLatestJob(
  db: D1Database,
  ownerUserId: string,
  projectId: string
): Promise<VoiceJob | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, requested_version, status, total_segments,
              completed_segments, failed_segments, cached_segments,
              total_characters, error_code, error_message, created_at,
              started_at, completed_at
       FROM voice_generation_jobs
       WHERE owner_user_id = ? AND project_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(ownerUserId, projectId)
    .first<VoiceJobRow>();
  return row === null ? null : toJob(row);
}

export async function getVoiceGenerationJob(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  jobId: string
): Promise<VoiceJob | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, requested_version, status, total_segments,
              completed_segments, failed_segments, cached_segments,
              total_characters, error_code, error_message, created_at,
              started_at, completed_at
       FROM voice_generation_jobs
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`
    )
    .bind(jobId, ownerUserId, projectId)
    .first<VoiceJobRow>();
  return row === null ? null : toJob(row);
}

export async function getVoiceProjectStatus(
  db: D1Database,
  ownerUserId: string,
  projectId: string
): Promise<VoiceProjectStatus | null> {
  const project = await getProject(db, ownerUserId, projectId);
  if (project === null) return null;
  const plan = await buildVoicePlan(db, ownerUserId, project);
  const latestJob = await findLatestJob(db, ownerUserId, projectId);
  const jobStates = new Map<string, string>();
  if (latestJob !== null) {
    const rows = await db
      .prepare(
        `SELECT fingerprint, status FROM voice_generation_segments
         WHERE job_id = ?`
      )
      .bind(latestJob.job_id)
      .all<{ fingerprint: string; status: string }>();
    for (const row of rows.results) jobStates.set(row.fingerprint, row.status);
  }
  const segments = plan.map((segment) => {
    const jobState = jobStates.get(segment.fingerprint);
    const status = segment.artifact
      ? "ready"
      : jobState === "failed"
        ? "failed"
        : jobState === "queued" || jobState === "running"
          ? "queued"
          : "needs_generation";
    return {
      slide_id: segment.slideId,
      slide_title: segment.slideTitle,
      at: segment.at,
      text: segment.text,
      speaker: segment.speaker,
      profile_label: segment.profileLabel,
      status,
      audio_url: segment.artifact
        ? `/api/projects/${projectId}/voice/audio/${segment.fingerprint}`
        : null
    } as const;
  });
  const deck = project.document.deck;
  const defaultProfile = deck?.voicevox?.profiles.find(
    (profile) => profile.id === deck.voicevox?.default_profile_id
  );
  return {
    project_id: projectId,
    version: project.version,
    configured: defaultProfile !== undefined,
    default_profile: defaultProfile
      ? {
          id: defaultProfile.id,
          label: defaultProfile.label,
          speaker_name: defaultProfile.speaker_name,
          style_name: defaultProfile.style_name
        }
      : null,
    summary: {
      total: segments.length,
      ready: segments.filter((item) => item.status === "ready").length,
      needs_generation: segments.filter((item) =>
        item.status === "needs_generation" || item.status === "failed"
      ).length,
      failed: segments.filter((item) => item.status === "failed").length,
      queued: segments.filter((item) => item.status === "queued").length
    },
    segments,
    active_job:
      latestJob && ["queued", "running"].includes(latestJob.status)
        ? latestJob
        : null,
    latest_job: latestJob
  };
}

async function sendVoiceMessages(
  queue: Queue<VoiceGenerationMessage>,
  messages: VoiceGenerationMessage[]
): Promise<void> {
  for (let index = 0; index < messages.length; index += 100) {
    await queue.sendBatch(
      messages.slice(index, index + 100).map((body) => ({ body }))
    );
  }
}

export async function createVoiceGenerationJob(
  env: Pick<Env, "DB" | "VOICE_JOBS_QUEUE">,
  options: {
    ownerUserId: string;
    projectId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }
): Promise<{ job: VoiceJob; replayed: boolean }> {
  const replay = await env.DB
    .prepare(
      `SELECT id, project_id, requested_version, status, total_segments,
              completed_segments, failed_segments, cached_segments,
              total_characters, error_code, error_message, created_at,
              started_at, completed_at
       FROM voice_generation_jobs
       WHERE owner_user_id = ? AND project_id = ? AND idempotency_key = ?`
    )
    .bind(options.ownerUserId, options.projectId, options.idempotencyKey)
    .first<VoiceJobRow>();
  if (replay !== null) return { job: toJob(replay), replayed: true };

  const active = await env.DB
    .prepare(
      `SELECT id, project_id, requested_version, status, total_segments,
              completed_segments, failed_segments, cached_segments,
              total_characters, error_code, error_message, created_at,
              started_at, completed_at
       FROM voice_generation_jobs
       WHERE owner_user_id = ? AND project_id = ? AND status IN ('queued', 'running')
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(options.ownerUserId, options.projectId)
    .first<VoiceJobRow>();
  if (active !== null) return { job: toJob(active), replayed: true };

  const project = await getProject(env.DB, options.ownerUserId, options.projectId);
  if (project === null) {
    throw new VoiceGenerationError("PROJECT_NOT_FOUND", "研究が見つかりません。");
  }
  if (project.version !== options.expectedVersion) {
    throw new VoiceGenerationError(
      "PROJECT_VERSION_CONFLICT",
      "研究が更新されています。画面を読み込み直してください。",
      project.version
    );
  }
  if (project.document.deck?.voicevox === null || project.document.deck?.voicevox === undefined) {
    throw new VoiceGenerationError(
      "VOICE_NOT_CONFIGURED",
      "先にVOICEVOXの声を設定してください。"
    );
  }
  const plan = await buildVoicePlan(env.DB, options.ownerUserId, project);
  if (plan.length === 0) {
    throw new VoiceGenerationError("NO_NARRATION", "生成する読み上げ原稿がありません。");
  }
  if (plan.length > MAX_SEGMENTS_PER_JOB) {
    throw new VoiceGenerationError(
      "VOICE_JOB_LIMIT",
      `1回に生成できる読み上げは${MAX_SEGMENTS_PER_JOB}区間までです。`
    );
  }
  const totalCharacters = plan.reduce((sum, segment) => sum + segment.text.length, 0);
  if (plan.some((segment) => [...segment.text].length > 500)) {
    throw new VoiceGenerationError(
      "VOICE_CHARACTER_LIMIT",
      "1つの読み上げ区間は500文字までです。原稿を分割してください。"
    );
  }
  if (totalCharacters > MAX_JOB_CHARACTERS) {
    throw new VoiceGenerationError(
      "VOICE_CHARACTER_LIMIT",
      `1回に生成できる原稿は${MAX_JOB_CHARACTERS}文字までです。`
    );
  }
  const monthKey = new Date().toISOString().slice(0, 7);
  const usage = await env.DB
    .prepare(
      `SELECT jobs_requested, characters_requested FROM voice_usage_monthly
       WHERE owner_user_id = ? AND month_key = ?`
    )
    .bind(options.ownerUserId, monthKey)
    .first<{ jobs_requested: number; characters_requested: number }>();
  if ((usage?.jobs_requested ?? 0) >= MAX_JOBS_PER_MONTH) {
    throw new VoiceGenerationError(
      "VOICE_JOB_LIMIT",
      `今月の音声生成は${MAX_JOBS_PER_MONTH}回までです。`
    );
  }
  if ((usage?.characters_requested ?? 0) + totalCharacters > MAX_CHARACTERS_PER_MONTH) {
    throw new VoiceGenerationError(
      "VOICE_CHARACTER_LIMIT",
      `今月の音声生成は${MAX_CHARACTERS_PER_MONTH}文字までです。`
    );
  }

  const now = new Date().toISOString();
  const jobId = crypto.randomUUID();
  const pending = plan.filter((segment) => segment.artifact === null);
  const jobStatus = pending.length === 0 ? "completed" : "queued";
  const messages: VoiceGenerationMessage[] = [];
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO voice_generation_jobs (
         id, project_id, owner_user_id, requested_version, idempotency_key,
         status, total_segments, completed_segments, failed_segments,
         cached_segments, total_characters, created_at, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    ).bind(
      jobId,
      options.projectId,
      options.ownerUserId,
      project.version,
      options.idempotencyKey,
      jobStatus,
      plan.length,
      plan.filter((segment) => segment.artifact !== null).length,
      plan.filter((segment) => segment.artifact !== null).length,
      totalCharacters,
      now,
      jobStatus === "completed" ? now : null
    ),
    env.DB.prepare(
      `INSERT INTO voice_usage_monthly (
         owner_user_id, month_key, jobs_requested, characters_requested,
         characters_generated, bytes_generated, updated_at
       ) VALUES (?, ?, 1, ?, 0, 0, ?)
       ON CONFLICT(owner_user_id, month_key) DO UPDATE SET
         jobs_requested = jobs_requested + 1,
         characters_requested = characters_requested + excluded.characters_requested,
         updated_at = excluded.updated_at`
    ).bind(options.ownerUserId, monthKey, totalCharacters, now)
  ];

  for (const segment of plan) {
    const segmentId = crypto.randomUUID();
    const status = segment.artifact ? "cached" : "queued";
    statements.push(
      env.DB.prepare(
        `INSERT INTO voice_generation_segments (
           id, job_id, slide_id, segment_at, fingerprint, input_json,
           status, attempts, object_key, byte_size, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      ).bind(
        segmentId,
        jobId,
        segment.slideId,
        segment.at,
        segment.fingerprint,
        JSON.stringify(segment.input),
        status,
        segment.artifact?.object_key ?? null,
        segment.artifact?.byte_size ?? null,
        now,
        now
      )
    );
    if (segment.artifact !== null) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO voice_project_audio (
             project_id, owner_user_id, slide_id, segment_at, fingerprint,
             artifact_fingerprint, source_project_version, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(project_id, slide_id, segment_at) DO UPDATE SET
             fingerprint = excluded.fingerprint,
             artifact_fingerprint = excluded.artifact_fingerprint,
             source_project_version = excluded.source_project_version,
             updated_at = excluded.updated_at`
        ).bind(
          options.projectId,
          options.ownerUserId,
          segment.slideId,
          segment.at,
          segment.fingerprint,
          segment.fingerprint,
          project.version,
          now,
          now
        )
      );
      continue;
    }
    const message = {
      job_id: jobId,
      segment_id: segmentId,
      fingerprint: segment.fingerprint
    };
    messages.push(message);
    statements.push(
      env.DB.prepare(
        `INSERT INTO voice_queue_outbox (
           id, job_id, segment_id, status, attempts,
           next_attempt_at, created_at
         ) VALUES (?, ?, ?, 'pending', 0, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        jobId,
        segmentId,
        now,
        now
      )
    );
  }
  await env.DB.batch(statements);
  if (messages.length > 0) {
    await sendVoiceMessages(env.VOICE_JOBS_QUEUE, messages);
    await env.DB
      .prepare(
        `UPDATE voice_queue_outbox SET status = 'sent', sent_at = ?
         WHERE job_id = ? AND status = 'pending'`
      )
      .bind(new Date().toISOString(), jobId)
      .run();
  }
  const job = await getVoiceGenerationJob(
    env.DB,
    options.ownerUserId,
    options.projectId,
    jobId
  );
  if (job === null) throw new Error("Created voice job could not be read.");
  return { job, replayed: false };
}

export async function dispatchPendingVoiceOutbox(
  env: Pick<Env, "DB" | "VOICE_JOBS_QUEUE">
): Promise<number> {
  const now = new Date().toISOString();
  const rows = await env.DB
    .prepare(
      `SELECT o.id, o.job_id, o.segment_id, s.fingerprint
       FROM voice_queue_outbox o
       JOIN voice_generation_segments s ON s.id = o.segment_id AND s.job_id = o.job_id
       WHERE o.status = 'pending' AND o.next_attempt_at <= ?
       ORDER BY o.created_at LIMIT 100`
    )
    .bind(now)
    .all<{ id: string; job_id: string; segment_id: string; fingerprint: string }>();
  if (rows.results.length === 0) return 0;
  const parsed = rows.results.map((row) => ({
    id: row.id,
    message: z.object({
      job_id: z.string().uuid(),
      segment_id: z.string().uuid(),
      fingerprint: z.string().regex(/^[0-9a-f]{64}$/)
    }).parse({
      job_id: row.job_id,
      segment_id: row.segment_id,
      fingerprint: row.fingerprint
    })
  }));
  await sendVoiceMessages(env.VOICE_JOBS_QUEUE, parsed.map((item) => item.message));
  await env.DB.batch(
    parsed.map((item) =>
      env.DB.prepare(
        `UPDATE voice_queue_outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1
         WHERE id = ? AND status = 'pending'`
      ).bind(now, item.id)
    )
  );
  return parsed.length;
}

function isMp3(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)
  );
}

async function refreshJobTotals(db: D1Database, jobId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE voice_generation_jobs
       SET completed_segments = (
             SELECT COUNT(*) FROM voice_generation_segments
             WHERE job_id = ? AND status IN ('completed', 'cached')
           ),
           cached_segments = (
             SELECT COUNT(*) FROM voice_generation_segments
             WHERE job_id = ? AND status = 'cached'
           ),
           failed_segments = (
             SELECT COUNT(*) FROM voice_generation_segments
             WHERE job_id = ? AND status = 'failed'
           ),
           status = CASE
             WHEN (SELECT COUNT(*) FROM voice_generation_segments WHERE job_id = ? AND status IN ('queued', 'running')) > 0 THEN 'running'
             WHEN (SELECT COUNT(*) FROM voice_generation_segments WHERE job_id = ? AND status = 'failed') > 0 THEN 'partially_failed'
             ELSE 'completed'
           END,
           started_at = COALESCE(started_at, ?),
           completed_at = CASE
             WHEN (SELECT COUNT(*) FROM voice_generation_segments WHERE job_id = ? AND status IN ('queued', 'running')) = 0 THEN ?
             ELSE NULL
           END
       WHERE id = ?`
    )
    .bind(jobId, jobId, jobId, jobId, jobId, now, jobId, now, jobId)
    .run();
}

export async function processVoiceGenerationMessage(
  env: Pick<Env, "DB" | "MEDIA_BUCKET" | "VOICEVOX_CONTAINER">,
  body: VoiceGenerationMessage
): Promise<void> {
  const processingStartedAt = Date.now();
  const leaseToken = crypto.randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const claimed = await env.DB
    .prepare(
      `UPDATE voice_generation_segments
       SET status = 'running', attempts = attempts + 1,
           lease_token = ?, lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND job_id = ? AND fingerprint = ?
         AND status IN ('queued', 'failed')
         AND (lease_expires_at IS NULL OR lease_expires_at < ?)`
    )
    .bind(
      leaseToken,
      leaseExpiresAt,
      now.toISOString(),
      body.segment_id,
      body.job_id,
      body.fingerprint,
      now.toISOString()
    )
    .run();
  if (claimed.meta.changes === 0) return;
  const segment = await env.DB
    .prepare(
      `SELECT s.input_json, s.slide_id, s.segment_at, j.project_id,
              j.owner_user_id, j.requested_version
       FROM voice_generation_segments s
       JOIN voice_generation_jobs j ON j.id = s.job_id
       WHERE s.id = ? AND s.job_id = ? AND s.lease_token = ?`
    )
    .bind(body.segment_id, body.job_id, leaseToken)
    .first<{
      input_json: string;
      slide_id: string;
      segment_at: number;
      project_id: string;
      owner_user_id: string;
      requested_version: number;
    }>();
  if (segment === null) return;
  const input = generationInputSchema.parse(JSON.parse(segment.input_json));
  const objectKey = `voice-cache/v1/${segment.owner_user_id}/${segment.project_id}/${body.fingerprint.slice(0, 2)}/${body.fingerprint}.mp3`;
  const existing = await env.MEDIA_BUCKET.head(objectKey);
  let bytes: Uint8Array;
  let contentHash: string;
  const cached = existing !== null;
  if (existing === null) {
    const container = env.VOICEVOX_CONTAINER.getByName("voicevox-production");
    await container.startAndWaitForPorts({
      ports: [8080],
      cancellationOptions: {
        instanceGetTimeoutMS: 180_000,
        portReadyTimeoutMS: 180_000,
        waitInterval: 1_000
      }
    });
    const response = await container.fetch("http://voicevox/synthesize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        style_id: input.styleId,
        tuning: input.tuning
      })
    });
    if (!response.ok) {
      throw new VoiceGenerationError(
        "VOICE_GENERATION_FAILED",
        `VOICEVOX Container returned ${response.status}.`
      );
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_AUDIO_BYTES) {
      throw new VoiceGenerationError(
        "VOICE_GENERATION_FAILED",
        "生成音声がサイズ上限を超えました。"
      );
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_AUDIO_BYTES) {
      throw new VoiceGenerationError(
        "VOICE_GENERATION_FAILED",
        "生成音声のサイズが不正です。"
      );
    }
    bytes = new Uint8Array(buffer);
    if (!isMp3(bytes)) {
      throw new VoiceGenerationError(
        "VOICE_GENERATION_FAILED",
        "生成結果がMP3ではありません。"
      );
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    contentHash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    await env.MEDIA_BUCKET.put(objectKey, bytes, {
      httpMetadata: {
        contentType: "audio/mpeg",
        cacheControl: "private, max-age=31536000, immutable"
      },
      customMetadata: {
        fingerprint: body.fingerprint,
        engineVersion: VOICEVOX_ENGINE.version,
        imageDigest: VOICEVOX_ENGINE.imageDigest
      },
      sha256: digest
    });
  } else {
    const stored = await env.MEDIA_BUCKET.get(objectKey);
    if (stored === null || stored.size > MAX_AUDIO_BYTES) {
      throw new VoiceGenerationError(
        "VOICE_GENERATION_FAILED",
        "音声キャッシュを読み取れませんでした。"
      );
    }
    bytes = new Uint8Array(await stored.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    contentHash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  const completedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO voice_audio_artifacts (
         fingerprint, owner_user_id, project_id, object_key, content_hash,
         mime_type, byte_size, engine_version, image_digest, created_at
       ) VALUES (?, ?, ?, ?, ?, 'audio/mpeg', ?, ?, ?, ?)
       ON CONFLICT(owner_user_id, project_id, fingerprint) DO UPDATE SET
         object_key = excluded.object_key,
         content_hash = excluded.content_hash,
         byte_size = excluded.byte_size`
    ).bind(
      body.fingerprint,
      segment.owner_user_id,
      segment.project_id,
      objectKey,
      contentHash,
      bytes.byteLength,
      VOICEVOX_ENGINE.version,
      VOICEVOX_ENGINE.imageDigest,
      completedAt
    ),
    env.DB.prepare(
      `INSERT INTO voice_project_audio (
         project_id, owner_user_id, slide_id, segment_at, fingerprint,
         artifact_fingerprint, source_project_version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, slide_id, segment_at) DO UPDATE SET
         fingerprint = excluded.fingerprint,
         artifact_fingerprint = excluded.artifact_fingerprint,
         source_project_version = excluded.source_project_version,
         updated_at = excluded.updated_at`
    ).bind(
      segment.project_id,
      segment.owner_user_id,
      segment.slide_id,
      segment.segment_at,
      body.fingerprint,
      body.fingerprint,
      segment.requested_version,
      completedAt,
      completedAt
    ),
    env.DB.prepare(
      `UPDATE voice_generation_segments
       SET status = ?, object_key = ?, byte_size = ?, lease_token = NULL,
           lease_expires_at = NULL, error_code = NULL, error_message = NULL,
           updated_at = ?
       WHERE id = ? AND lease_token = ?`
    ).bind(
      cached ? "cached" : "completed",
      objectKey,
      bytes.byteLength,
      completedAt,
      body.segment_id,
      leaseToken
    )
  ]);
  if (!cached) {
    const monthKey = completedAt.slice(0, 7);
    await env.DB
      .prepare(
        `UPDATE voice_usage_monthly
         SET characters_generated = characters_generated + ?,
             bytes_generated = bytes_generated + ?, updated_at = ?
         WHERE owner_user_id = ? AND month_key = ?`
      )
      .bind(
        input.text.length,
        bytes.byteLength,
        completedAt,
        segment.owner_user_id,
        monthKey
      )
      .run();
  }
  await refreshJobTotals(env.DB, body.job_id);
  console.log(
    JSON.stringify({
      message: "VOICEVOX segment stored",
      job_id: body.job_id,
      segment_id: body.segment_id,
      cache_hit: cached,
      character_count: [...input.text].length,
      byte_size: bytes.byteLength,
      processing_duration_ms: Date.now() - processingStartedAt
    })
  );
}

export async function failVoiceGenerationMessage(
  db: D1Database,
  body: VoiceGenerationMessage,
  error: unknown,
  finalAttempt: boolean
): Promise<void> {
  const message =
    error instanceof VoiceGenerationError
      ? error.message
      : "音声生成基盤で一時的なエラーが発生しました。";
  await db
    .prepare(
      `UPDATE voice_generation_segments
       SET status = ?, lease_token = NULL, lease_expires_at = NULL,
           error_code = 'VOICE_GENERATION_FAILED', error_message = ?, updated_at = ?
       WHERE id = ? AND job_id = ? AND fingerprint = ?`
    )
    .bind(
      finalAttempt ? "failed" : "queued",
      message,
      new Date().toISOString(),
      body.segment_id,
      body.job_id,
      body.fingerprint
    )
    .run();
  await refreshJobTotals(db, body.job_id);
}

export async function resolveVoiceArtifacts(
  db: D1Database,
  ownerUserId: string,
  project: ProjectRecord
): Promise<VoiceSegmentPlan[]> {
  return (await buildVoicePlan(db, ownerUserId, project)).filter(
    (segment) => segment.artifact !== null
  );
}

export function hydrateProjectVoice(
  project: ProjectRecord,
  artifacts: VoiceSegmentPlan[],
  urlFor: (segment: VoiceSegmentPlan) => string
): ProjectRecord {
  const hydrated = structuredClone(project);
  const bySegment = new Map(
    artifacts.map((segment) => [`${segment.slideId}:${segment.at}`, segment])
  );
  for (const slide of hydrated.document.deck?.slides ?? []) {
    for (const segment of slide.narration?.segments ?? []) {
      const artifact = bySegment.get(`${slide.id}:${segment.at}`);
      segment.audio_src = artifact ? urlFor(artifact) : null;
    }
  }
  return hydrated;
}

export async function readOwnerVoiceArtifact(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  ownerUserId: string,
  projectId: string,
  fingerprint: string,
  rangeHeaders?: Headers
): Promise<R2ObjectBody | null> {
  const row = await env.DB
    .prepare(
      `SELECT object_key FROM voice_audio_artifacts
       WHERE fingerprint = ? AND owner_user_id = ? AND project_id = ?`
    )
    .bind(fingerprint, ownerUserId, projectId)
    .first<{ object_key: string }>();
  if (row === null) return null;
  return env.MEDIA_BUCKET.get(
    row.object_key,
    rangeHeaders ? { range: rangeHeaders } : undefined
  );
}
