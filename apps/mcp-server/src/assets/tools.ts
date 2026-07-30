import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { recordAuditEvent } from "../auth/repository";
import { getProject } from "../projects/repository";
import {
  ProjectToolError,
  requireSubject,
  toolResult
} from "../projects/tools";
import { listProjectAssets } from "./repository";
import { projectAssetSchema } from "./schema";
import { AssetServiceError, removeProjectImage } from "./service";

const assetErrorSchema = z.object({
  code: z.enum([
    "AUTH_REQUIRED",
    "SCOPE_REQUIRED",
    "PROJECT_NOT_FOUND",
    "ASSET_IN_USE",
    "INTERNAL_ERROR"
  ]),
  message: z.string()
});

function assetToolError(error: unknown): {
  code: z.infer<typeof assetErrorSchema>["code"];
  message: string;
} {
  if (error instanceof ProjectToolError) {
    const code =
      error.code === "AUTH_REQUIRED" ||
      error.code === "SCOPE_REQUIRED" ||
      error.code === "PROJECT_NOT_FOUND"
        ? error.code
        : "INTERNAL_ERROR";
    return { code, message: error.message };
  }
  if (error instanceof AssetServiceError && error.code === "ASSET_IN_USE") {
    return { code: error.code, message: error.message };
  }
  console.error(
    JSON.stringify({
      message: "Asset tool failed",
      error: error instanceof Error ? error.message : String(error)
    })
  );
  return {
    code: "INTERNAL_ERROR",
    message: "The image operation could not be completed."
  };
}

export function registerAssetTools(
  server: McpServer,
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  getAuthProps: () => Record<string, unknown> | undefined
): void {
  server.registerTool(
    "list_project_images",
    {
      title: "研究画像の一覧を取得",
      description:
        "自分が所有する研究へWeb UIから追加した画像のasset ID、説明、寸法、容量を返します。画像binaryやbase64は返しません。",
      inputSchema: { project_id: z.string().uuid() },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        images: z.array(projectAssetSchema),
        error: assetErrorSchema.nullable()
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
        if ((await getProject(env.DB, ownerUserId, project_id)) === null) {
          throw new ProjectToolError(
            "PROJECT_NOT_FOUND",
            "The project does not exist."
          );
        }
        return toolResult({
          ok: true,
          request_id: requestId,
          images: await listProjectAssets(env.DB, ownerUserId, project_id),
          error: null
        });
      } catch (error) {
        const normalized = assetToolError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            images: [],
            error: normalized
          },
          true
        );
      }
    }
  );

  server.registerTool(
    "delete_project_image",
    {
      title: "研究画像を削除",
      description:
        "自分が所有する未使用画像をprivate storageとmetadataから削除します。現在版または保持中の下書き履歴で参照中ならASSET_IN_USEを返し、存在しない画像の再削除は成功として扱います。",
      inputSchema: { asset_id: z.string().uuid() },
      outputSchema: {
        ok: z.boolean(),
        request_id: z.string().uuid(),
        deleted: z.boolean(),
        error: assetErrorSchema.nullable()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ asset_id }) => {
      const requestId = crypto.randomUUID();
      try {
        const ownerUserId = requireSubject(getAuthProps, "research:write");
        const deleted = await removeProjectImage(
          env,
          ownerUserId,
          asset_id
        );
        await recordAuditEvent(env.DB, {
          userId: ownerUserId,
          eventType: "project_image.deleted",
          outcome: "succeeded",
          details: { asset_id, deleted },
          createdAt: new Date().toISOString()
        });
        return toolResult({
          ok: true,
          request_id: requestId,
          deleted,
          error: null
        });
      } catch (error) {
        const normalized = assetToolError(error);
        return toolResult(
          {
            ok: false,
            request_id: requestId,
            deleted: false,
            error: normalized
          },
          true
        );
      }
    }
  );
}
