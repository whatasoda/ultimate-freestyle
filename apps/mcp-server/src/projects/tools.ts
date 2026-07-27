import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { twitchGrantPropsSchema } from "../auth/types";
import { recordAuditEvent } from "../auth/repository";
import {
  createProject,
  getProject,
  listProjects,
  ProjectRepositoryError
} from "./repository";
import {
  createEmptyProject,
  projectRecordSchema,
  projectSlideSchema,
  projectSummarySchema
} from "./schema";
import { RUBRIC_MARKDOWN } from "./rubric";

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
  "TEMPLATE_NOT_FOUND",
  "TEMPLATE_IN_USE",
  "LOG_ENTRY_EXISTS",
  "INVALID_POSITION",
  "INVALID_CHANGE",
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
        "認証中の利用者が所有する研究を更新日時順で返します。本文はget_projectで取得します。",
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
        "編集前に使う軽量な読み取りです。本文全体ではなく、version、基本情報、templateとslideの識別子を返します。",
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
            template_ids: z.array(z.string()),
            slides: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                position: z.number().int().nonnegative(),
                template_id: z.string().nullable()
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
        return toolResult({
          ok: true,
          request_id: requestId,
          outline: {
            project_id: project.project_id,
            version: project.version,
            updated_at: project.updated_at,
            title: project.document.title,
            stage: project.document.stage,
            has_deck: project.document.deck !== null,
            template_ids:
              project.document.deck?.templates?.map((template) => template.id) ?? [],
            slides:
              project.document.deck?.slides.map((slide, position) => ({
                id: slide.id,
                title: slide.title,
                position,
                template_id: slide.template_id ?? null
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
    "get_project",
    {
      title: "研究データを取得",
      description:
        "自分が所有する研究の現在versionと構造化された全データを返します。更新前に必ず呼び出してください。",
      inputSchema: {
        project_id: z.string().uuid()
      },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        project: projectRecordSchema.nullable(),
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
        return toolResult({
          ok: true,
          request_id: requestId,
          project,
          error: null
        });
      } catch (error) {
        const normalized = normalizeProjectToolError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            project: null,
            error: { code: normalized.code, message: normalized.message }
          },
          true
        );
      }
    }
  );

  server.registerTool(
    "get_project_slide",
    {
      title: "スライドを一枚取得",
      description:
        "個別編集の前に、指定したslideと現在versionだけを取得します。研究全体は返しません。",
      inputSchema: {
        project_id: z.string().uuid(),
        slide_id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
      },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        project_id: z.string().uuid().nullable(),
        version: z.number().int().positive().nullable(),
        slide: projectSlideSchema.nullable(),
        error: projectErrorSchema.nullable()
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ project_id, slide_id }) => {
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
        const slide = project.document.deck?.slides.find(
          (item) => item.id === slide_id
        );
        if (slide === undefined) {
          throw new ProjectToolError("SLIDE_NOT_FOUND", "The slide does not exist.");
        }
        return toolResult({
          ok: true,
          request_id: requestId,
          project_id,
          version: project.version,
          slide,
          error: null
        });
      } catch (error) {
        const normalized = normalizeProjectToolError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            project_id,
            version: null,
            slide: null,
            error: { code: normalized.code, message: normalized.message }
          },
          true
        );
      }
    }
  );

  server.registerTool(
    "evaluate_project",
    {
      title: "研究を評価する材料を取得",
      description:
        "採点を捏造しないよう、現在の研究データと8観点の評価基準を同時に返します。採点自体はクライアントAIが根拠付きで行います。",
      inputSchema: {
        project_id: z.string().uuid()
      },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        project: projectRecordSchema.nullable(),
        rubric_markdown: z.string().nullable(),
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
        return toolResult({
          ok: true,
          request_id: requestId,
          project,
          rubric_markdown: RUBRIC_MARKDOWN,
          error: null
        });
      } catch (error) {
        const normalized = normalizeProjectToolError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            project: null,
            rubric_markdown: null,
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
        project: projectRecordSchema.nullable(),
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
          project: result.project,
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

}
