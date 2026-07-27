import { renderPresentationHtml } from "../presentation/render";
import { getProject } from "../projects/repository";

const MAX_PRESENTATION_BYTES = 2 * 1024 * 1024;

export type PublicationErrorCode =
  | "PROJECT_NOT_FOUND"
  | "DECK_REQUIRED"
  | "PREVIEW_NOT_FOUND"
  | "PREVIEW_STALE"
  | "PRESENTATION_TOO_LARGE";

export class PublicationError extends Error {
  constructor(
    readonly code: PublicationErrorCode,
    message: string
  ) {
    super(message);
  }
}

export type PresentationRevision = {
  revision_id: string;
  project_id: string;
  project_version: number;
  object_key: string;
  content_hash: string;
  byte_size: number;
  created_at: string;
};

export type PublicationStatus = {
  project_id: string;
  draft_version: number;
  slug: string | null;
  latest_preview: PresentationRevision | null;
  published: PresentationRevision | null;
};

type RevisionRow = {
  id: string;
  project_id: string;
  project_version: number;
  object_key: string;
  content_hash: string;
  byte_size: number;
  created_at: string;
};

function toRevision(row: RevisionRow): PresentationRevision {
  return {
    revision_id: row.id,
    project_id: row.project_id,
    project_version: row.project_version,
    object_key: row.object_key,
    content_hash: row.content_hash,
    byte_size: row.byte_size,
    created_at: row.created_at
  };
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getPublicationStatus(
  db: D1Database,
  ownerUserId: string,
  projectId: string
): Promise<PublicationStatus | null> {
  const project = await getProject(db, ownerUserId, projectId);
  if (project === null) return null;
  const state = await db
    .prepare(
      `SELECT slug, latest_preview_revision_id, published_revision_id
       FROM project_publications
       WHERE project_id = ? AND owner_user_id = ?`
    )
    .bind(projectId, ownerUserId)
    .first<{
      slug: string;
      latest_preview_revision_id: string | null;
      published_revision_id: string | null;
    }>();
  const revisionIds = [
    state?.latest_preview_revision_id,
    state?.published_revision_id
  ].filter((value): value is string => value !== null && value !== undefined);
  const revisions = new Map<string, PresentationRevision>();
  for (const revisionId of new Set(revisionIds)) {
    const row = await db
      .prepare(
        `SELECT id, project_id, project_version, object_key, content_hash,
                byte_size, created_at
         FROM presentation_revisions
         WHERE id = ? AND owner_user_id = ?`
      )
      .bind(revisionId, ownerUserId)
      .first<RevisionRow>();
    if (row !== null) revisions.set(row.id, toRevision(row));
  }
  return {
    project_id: projectId,
    draft_version: project.version,
    slug: state?.slug ?? null,
    latest_preview:
      state?.latest_preview_revision_id === null ||
      state?.latest_preview_revision_id === undefined
        ? null
        : (revisions.get(state.latest_preview_revision_id) ?? null),
    published:
      state?.published_revision_id === null ||
      state?.published_revision_id === undefined
        ? null
        : (revisions.get(state.published_revision_id) ?? null)
  };
}

export async function createPresentationPreview(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  ownerUserId: string,
  projectId: string,
  expectedVersion: number
): Promise<{ revision: PresentationRevision; slug: string }> {
  const project = await getProject(env.DB, ownerUserId, projectId);
  if (project === null) {
    throw new PublicationError("PROJECT_NOT_FOUND", "研究が見つかりません。");
  }
  if (project.version !== expectedVersion) {
    throw new PublicationError(
      "PREVIEW_STALE",
      `下書きは v${project.version} に更新されています。画面を読み込み直してください。`
    );
  }
  if (project.document.deck === null || project.document.deck.slides.length === 0) {
    throw new PublicationError(
      "DECK_REQUIRED",
      "プレビューには1枚以上のスライドが必要です。"
    );
  }

  const html = renderPresentationHtml(project);
  const bytes = new TextEncoder().encode(html);
  if (bytes.byteLength > MAX_PRESENTATION_BYTES) {
    throw new PublicationError(
      "PRESENTATION_TOO_LARGE",
      "生成された発表HTMLが2MiBを超えています。"
    );
  }
  const revisionId = crypto.randomUUID();
  const slug = crypto.randomUUID();
  const objectKey = `presentation-revisions/${ownerUserId}/${projectId}/${revisionId}.html`;
  const now = new Date().toISOString();
  const contentHash = await sha256(bytes);
  await env.MEDIA_BUCKET.put(objectKey, bytes, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
    customMetadata: {
      projectId,
      projectVersion: String(project.version),
      contentHash
    }
  });

  try {
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO presentation_revisions (
             id, project_id, owner_user_id, project_version, object_key,
             content_hash, byte_size, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          revisionId,
          projectId,
          ownerUserId,
          project.version,
          objectKey,
          contentHash,
          bytes.byteLength,
          now
        ),
      env.DB
        .prepare(
          `INSERT INTO project_publications (
             project_id, owner_user_id, slug, latest_preview_revision_id,
             published_revision_id, updated_at
           ) VALUES (?, ?, ?, ?, NULL, ?)
           ON CONFLICT(project_id) DO UPDATE SET
             latest_preview_revision_id = excluded.latest_preview_revision_id,
             updated_at = excluded.updated_at`
        )
        .bind(projectId, ownerUserId, slug, revisionId, now)
    ]);
  } catch (error) {
    try {
      await env.MEDIA_BUCKET.delete(objectKey);
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          message: "Orphaned presentation object could not be removed",
          object_key: objectKey,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError)
        })
      );
    }
    throw error;
  }

  return {
    revision: {
      revision_id: revisionId,
      project_id: projectId,
      project_version: project.version,
      object_key: objectKey,
      content_hash: contentHash,
      byte_size: bytes.byteLength,
      created_at: now
    },
    slug:
      (await getPublicationStatus(env.DB, ownerUserId, projectId))?.slug ?? slug
  };
}

export async function publishPresentationPreview(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  revisionId: string
): Promise<PublicationStatus> {
  const status = await getPublicationStatus(db, ownerUserId, projectId);
  if (status === null) {
    throw new PublicationError("PROJECT_NOT_FOUND", "研究が見つかりません。");
  }
  const revision = await db
    .prepare(
      `SELECT id, project_id, project_version, object_key, content_hash,
              byte_size, created_at
       FROM presentation_revisions
       WHERE id = ? AND project_id = ? AND owner_user_id = ?`
    )
    .bind(revisionId, projectId, ownerUserId)
    .first<RevisionRow>();
  if (revision === null) {
    throw new PublicationError(
      "PREVIEW_NOT_FOUND",
      "確認対象のプレビューが見つかりません。"
    );
  }
  if (revision.project_version !== status.draft_version) {
    throw new PublicationError(
      "PREVIEW_STALE",
      `プレビューは v${revision.project_version}、現在の下書きは v${status.draft_version} です。新しいプレビューを確認してください。`
    );
  }
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE project_publications
       SET published_revision_id = ?, updated_at = ?
       WHERE project_id = ? AND owner_user_id = ?`
    )
    .bind(revisionId, now, projectId, ownerUserId)
    .run();
  if (result.meta.changes === 0) {
    throw new PublicationError(
      "PREVIEW_NOT_FOUND",
      "公開状態が見つかりません。"
    );
  }
  const updated = await getPublicationStatus(db, ownerUserId, projectId);
  if (updated === null) throw new Error("Published project could not be read.");
  return updated;
}

export async function readOwnerPreview(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  ownerUserId: string,
  revisionId: string
): Promise<R2ObjectBody | null> {
  const row = await env.DB
    .prepare(
      "SELECT object_key FROM presentation_revisions WHERE id = ? AND owner_user_id = ?"
    )
    .bind(revisionId, ownerUserId)
    .first<{ object_key: string }>();
  return row === null ? null : env.MEDIA_BUCKET.get(row.object_key);
}

export async function readPublishedPresentation(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  slug: string
): Promise<R2ObjectBody | null> {
  const row = await env.DB
    .prepare(
      `SELECT r.object_key
       FROM project_publications p
       JOIN presentation_revisions r ON r.id = p.published_revision_id
       WHERE p.slug = ?`
    )
    .bind(slug)
    .first<{ object_key: string }>();
  return row === null ? null : env.MEDIA_BUCKET.get(row.object_key);
}
