import {
  PROJECT_IMAGE_LIMIT,
  USER_IMAGE_BYTES_LIMIT,
  USER_IMAGE_LIMIT,
  projectAssetSchema,
  type ProjectAsset,
  type StoredProjectAsset
} from "./schema";

export type AssetRepositoryErrorCode =
  | "ASSET_PROJECT_LIMIT"
  | "ASSET_USER_LIMIT"
  | "ASSET_STORAGE_LIMIT";

export class AssetRepositoryError extends Error {
  constructor(
    readonly code: AssetRepositoryErrorCode,
    message: string
  ) {
    super(message);
  }
}

export async function assertAssetCapacity(
  db: D1Database,
  ownerUserId: string,
  projectId: string
): Promise<void> {
  const usage = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN project_id = ? THEN 1 ELSE 0 END) AS project_count,
         COUNT(*) AS user_count,
         COALESCE(SUM(byte_size), 0) AS user_bytes
       FROM project_assets
       WHERE owner_user_id = ?`
    )
    .bind(projectId, ownerUserId)
    .first<{ project_count: number; user_count: number; user_bytes: number }>();
  if ((usage?.project_count ?? 0) >= PROJECT_IMAGE_LIMIT) {
    throw new AssetRepositoryError(
      "ASSET_PROJECT_LIMIT",
      `1つの研究に保存できる画像は${PROJECT_IMAGE_LIMIT}件までです。`
    );
  }
  if ((usage?.user_count ?? 0) >= USER_IMAGE_LIMIT) {
    throw new AssetRepositoryError(
      "ASSET_USER_LIMIT",
      `1人が保存できる画像は${USER_IMAGE_LIMIT}件までです。`
    );
  }
  if ((usage?.user_bytes ?? 0) >= USER_IMAGE_BYTES_LIMIT) {
    throw new AssetRepositoryError(
      "ASSET_STORAGE_LIMIT",
      "画像の保存容量150MiBを使い切っています。"
    );
  }
}

type AssetRow = {
  id: string;
  project_id: string;
  owner_user_id: string;
  object_key: string;
  original_filename: string;
  alt_text: string;
  mime_type: string;
  width: number;
  height: number;
  byte_size: number;
  created_at: string;
  updated_at: string;
};

function toAsset(row: AssetRow): StoredProjectAsset {
  return {
    ...projectAssetSchema.parse({
      asset_id: row.id,
      project_id: row.project_id,
      original_filename: row.original_filename,
      alt_text: row.alt_text,
      mime_type: row.mime_type,
      width: row.width,
      height: row.height,
      byte_size: row.byte_size,
      content_url: `/media/${row.id}`,
      created_at: row.created_at,
      updated_at: row.updated_at
    }),
    owner_user_id: row.owner_user_id,
    object_key: row.object_key
  };
}

function normalizeInsertError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const codes: AssetRepositoryErrorCode[] = [
    "ASSET_PROJECT_LIMIT",
    "ASSET_USER_LIMIT",
    "ASSET_STORAGE_LIMIT"
  ];
  const code = codes.find((candidate) => message.includes(candidate));
  if (code !== undefined) {
    throw new AssetRepositoryError(code, code);
  }
  throw error;
}

export async function listProjectAssets(
  db: D1Database,
  ownerUserId: string,
  projectId: string
): Promise<ProjectAsset[]> {
  const result = await db
    .prepare(
      `SELECT id, project_id, owner_user_id, object_key, original_filename,
              alt_text, mime_type, width, height, byte_size, created_at, updated_at
       FROM project_assets
       WHERE owner_user_id = ? AND project_id = ?
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .bind(ownerUserId, projectId)
    .all<AssetRow>();
  return result.results.map(toAsset);
}

export async function getProjectAsset(
  db: D1Database,
  ownerUserId: string,
  assetId: string
): Promise<StoredProjectAsset | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, owner_user_id, object_key, original_filename,
              alt_text, mime_type, width, height, byte_size, created_at, updated_at
       FROM project_assets
       WHERE owner_user_id = ? AND id = ?`
    )
    .bind(ownerUserId, assetId)
    .first<AssetRow>();
  return row === null ? null : toAsset(row);
}

export async function createProjectAsset(
  db: D1Database,
  options: {
    assetId: string;
    projectId: string;
    ownerUserId: string;
    objectKey: string;
    originalFilename: string;
    altText: string;
    width: number;
    height: number;
    byteSize: number;
    now?: Date;
  }
): Promise<ProjectAsset> {
  const now = (options.now ?? new Date()).toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO project_assets (
           id, project_id, owner_user_id, object_key, original_filename,
           alt_text, mime_type, width, height, byte_size, created_at, updated_at
         ) SELECT ?, p.id, p.owner_user_id, ?, ?, ?, 'image/webp', ?, ?, ?, ?, ?
           FROM research_projects p
           WHERE p.id = ? AND p.owner_user_id = ?`
      )
      .bind(
        options.assetId,
        options.objectKey,
        options.originalFilename,
        options.altText,
        options.width,
        options.height,
        options.byteSize,
        now,
        now,
        options.projectId,
        options.ownerUserId
      )
      .run();
  } catch (error) {
    normalizeInsertError(error);
  }
  const asset = await getProjectAsset(db, options.ownerUserId, options.assetId);
  if (asset === null) {
    throw new Error("The project does not exist or the asset was not created.");
  }
  return asset;
}

export async function deleteProjectAsset(
  db: D1Database,
  ownerUserId: string,
  assetId: string
): Promise<StoredProjectAsset | null> {
  const asset = await getProjectAsset(db, ownerUserId, assetId);
  if (asset === null) {
    return null;
  }
  const result = await db
    .prepare("DELETE FROM project_assets WHERE id = ? AND owner_user_id = ?")
    .bind(assetId, ownerUserId)
    .run();
  return result.meta.changes === 1 ? asset : null;
}
