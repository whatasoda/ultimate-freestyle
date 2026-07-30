import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { twitchGrantPropsSchema } from "../auth/types";
import { recordAuditEvent } from "../auth/repository";
import {
  createProject,
  getProject,
  listProjects,
  ProjectRepositoryError,
  restoreProjectDraftRevision
} from "./repository";
import {
  createEmptyProject,
  projectSummarySchema
} from "./schema";

const projectErrorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "SCOPE_REQUIRED",
  "PROJECT_NOT_FOUND",
  "PROJECT_VERSION_CONFLICT",
  "PROJECT_LIMIT_REACHED",
  "PROJECT_TOO_LARGE",
  "DECK_REQUIRED",
  "SLIDE_NOT_FOUND",
  "SLIDE_EXISTS",
  "BLOCK_NOT_FOUND",
  "BLOCK_EXISTS",
  "COMPONENT_NOT_FOUND",
  "COMPONENT_HAS_CHILDREN",
  "INVALID_COMPOSITION_MODE",
  "TEMPLATE_NOT_FOUND",
  "TEMPLATE_IN_USE",
  "LOG_ENTRY_EXISTS",
  "INVALID_POSITION",
  "INVALID_CHANGE",
  "INVALID_FIELDS",
  "LAST_SLIDE_REQUIRED",
  "INTERNAL_ERROR"
]);

export const projectErrorSchema = z.object({
  code: projectErrorCodeSchema,
  message: z.string()
});

export type RequiredScope =
  | "research:read"
  | "research:write"
  | "research:publish";

export class ProjectToolError extends Error {
  constructor(
    readonly code: z.infer<typeof projectErrorCodeSchema>,
    message: string,
    readonly currentVersion: number | null = null
  ) {
    super(message);
  }
}

export function requireSubject(
  getAuthProps: () => Record<string, unknown> | undefined,
  scope: RequiredScope
): string {
  const parsed = twitchGrantPropsSchema.safeParse(getAuthProps());
  if (!parsed.success || !parsed.data.eligibility.eligible) {
    throw new ProjectToolError(
      "AUTH_REQUIRED",
      "Twitch OAuth authentication is required."
    );
  }
  if (!parsed.data.mcp_scopes.includes(scope)) {
    throw new ProjectToolError(
      "SCOPE_REQUIRED",
      `The ${scope} scope is required.`
    );
  }
  return parsed.data.subject_id;
}

export function normalizeProjectToolError(error: unknown): ProjectToolError {
  if (error instanceof ProjectToolError) {
    return error;
  }
  if (error instanceof ProjectRepositoryError) {
    return new ProjectToolError(
      error.code,
      error.message,
      error.currentVersion ?? null
    );
  }
  console.error(
    JSON.stringify({
      message: "Project tool failed",
      error: error instanceof Error ? error.message : String(error)
    })
  );
  return new ProjectToolError(
    "INTERNAL_ERROR",
    "The project operation could not be completed."
  );
}

export function toolResult(
  structuredContent: Record<string, unknown>,
  isError = false
) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError
  };
}

export function registerProjectTools(
  server: McpServer,
  db: D1Database,
  getAuthProps: () => Record<string, unknown> | undefined
): void {
  server.registerTool(
    "list_projects",
    {
      title: "自分の研究一覧を取得",
      description:
        "認証中の利用者が所有する研究を更新日時順で返します。本文はresearch://projects/{id}から読みます。",
      inputSchema: {},
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        projects: z.array(projectSummarySchema),
        error: projectErrorSchema.nullable()
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const requestId = crypto.randomUUID();
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:read");
        return toolResult({
          ok: true,
          request_id: requestId,
          projects: await listProjects(db, ownerUserId),
          error: null
        });
      } catch (error) {
        const normalized = normalizeProjectToolError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            projects: [],
            error: { code: normalized.code, message: normalized.message }
          },
          true
        );
      }
    }
  );

  server.registerTool(
    "get_project_outline",
    {
      title: "研究の概要と構成を取得",
      description:
        "編集前に使う軽量な読み取りです。本文全体ではなく、version、基本情報、20分判定、templateと各slideの時間・構成を返します。",
      inputSchema: { project_id: z.string().uuid() },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        outline: z
          .object({
            project_id: z.string().uuid(),
            version: z.number().int().positive(),
            updated_at: z.string().datetime(),
            title: z.string(),
            stage: z.string(),
            has_deck: z.boolean(),
            aspect_ratio: z.enum(["16:9", "4:3"]).nullable(),
            total_duration_seconds: z.number().int().nonnegative(),
            within_submission_limit: z.boolean(),
            template_ids: z.array(z.string()),
            slides: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                position: z.number().int().nonnegative(),
                template_id: z.string().nullable(),
                role: z.enum(["content", "cover"]),
                duration_seconds: z.number().int().positive(),
                reveal_steps: z.number().int().nonnegative(),
                composition_mode: z.enum(["flow", "canvas", "scene"]),
                narration_segments: z.number().int().nonnegative()
              })
            )
          })
          .nullable(),
        error: projectErrorSchema.nullable()
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
        const project = await getProject(db, ownerUserId, project_id);
        if (project === null) {
          throw new ProjectToolError(
            "PROJECT_NOT_FOUND",
            "The project does not exist."
          );
        }
        const deck = project.document.deck;
        const totalDurationSeconds = deck?.slides.reduce(
          (total, slide) => total + slide.duration_seconds,
          0
        ) ?? 0;
        return toolResult({
          ok: true,
          request_id: requestId,
          outline: {
            project_id: project.project_id,
            version: project.version,
            updated_at: project.updated_at,
            title: project.document.title,
            stage: project.document.stage,
            has_deck: deck !== null,
            aspect_ratio: deck?.aspect_ratio ?? null,
            total_duration_seconds: totalDurationSeconds,
            within_submission_limit:
              (deck?.slides.length ?? 0) > 0 && totalDurationSeconds <= 20 * 60,
            template_ids:
              deck?.templates?.map((template) => template.id) ?? [],
            slides:
              deck?.slides.map((slide, position) => ({
                id: slide.id,
                title: slide.title,
                position,
                template_id: slide.template_id ?? null,
                role: slide.role,
                duration_seconds: slide.duration_seconds,
                reveal_steps: slide.reveal_steps,
                composition_mode: slide.composition?.mode ?? "flow",
                narration_segments: slide.narration?.segments.length ?? 0
              })) ?? []
          },
          error: null
        });
      } catch (error) {
        const normalized = normalizeProjectToolError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            outline: null,
            error: { code: normalized.code, message: normalized.message }
          },
          true
        );
      }
    }
  );

  server.registerTool(
    "create_project",
    {
      title: "研究プロジェクトを作成",
      description:
        "discovery段階の空の研究を作成します。同じidempotency_keyの再試行は同じprojectを返します。",
      inputSchema: {
        title: z.string().min(1).max(120),
        idempotency_key: z.string().min(8).max(128)
      },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        project: projectSummarySchema.nullable(),
        replayed: z.boolean().nullable(),
        error: projectErrorSchema.nullable()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ title, idempotency_key }) => {
      const requestId = crypto.randomUUID();
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:write");
        const result = await createProject(db, {
          ownerUserId,
          idempotencyKey: idempotency_key,
          document: createEmptyProject(title)
        });
        await recordAuditEvent(db, {
          userId: ownerUserId,
          eventType: result.replayed
            ? "project.create_replayed"
            : "project.created",
          outcome: "succeeded",
          details: {
            project_id: result.project.project_id,
            version: result.project.version
          },
          createdAt: new Date().toISOString()
        });
        return toolResult({
          ok: true,
          request_id: requestId,
          project: {
            project_id: result.project.project_id,
            title: result.project.document.title,
            stage: result.project.document.stage,
            version: result.project.version,
            has_presentation: result.project.document.deck !== null,
            slide_count: result.project.document.deck?.slides.length ?? 0,
            total_duration_seconds: result.project.document.deck?.slides.reduce(
              (total, slide) => total + slide.duration_seconds,
              0
            ) ?? 0,
            created_at: result.project.created_at,
            updated_at: result.project.updated_at
          },
          replayed: result.replayed,
          error: null
        });
      } catch (error) {
        const normalized = normalizeProjectToolError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            project: null,
            replayed: null,
            error: { code: normalized.code, message: normalized.message }
          },
          true
        );
      }
    }
  );

  server.registerTool(
    "restore_draft_revision",
    {
      title: "過去の下書きを新しい版として復元",
      description:
        "research://projects/{id}/revisionsで候補を選び、revisions/{version}と必要なslides/{slideId}で現在版との差を確認した過去版を、現在の下書きを消さず新しいversionとして復元します。expected_versionには確認した現在版を指定します。",
      inputSchema: {
        project_id: z.string().uuid(),
        expected_version: z.number().int().positive(),
        target_version: z.number().int().positive()
      },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        version: z.number().int().positive().nullable(),
        current_version: z.number().int().positive().nullable(),
        restored_from_version: z.number().int().positive().nullable(),
        error: projectErrorSchema.nullable()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, target_version }) => {
      const requestId = crypto.randomUUID();
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:write");
        const project = await restoreProjectDraftRevision(db, {
          ownerUserId,
          projectId: project_id,
          expectedVersion: expected_version,
          targetVersion: target_version
        });
        await recordAuditEvent(db, {
          userId: ownerUserId,
          eventType: "project.draft_restored",
          outcome: "succeeded",
          details: {
            project_id,
            version: project.version,
            restored_from_version: target_version,
            source: "mcp"
          },
          createdAt: new Date().toISOString()
        });
        return toolResult({
          ok: true,
          request_id: requestId,
          version: project.version,
          current_version: project.version,
          restored_from_version: target_version,
          error: null
        });
      } catch (error) {
        const normalized = normalizeProjectToolError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            version: null,
            current_version: normalized.currentVersion,
            restored_from_version: null,
            error: { code: normalized.code, message: normalized.message }
          },
          true
        );
      }
    }
  );

}
