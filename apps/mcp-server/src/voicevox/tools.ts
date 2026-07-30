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
  voiceJobStatusSchema,
  voiceProjectStatusSchema,
  VoiceGenerationError
} from "./service";

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
  details_uri: z.string()
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
    details_uri: `research://projects/${voice.project_id}/voice`
  };
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
        "既定profileの調声値、区間ごとの原稿・実効調声・生成状態、進行中と直近のjobを返します。",
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
        body = voice === null
          ? { ok: false, error: { code: "PROJECT_NOT_FOUND" } }
          : { ok: true, voice };
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
        "研究全体の音声設定と生成数の要約、進行中または直近のjob、詳細resource URIを返します。区間ごとの原稿と調声値はdetails_uriを読んでください。",
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
        "原稿、話者、style、調声値が変わった区間だけを非同期生成します。同じidempotency_keyの再送は同じjobを返します。開始後はget_voice_generation_statusのdetails_uriで確認してください。",
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
