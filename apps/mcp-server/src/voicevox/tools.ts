import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

const voiceJobSchema = z.object({
  job_id: z.string().uuid(),
  project_id: z.string().uuid(),
  requested_version: z.number().int().positive(),
  status: z.string(),
  total_segments: z.number().int().nonnegative(),
  completed_segments: z.number().int().nonnegative(),
  failed_segments: z.number().int().nonnegative(),
  cached_segments: z.number().int().nonnegative(),
  total_characters: z.number().int().nonnegative(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  created_at: z.string().datetime(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  status_url: z.string()
});

const voiceStatusSchema = z.object({
  project_id: z.string().uuid(),
  version: z.number().int().positive(),
  configured: z.boolean(),
  default_profile: z
    .object({
      id: z.string(),
      label: z.string(),
      speaker_name: z.string(),
      style_name: z.string()
    })
    .nullable(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    needs_generation: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative()
  }),
  segments: z.array(
    z.object({
      slide_id: z.string(),
      slide_title: z.string(),
      at: z.number().int().nonnegative(),
      text: z.string(),
      speaker: z.string().nullable(),
      profile_label: z.string(),
      status: z.enum(["ready", "needs_generation", "queued", "failed"]),
      audio_url: z.string().nullable()
    })
  ),
  active_job: voiceJobSchema.nullable(),
  latest_job: voiceJobSchema.nullable()
});

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
  server.registerTool(
    "get_voice_generation_status",
    {
      title: "VOICEVOX音声の生成状態を取得",
      description:
        "研究全体の既定音声、区間ごとの生成要否、進行中または直近のjobを返します。原稿や調声値を変更した後の差分確認に使います。",
      inputSchema: { project_id: z.string().uuid() },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        voice: voiceStatusSchema.nullable(),
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
          voice,
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
        "原稿、話者、style、調声値が変わった区間だけを非同期生成します。同じidempotency_keyの再送は同じjobを返します。開始後はget_voice_generation_statusで確認してください。",
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
        job: voiceJobSchema.nullable(),
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
          job: result.job,
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
