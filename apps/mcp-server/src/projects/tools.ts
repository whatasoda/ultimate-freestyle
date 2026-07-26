import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { twitchGrantPropsSchema } from "../auth/types";
import { recordAuditEvent } from "../auth/repository";
import {
  createProject,
  getProject,
  listProjects,
  ProjectRepositoryError,
  updateProject
} from "./repository";
import {
  createEmptyProject,
  projectDocumentSchema,
  projectRecordSchema,
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
  "INTERNAL_ERROR"
]);

const projectErrorSchema = z.object({
  code: projectErrorCodeSchema,
  message: z.string()
});

type RequiredScope = "research:read" | "research:write";
const MAX_PROJECT_DOCUMENT_BYTES = 512 * 1024;

class ProjectToolError extends Error {
  constructor(
    readonly code: z.infer<typeof projectErrorCodeSchema>,
    message: string,
    readonly currentVersion: number | null = null
  ) {
    super(message);
  }
}

function requireSubject(
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

function normalizeError(error: unknown): ProjectToolError {
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

function toolResult(structuredContent: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError
  };
}

function assertDocumentSize(document: unknown): void {
  const byteLength = new TextEncoder().encode(JSON.stringify(document)).length;
  if (byteLength > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new ProjectToolError(
      "PROJECT_TOO_LARGE",
      `The project document must not exceed ${MAX_PROJECT_DOCUMENT_BYTES} bytes.`
    );
  }
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
        const normalized = normalizeError(error);
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
        const normalized = normalizeError(error);
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
        const normalized = normalizeError(error);
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
        const normalized = normalizeError(error);
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
    "update_project",
    {
      title: "研究プロジェクトを更新",
      description:
        "構造化された研究全体を置換します。get_projectで得たversionをexpected_versionへ指定し、競合時は再取得してください。",
      inputSchema: {
        project_id: z.string().uuid(),
        expected_version: z.number().int().positive(),
        document: projectDocumentSchema
      },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        project: projectRecordSchema.nullable(),
        current_version: z.number().int().positive().nullable(),
        error: projectErrorSchema.nullable()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async ({ project_id, expected_version, document }) => {
      const requestId = crypto.randomUUID();
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:write");
        assertDocumentSize(document);
        const project = await updateProject(db, {
          ownerUserId,
          projectId: project_id,
          expectedVersion: expected_version,
          document
        });
        await recordAuditEvent(db, {
          userId: ownerUserId,
          eventType: "project.updated",
          outcome: "succeeded",
          details: { project_id, version: project.version },
          createdAt: new Date().toISOString()
        });
        return toolResult({
          ok: true,
          request_id: requestId,
          project,
          current_version: project.version,
          error: null
        });
      } catch (error) {
        const normalized = normalizeError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            project: null,
            current_version: normalized.currentVersion,
            error: { code: normalized.code, message: normalized.message }
          },
          true
        );
      }
    }
  );
}
