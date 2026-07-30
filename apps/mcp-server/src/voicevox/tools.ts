import {
  ResourceTemplate,
  type McpServer
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { recordAuditEvent } from "../auth/repository";
import {
  ProjectToolError,
  requireSubject,
  toolResult
} from "../projects/tools";
import {
  createVoiceGenerationJob,
  getVoiceProjectStatus,
  getVoiceSlideStatus,
  voiceJobStatusSchema,
  voiceProjectStatusSchema,
  voiceSegmentStatusSchema,
  VoiceGenerationError,
  type VoiceSegmentStatus
} from "./service";

const VOICE_TEXT_PREVIEW_CHARACTERS = 120;

const voiceErrorSchema = z.object({
  code: z.enum([
    "AUTH_REQUIRED",
    "SCOPE_REQUIRED",
    "PROJECT_NOT_FOUND",
    "PROJECT_VERSION_CONFLICT",
    "VOICE_NOT_CONFIGURED",
    "NO_NARRATION",
    "VOICE_JOB_LIMIT",
    "VOICE_CHARACTER_LIMIT",
    "INTERNAL_ERROR"
  ]),
  message: z.string()
});
const compactVoiceJobSchema = voiceJobStatusSchema.pick({
  job_id: true,
  requested_version: true,
  status: true,
  total_segments: true,
  completed_segments: true,
  failed_segments: true,
  cached_segments: true,
  error: true,
  status_url: true
});
const compactVoiceStatusSchema = z.object({
  project_id: z.string().uuid(),
  version: z.number().int().positive(),
  configured: z.boolean(),
  default_profile: z.object({
    id: z.string(),
    label: z.string(),
    speaker_name: z.string(),
    style_name: z.string()
  }).nullable(),
  summary: voiceProjectStatusSchema.shape.summary,
  active_job: compactVoiceJobSchema.nullable(),
  latest_job: compactVoiceJobSchema.nullable(),
  details_uri: z.string(),
  slide_details_uri_template: z.string()
});
const voiceSegmentSummarySchema = z.object({
  at: z.number().int().nonnegative().max(100),
  status: z.enum(["ready", "needs_generation", "queued", "failed"]),
  character_count: z.number().int().nonnegative(),
  text_preview: z.string().max(VOICE_TEXT_PREVIEW_CHARACTERS),
  text_truncated: z.boolean(),
  speaker: z.string().nullable(),
  profile_label: z.string().nullable(),
  has_audio: z.boolean(),
  details_uri: z.string()
});
const voiceSlideIndexSchema = z.object({
  ok: z.literal(true),
  project_id: z.string().uuid(),
  version: z.number().int().positive(),
  slide_id: z.string(),
  slide_title: z.string(),
  configured: z.boolean(),
  segment_details_uri_template: z.string(),
  segments: z.array(voiceSegmentSummarySchema).max(101)
});
const voiceSegmentDetailSchema = z.object({
  ok: z.literal(true),
  project_id: z.string().uuid(),
  version: z.number().int().positive(),
  slide_id: z.string(),
  slide_title: z.string(),
  configured: z.boolean(),
  segment: voiceSegmentStatusSchema
});

function compactVoiceJob(job: z.infer<typeof voiceJobStatusSchema> | null) {
  if (job === null) return null;
  return compactVoiceJobSchema.parse(job);
}

function compactVoiceStatus(
  voice: z.infer<typeof voiceProjectStatusSchema>
): z.infer<typeof compactVoiceStatusSchema> {
  return {
    project_id: voice.project_id,
    version: voice.version,
    configured: voice.configured,
    default_profile: voice.default_profile === null
      ? null
      : {
          id: voice.default_profile.id,
          label: voice.default_profile.label,
          speaker_name: voice.default_profile.speaker_name,
          style_name: voice.default_profile.style_name
        },
    summary: voice.summary,
    active_job: compactVoiceJob(voice.active_job),
    latest_job: compactVoiceJob(voice.latest_job),
    details_uri: `research://projects/${voice.project_id}/voice`,
    slide_details_uri_template: `research://projects/${voice.project_id}/voice/slides/{slideId}`
  };
}

function compactVoiceSegment(
  projectId: string,
  slideId: string,
  segment: VoiceSegmentStatus
): z.infer<typeof voiceSegmentSummarySchema> {
  const characters = [...segment.text];
  return voiceSegmentSummarySchema.parse({
    at: segment.at,
    status: segment.status,
    character_count: characters.length,
    text_preview: characters.slice(0, VOICE_TEXT_PREVIEW_CHARACTERS).join(""),
    text_truncated: characters.length > VOICE_TEXT_PREVIEW_CHARACTERS,
    speaker: segment.speaker,
    profile_label: segment.profile_label,
    has_audio: segment.audio_url !== null,
    details_uri: `research://projects/${projectId}/voice/slides/${slideId}/segments/${segment.at}`
  });
}

function normalizeVoiceError(error: unknown): z.infer<typeof voiceErrorSchema> {
  if (error instanceof ProjectToolError) {
    return {
      code:
        error.code === "AUTH_REQUIRED" || error.code === "SCOPE_REQUIRED"
          ? error.code
          : "INTERNAL_ERROR",
      message: error.message
    };
  }
  if (error instanceof VoiceGenerationError) {
    const supported = voiceErrorSchema.shape.code.safeParse(error.code);
    return {
      code: supported.success ? supported.data : "INTERNAL_ERROR",
      message: error.message
    };
  }
  console.error(
    JSON.stringify({
      message: "VOICEVOX MCP tool failed",
      error: error instanceof Error ? error.message : String(error)
    })
  );
  return {
    code: "INTERNAL_ERROR",
    message: "The voice operation could not be completed."
  };
}

export function registerVoiceTools(
  server: McpServer,
  env: Pick<Env, "DB" | "VOICE_JOBS_QUEUE">,
  getAuthProps: () => Record<string, unknown> | undefined
): void {
  server.registerResource(
    "research-project-voice",
    new ResourceTemplate("research://projects/{id}/voice", { list: undefined }),
    {
      title: "研究のVOICEVOX詳細",
      description:
        "既定profile、生成数、jobとスライド別区間数を返します。一枚resourceで区間を選び、原稿全文・実効調声は一区間resourceから取得します。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const id = variables.id;
      let body: Record<string, unknown>;
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:read");
        const voice = typeof id === "string"
          ? await getVoiceProjectStatus(env.DB, ownerUserId, id)
          : null;
        if (voice === null) {
          body = { ok: false, error: { code: "PROJECT_NOT_FOUND" } };
        } else {
          const { segments, ...overview } = voice;
          const slides = [...new Map(segments.map((segment) => [segment.slide_id, segment.slide_title])).entries()]
            .map(([slideId, title]) => {
              const entries = segments.filter((segment) => segment.slide_id === slideId);
              return {
                slide_id: slideId,
                title,
                segment_count: entries.length,
                ready_count: entries.filter((segment) => segment.status === "ready").length,
                failed_count: entries.filter((segment) => segment.status === "failed").length,
                details_uri: `research://projects/${voice.project_id}/voice/slides/${slideId}`
              };
            });
          body = { ok: true, voice: overview, slides };
        }
      } catch (error) {
        body = { ok: false, error: normalizeVoiceError(error) };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(body)
        }]
      };
    }
  );

  server.registerResource(
    "research-project-slide-voice",
    new ResourceTemplate("research://projects/{id}/voice/slides/{slideId}", { list: undefined }),
    {
      title: "研究の一枚分のVOICEVOX詳細",
      description:
        "指定スライドだけを計画し、区間ごとの短い原稿preview、話者、profile、生成状態、一区間resource URIを返します。原稿全文と実効調声は一区間resourceから取得します。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const id = variables.id;
      const slideId = variables.slideId;
      let body: Record<string, unknown>;
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:read");
        const voice = typeof id === "string"
          && typeof slideId === "string"
          ? await getVoiceSlideStatus(env.DB, ownerUserId, id, slideId)
          : null;
        if (typeof id !== "string" || typeof slideId !== "string") {
          body = { ok: false, error: { code: "INVALID_RESOURCE_URI" } };
        } else if (voice === null) {
          body = { ok: false, error: { code: "PROJECT_NOT_FOUND" } };
        } else if (!voice.slide_found) {
          body = { ok: false, error: { code: "SLIDE_NOT_FOUND" } };
        } else {
          body = voice.segments.length === 0
            ? { ok: false, error: { code: "SLIDE_VOICE_NOT_FOUND" } }
            : voiceSlideIndexSchema.parse({
                ok: true,
                project_id: voice.project_id,
                version: voice.version,
                slide_id: slideId,
                slide_title: voice.slide_title,
                configured: voice.configured,
                segment_details_uri_template:
                  `research://projects/${voice.project_id}/voice/slides/${slideId}/segments/{at}`,
                segments: voice.segments.map((segment) =>
                  compactVoiceSegment(voice.project_id, slideId, segment)
                )
              });
        }
      } catch (error) {
        body = { ok: false, error: normalizeVoiceError(error) };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(body)
        }]
      };
    }
  );

  server.registerResource(
    "research-project-slide-voice-segment",
    new ResourceTemplate(
      "research://projects/{id}/voice/slides/{slideId}/segments/{at}",
      { list: undefined }
    ),
    {
      title: "研究の一読み上げ区間のVOICEVOX詳細",
      description:
        "指定スライドの一つのSTEPだけを計画し、原稿全文、話者、profile、実効調声、生成状態を返します。",
      mimeType: "application/json"
    },
    async (uri, variables) => {
      const id = variables.id;
      const slideId = variables.slideId;
      const atValue = variables.at;
      const at = typeof atValue === "string" && /^(0|[1-9]\d{0,2})$/.test(atValue)
        ? Number(atValue)
        : null;
      let body: Record<string, unknown>;
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:read");
        if (
          typeof id !== "string" ||
          typeof slideId !== "string" ||
          at === null ||
          at > 100
        ) {
          body = { ok: false, error: { code: "INVALID_RESOURCE_URI" } };
        } else {
          const voice = await getVoiceSlideStatus(
            env.DB,
            ownerUserId,
            id,
            slideId,
            at
          );
          if (voice === null) {
            body = { ok: false, error: { code: "PROJECT_NOT_FOUND" } };
          } else if (!voice.slide_found) {
            body = { ok: false, error: { code: "SLIDE_NOT_FOUND" } };
          } else if (voice.segments.length === 0) {
            body = { ok: false, error: { code: "VOICE_SEGMENT_NOT_FOUND" } };
          } else {
            body = voiceSegmentDetailSchema.parse({
              ok: true,
              project_id: voice.project_id,
              version: voice.version,
              slide_id: slideId,
              slide_title: voice.slide_title,
              configured: voice.configured,
              segment: voice.segments[0]
            });
          }
        }
      } catch (error) {
        body = { ok: false, error: normalizeVoiceError(error) };
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(body)
        }]
      };
    }
  );

  server.registerTool(
    "get_voice_generation_status",
    {
      title: "VOICEVOX音声の生成状態を取得",
      description:
        "研究全体の音声設定と生成数の要約、進行中または直近のjob、詳細resource URIを返します。details_uriから一枚と一区間を順に選ぶと、原稿全文と調声値を小さく取得できます。",
      inputSchema: { project_id: z.string().uuid() },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        voice: compactVoiceStatusSchema.nullable(),
        error: voiceErrorSchema.nullable()
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ project_id }) => {
      const requestId = crypto.randomUUID();
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:read");
        const voice = await getVoiceProjectStatus(
          env.DB,
          ownerUserId,
          project_id
        );
        if (voice === null) {
          throw new VoiceGenerationError(
            "PROJECT_NOT_FOUND",
            "The project does not exist."
          );
        }
        return toolResult({
          ok: true,
          request_id: requestId,
          voice: compactVoiceStatus(voice),
          error: null
        });
      } catch (error) {
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            voice: null,
            error: normalizeVoiceError(error)
          },
          true
        );
      }
    }
  );

  server.registerTool(
    "generate_voice_audio",
    {
      title: "VOICEVOX音声の差分生成を開始",
      description:
        "原稿、話者、style、調声値が変わった区間から、1回の上限に収まる不足分だけを非同期生成します。残りがあればjob完了後に新しいidempotency_keyでもう一度呼びます。500文字を超える一区間は先に分割してください。同じidempotency_keyの再送は同じjobを返します。開始後はget_voice_generation_statusから一枚・一区間resourceを順に確認してください。",
      inputSchema: {
        project_id: z.string().uuid(),
        expected_version: z.number().int().positive(),
        idempotency_key: z.string().uuid()
      },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        project_id: z.string().uuid(),
        version: z.number().int().positive().nullable(),
        replayed: z.boolean(),
        job: compactVoiceJobSchema.nullable(),
        error: voiceErrorSchema.nullable()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, idempotency_key }) => {
      const requestId = crypto.randomUUID();
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:publish");
        const result = await createVoiceGenerationJob(env, {
          ownerUserId,
          projectId: project_id,
          expectedVersion: expected_version,
          idempotencyKey: idempotency_key
        });
        await recordAuditEvent(env.DB, {
          userId: ownerUserId,
          eventType: "voicevox.generation_requested",
          outcome: "succeeded",
          details: {
            project_id,
            job_id: result.job.job_id,
            replayed: result.replayed,
            source: "mcp"
          },
          createdAt: new Date().toISOString()
        });
        return toolResult({
          ok: true,
          request_id: requestId,
          project_id,
          version: result.job.requested_version,
          replayed: result.replayed,
          job: compactVoiceJob(result.job),
          error: null
        });
      } catch (error) {
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            project_id,
            version:
              error instanceof VoiceGenerationError
                ? (error.currentVersion ?? null)
                : null,
            replayed: false,
            job: null,
            error: normalizeVoiceError(error)
          },
          true
        );
      }
    }
  );
}
