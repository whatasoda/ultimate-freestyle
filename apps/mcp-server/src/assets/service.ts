import { readBytesCapped } from "../lib/http";
import {
  assertAssetCapacity,
  createProjectAsset,
  deleteProjectAsset,
  getProjectAsset,
  updateProjectAssetAltText
} from "./repository";
import {
  assertDeclaredImageType,
  ImagePolicyError,
  normalizeProjectImage
} from "./image";
import {
  IMAGE_INPUT_BYTES_LIMIT,
  type ProjectAsset
} from "./schema";

export type AssetServiceErrorCode =
  | "ASSET_IN_USE"
  | "IMAGE_EMPTY"
  | "IMAGE_INPUT_TOO_LARGE"
  | "IMAGE_TYPE_UNSUPPORTED"
  | "IMAGE_ANIMATED_UNSUPPORTED"
  | "IMAGE_INVALID"
  | "IMAGE_DIMENSIONS_TOO_LARGE"
  | "IMAGE_OUTPUT_TOO_LARGE";

export class AssetServiceError extends Error {
  constructor(
    readonly code: AssetServiceErrorCode,
    message: string
  ) {
    super(message);
  }
}

function safeFilename(value: string | null): string {
  const basename = (value ?? "upload")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return (basename || "upload").slice(0, 255);
}

export async function uploadProjectImage(
  request: Request,
  env: Pick<Env, "DB" | "IMAGES" | "MEDIA_BUCKET">,
  options: {
    ownerUserId: string;
    projectId: string;
    filename: string | null;
    altText: string;
  }
): Promise<ProjectAsset> {
  try {
    assertDeclaredImageType(
      request.headers.get("content-type")?.split(";", 1)[0] ?? ""
    );
  } catch (error) {
    if (error instanceof ImagePolicyError) {
      throw new AssetServiceError(error.code, error.message);
    }
    throw error;
  }
  await assertAssetCapacity(env.DB, options.ownerUserId, options.projectId);
  const input = await readBytesCapped(request, IMAGE_INPUT_BYTES_LIMIT);
  if (!input.ok) {
    throw new AssetServiceError(
      input.reason === "over_cap" ? "IMAGE_INPUT_TOO_LARGE" : "IMAGE_EMPTY",
      input.reason === "over_cap"
        ? "画像は10MiB以下にしてください。"
        : "画像データを読み取れませんでした。"
    );
  }
  if (input.value.byteLength === 0) {
    throw new AssetServiceError("IMAGE_EMPTY", "画像が空です。");
  }

  let normalized;
  try {
    normalized = await normalizeProjectImage(env.IMAGES, input.value);
  } catch (error) {
    if (error instanceof ImagePolicyError) {
      throw new AssetServiceError(error.code, error.message);
    }
    throw error;
  }

  const assetId = crypto.randomUUID();
  const objectKey = `project-images/${assetId}.webp`;
  await env.MEDIA_BUCKET.put(objectKey, normalized.bytes, {
    httpMetadata: {
      contentType: normalized.mimeType,
      cacheControl: "private, max-age=31536000, immutable"
    },
    customMetadata: {
      owner_user_id: options.ownerUserId,
      project_id: options.projectId
    }
  });
  try {
    return await createProjectAsset(env.DB, {
      assetId,
      projectId: options.projectId,
      ownerUserId: options.ownerUserId,
      objectKey,
      originalFilename: safeFilename(options.filename),
      altText: options.altText.slice(0, 500),
      width: normalized.width,
      height: normalized.height,
      byteSize: normalized.bytes.byteLength
    });
  } catch (error) {
    await env.MEDIA_BUCKET.delete(objectKey);
    throw error;
  }
}

export async function readProjectImage(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  ownerUserId: string,
  assetId: string
): Promise<{ asset: ProjectAsset; object: R2ObjectBody } | null> {
  const asset = await getProjectAsset(env.DB, ownerUserId, assetId);
  if (asset === null) {
    return null;
  }
  const object = await env.MEDIA_BUCKET.get(asset.object_key);
  return object === null ? null : { asset, object };
}

export async function removeProjectImage(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  ownerUserId: string,
  assetId: string
): Promise<boolean> {
  const asset = await getProjectAsset(env.DB, ownerUserId, assetId);
  if (asset === null) {
    return false;
  }
  const row = await env.DB.prepare(
    "SELECT document_json FROM research_projects WHERE id = ? AND owner_user_id = ?"
  )
    .bind(asset.project_id, ownerUserId)
    .first<{ document_json: string }>();
  const referencesAsset = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(referencesAsset);
    if (value === null || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    if (record.asset_id === assetId) return true;
    return Object.values(record).some(referencesAsset);
  };
  if (row !== null && referencesAsset(JSON.parse(row.document_json))) {
    throw new AssetServiceError(
      "ASSET_IN_USE",
      "この画像はスライドで使用中です。スライドから外してから削除してください。"
    );
  }
  await env.MEDIA_BUCKET.delete(asset.object_key);
  return (await deleteProjectAsset(env.DB, ownerUserId, assetId)) !== null;
}

export async function updateProjectImageAltText(
  env: Pick<Env, "DB">,
  ownerUserId: string,
  assetId: string,
  altText: string
): Promise<ProjectAsset | null> {
  return await updateProjectAssetAltText(
    env.DB,
    ownerUserId,
    assetId,
    altText.trim()
  );
}
