import { getProjectAsset } from "../assets/repository";
import type { StoredProjectAsset } from "../assets/schema";
import {
  listPresentationAssetIds,
  PRESENTATION_RENDERER_VERSION,
  renderPresentationHtml
} from "../presentation/render";
import { getProject } from "../projects/repository";
import type { ProjectRecord } from "../projects/schema";
import {
  getVoiceProjectStatus,
  hydrateProjectVoice,
  resolveVoiceArtifacts,
  type VoiceSegmentPlan
} from "../voicevox/service";

const MAX_PRESENTATION_BYTES = 2 * 1024 * 1024;
export const MAX_PRESENTATION_ASSETS = 30;
export const MAX_PRESENTATION_ASSET_BYTES = 30 * 1024 * 1024;
const MAX_PRESENTATION_AUDIO_BYTES = 100 * 1024 * 1024;
export const MAX_PRESENTATION_DURATION_SECONDS = 20 * 60;

export type PublicationErrorCode =
  | "PROJECT_NOT_FOUND"
  | "DECK_REQUIRED"
  | "PREVIEW_NOT_FOUND"
  | "PREVIEW_STALE"
  | "PRESENTATION_DURATION_EXCEEDED"
  | "PRESENTATION_ASSET_LIMIT"
  | "PRESENTATION_ASSET_NOT_FOUND"
  | "VOICE_INCOMPLETE"
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
  renderer_version: string;
  object_key: string;
  content_hash: string;
  byte_size: number;
  created_at: string;
};

export type PublicationStatus = {
  project_id: string;
  draft_version: number;
  current_renderer_version: string;
  slug: string | null;
  latest_preview: PresentationRevision | null;
  published: PresentationRevision | null;
};

type RevisionRow = {
  id: string;
  project_id: string;
  project_version: number;
  renderer_version: string;
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
    renderer_version: row.renderer_version,
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

type RevisionAsset = {
  asset: StoredProjectAsset;
  objectKey: string;
  contentUrl: string;
};

type RevisionAudio = {
  segment: VoiceSegmentPlan;
  objectKey: string;
  contentUrl: string;
};

async function removeObjects(
  bucket: R2Bucket,
  objectKeys: string[]
): Promise<void> {
  if (objectKeys.length === 0) return;
  try {
    await bucket.delete(objectKeys);
  } catch (cleanupError) {
    console.error(
      JSON.stringify({
        message: "Orphaned presentation objects could not be removed",
        object_keys: objectKeys,
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
      })
    );
  }
}

async function snapshotPresentationAssets(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  ownerUserId: string,
  project: ProjectRecord,
  revisionId: string
): Promise<RevisionAsset[]> {
  const assetIds = listPresentationAssetIds(project);
  if (assetIds.length > MAX_PRESENTATION_ASSETS) {
    throw new PublicationError(
      "PRESENTATION_ASSET_LIMIT",
      `1つの発表で使用できる画像は${MAX_PRESENTATION_ASSETS}件までです。`
    );
  }
  const assets: StoredProjectAsset[] = [];
  for (const assetId of assetIds) {
    const asset = await getProjectAsset(env.DB, ownerUserId, assetId);
    if (asset === null || asset.project_id !== project.project_id) {
      throw new PublicationError(
        "PRESENTATION_ASSET_NOT_FOUND",
        `発表で参照している画像 ${assetId} が見つかりません。`
      );
    }
    assets.push(asset);
  }
  const totalBytes = assets.reduce((sum, asset) => sum + asset.byte_size, 0);
  if (totalBytes > MAX_PRESENTATION_ASSET_BYTES) {
    throw new PublicationError(
      "PRESENTATION_ASSET_LIMIT",
      "1つの発表で使用する画像は合計30MiBまでです。"
    );
  }

  const snapshots: RevisionAsset[] = [];
  const attemptedObjectKeys: string[] = [];
  try {
    for (const asset of assets) {
      const source = await env.MEDIA_BUCKET.get(asset.object_key);
      if (source === null) {
        throw new PublicationError(
          "PRESENTATION_ASSET_NOT_FOUND",
          `発表で参照している画像 ${asset.asset_id} の実体が見つかりません。`
        );
      }
      const objectKey = `presentation-revisions/${ownerUserId}/${project.project_id}/${revisionId}/assets/${asset.asset_id}.webp`;
      attemptedObjectKeys.push(objectKey);
      await env.MEDIA_BUCKET.put(objectKey, source.body, {
        httpMetadata: { contentType: "image/webp" },
        customMetadata: {
          projectId: project.project_id,
          projectVersion: String(project.version),
          revisionId,
          sourceAssetId: asset.asset_id
        }
      });
      snapshots.push({
        asset,
        objectKey,
        contentUrl: `/presentation-assets/${revisionId}/${asset.asset_id}`
      });
    }
    return snapshots;
  } catch (error) {
    await removeObjects(env.MEDIA_BUCKET, attemptedObjectKeys);
    throw error;
  }
}

async function snapshotPresentationAudio(
  env: Pick<Env, "MEDIA_BUCKET">,
  ownerUserId: string,
  project: ProjectRecord,
  revisionId: string,
  segments: VoiceSegmentPlan[]
): Promise<RevisionAudio[]> {
  const totalBytes = segments.reduce(
    (sum, segment) => sum + (segment.artifact?.byte_size ?? 0),
    0
  );
  if (totalBytes > MAX_PRESENTATION_AUDIO_BYTES) {
    throw new PublicationError(
      "PRESENTATION_ASSET_LIMIT",
      "1つの発表で使用する音声は合計100MiBまでです。"
    );
  }

  const snapshots: RevisionAudio[] = [];
  const attemptedObjectKeys: string[] = [];
  try {
    for (const segment of segments) {
      if (segment.artifact === null) continue;
      const source = await env.MEDIA_BUCKET.get(segment.artifact.object_key);
      if (source === null) {
        throw new PublicationError(
          "VOICE_INCOMPLETE",
          `スライド「${segment.slideTitle}」の音声を読み取れませんでした。再生成してください。`
        );
      }
      const objectKey = `presentation-revisions/${ownerUserId}/${project.project_id}/${revisionId}/audio/${segment.slideId}-${segment.at}.mp3`;
      attemptedObjectKeys.push(objectKey);
      await env.MEDIA_BUCKET.put(objectKey, source.body, {
        httpMetadata: {
          contentType: "audio/mpeg",
          cacheControl: "public, max-age=31536000, immutable"
        },
        customMetadata: {
          projectId: project.project_id,
          projectVersion: String(project.version),
          revisionId,
          fingerprint: segment.fingerprint
        }
      });
      snapshots.push({
        segment,
        objectKey,
        contentUrl: `/presentation-audio/${revisionId}/${segment.slideId}/${segment.at}.mp3`
      });
    }
    return snapshots;
  } catch (error) {
    await removeObjects(env.MEDIA_BUCKET, attemptedObjectKeys);
    throw error;
  }
}

async function resolvePresentationAudio(
  db: D1Database,
  ownerUserId: string,
  project: ProjectRecord
): Promise<VoiceSegmentPlan[]> {
  const status = await getVoiceProjectStatus(
    db,
    ownerUserId,
    project.project_id
  );
  if (
    status?.configured &&
    status.summary.ready !== status.summary.total
  ) {
    throw new PublicationError(
      "VOICE_INCOMPLETE",
      `VOICEVOX音声が ${status.summary.ready} / ${status.summary.total} 区間まで生成されています。音声を仕上げてからプレビューを作成してください。`
    );
  }
  return resolveVoiceArtifacts(db, ownerUserId, project);
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
        `SELECT id, project_id, project_version, renderer_version, object_key, content_hash,
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
    current_renderer_version: PRESENTATION_RENDERER_VERSION,
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

  const existingPublication = await env.DB
    .prepare(
      `SELECT slug FROM project_publications
       WHERE project_id = ? AND owner_user_id = ?`
    )
    .bind(projectId, ownerUserId)
    .first<{ slug: string }>();
  const revisionId = crypto.randomUUID();
  const slug = existingPublication?.slug ?? crypto.randomUUID();
  const objectKey = `presentation-revisions/${ownerUserId}/${projectId}/${revisionId}.html`;
  const now = new Date().toISOString();
  const audioSegments = await resolvePresentationAudio(
    env.DB,
    ownerUserId,
    project
  );
  const snapshots = await snapshotPresentationAssets(
    env,
    ownerUserId,
    project,
    revisionId
  );
  const cleanupKeys = snapshots.map((snapshot) => snapshot.objectKey);

  try {
    const audioSnapshots = await snapshotPresentationAudio(
      env,
      ownerUserId,
      project,
      revisionId,
      audioSegments
    );
    cleanupKeys.push(...audioSnapshots.map((snapshot) => snapshot.objectKey));
    const assetUrls = Object.fromEntries(
      snapshots.map((snapshot) => [
        snapshot.asset.asset_id,
        snapshot.contentUrl
      ])
    );
    const hydratedProject = hydrateProjectVoice(
      project,
      audioSnapshots.map((snapshot) => snapshot.segment),
      (segment) =>
        audioSnapshots.find(
          (snapshot) =>
            snapshot.segment.slideId === segment.slideId &&
            snapshot.segment.at === segment.at
        )?.contentUrl ?? ""
    );
    const html = renderPresentationHtml(hydratedProject, { assetUrls });
    const bytes = new TextEncoder().encode(html);
    if (bytes.byteLength > MAX_PRESENTATION_BYTES) {
      throw new PublicationError(
        "PRESENTATION_TOO_LARGE",
        "生成された発表HTMLが2MiBを超えています。"
      );
    }
    const contentHash = await sha256(bytes);
    await env.MEDIA_BUCKET.put(objectKey, bytes, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
      customMetadata: {
        projectId,
        projectVersion: String(project.version),
        rendererVersion: PRESENTATION_RENDERER_VERSION,
        contentHash
      }
    });
    cleanupKeys.push(objectKey);

    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO presentation_revisions (
             id, project_id, owner_user_id, project_version, renderer_version,
             object_key, content_hash, byte_size, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          revisionId,
          projectId,
          ownerUserId,
          project.version,
          PRESENTATION_RENDERER_VERSION,
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
        .bind(projectId, ownerUserId, slug, revisionId, now),
      ...snapshots.map((snapshot) =>
        env.DB
          .prepare(
            `INSERT INTO presentation_revision_assets (
               revision_id, asset_id, object_key, alt_text, mime_type,
               width, height, byte_size, created_at
             ) VALUES (?, ?, ?, ?, 'image/webp', ?, ?, ?, ?)`
          )
          .bind(
            revisionId,
            snapshot.asset.asset_id,
            snapshot.objectKey,
            snapshot.asset.alt_text,
            snapshot.asset.width,
            snapshot.asset.height,
            snapshot.asset.byte_size,
            now
          )
      ),
      ...audioSnapshots.map((snapshot) =>
        env.DB
          .prepare(
            `INSERT INTO presentation_revision_audio (
               revision_id, owner_user_id, project_id, slide_id, segment_at,
               artifact_fingerprint, object_key, content_hash, mime_type,
               byte_size, duration_ms, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'audio/mpeg', ?, NULL, ?)`
          )
          .bind(
            revisionId,
            ownerUserId,
            projectId,
            snapshot.segment.slideId,
            snapshot.segment.at,
            snapshot.segment.fingerprint,
            snapshot.objectKey,
            snapshot.segment.artifact!.content_hash,
            snapshot.segment.artifact!.byte_size,
            now
          )
      )
    ]);

    return {
      revision: {
        revision_id: revisionId,
        project_id: projectId,
        project_version: project.version,
        renderer_version: PRESENTATION_RENDERER_VERSION,
        object_key: objectKey,
        content_hash: contentHash,
        byte_size: bytes.byteLength,
        created_at: now
      },
      slug
    };
  } catch (error) {
    await removeObjects(env.MEDIA_BUCKET, cleanupKeys);
    throw error;
  }
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
  const project = await getProject(db, ownerUserId, projectId);
  if (project === null) {
    throw new PublicationError("PROJECT_NOT_FOUND", "研究が見つかりません。");
  }
  const totalDurationSeconds = project.document.deck?.slides.reduce(
    (total, slide) => total + slide.duration_seconds,
    0
  ) ?? 0;
  if (totalDurationSeconds > MAX_PRESENTATION_DURATION_SECONDS) {
    throw new PublicationError(
      "PRESENTATION_DURATION_EXCEEDED",
      `想定発表時間が${Math.floor(totalDurationSeconds / 60)}分${String(totalDurationSeconds % 60).padStart(2, "0")}秒です。20分以内に短縮してから公開してください。`
    );
  }
  const revision = await db
    .prepare(
      `SELECT id, project_id, project_version, renderer_version, object_key, content_hash,
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
  if (revision.renderer_version !== PRESENTATION_RENDERER_VERSION) {
    throw new PublicationError(
      "PREVIEW_STALE",
      `プレビューは ${revision.renderer_version}、現在は ${PRESENTATION_RENDERER_VERSION} です。新しいプレビューを確認してください。`
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

export async function readOwnerPresentationAsset(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  ownerUserId: string,
  revisionId: string,
  assetId: string
): Promise<R2ObjectBody | null> {
  const row = await env.DB
    .prepare(
      `SELECT a.object_key
       FROM presentation_revision_assets a
       JOIN presentation_revisions r ON r.id = a.revision_id
       WHERE a.revision_id = ? AND a.asset_id = ? AND r.owner_user_id = ?`
    )
    .bind(revisionId, assetId, ownerUserId)
    .first<{ object_key: string }>();
  return row === null ? null : env.MEDIA_BUCKET.get(row.object_key);
}

export async function readPublishedPresentationAsset(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  revisionId: string,
  assetId: string
): Promise<R2ObjectBody | null> {
  const row = await env.DB
    .prepare(
      `SELECT a.object_key
       FROM presentation_revision_assets a
       JOIN project_publications p
         ON p.published_revision_id = a.revision_id
       WHERE a.revision_id = ? AND a.asset_id = ?`
    )
    .bind(revisionId, assetId)
    .first<{ object_key: string }>();
  return row === null ? null : env.MEDIA_BUCKET.get(row.object_key);
}

export async function readOwnerPresentationAudio(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  ownerUserId: string,
  revisionId: string,
  slideId: string,
  segmentAt: number,
  rangeHeaders?: Headers
): Promise<R2ObjectBody | null> {
  const row = await env.DB
    .prepare(
      `SELECT a.object_key
       FROM presentation_revision_audio a
       JOIN presentation_revisions r ON r.id = a.revision_id
       WHERE a.revision_id = ? AND a.slide_id = ? AND a.segment_at = ?
         AND r.owner_user_id = ?`
    )
    .bind(revisionId, slideId, segmentAt, ownerUserId)
    .first<{ object_key: string }>();
  return row === null
    ? null
    : env.MEDIA_BUCKET.get(
        row.object_key,
        rangeHeaders ? { range: rangeHeaders } : undefined
      );
}

export async function readPublishedPresentationAudio(
  env: Pick<Env, "DB" | "MEDIA_BUCKET">,
  revisionId: string,
  slideId: string,
  segmentAt: number,
  rangeHeaders?: Headers
): Promise<R2ObjectBody | null> {
  const row = await env.DB
    .prepare(
      `SELECT a.object_key
       FROM presentation_revision_audio a
       JOIN project_publications p ON p.published_revision_id = a.revision_id
       WHERE a.revision_id = ? AND a.slide_id = ? AND a.segment_at = ?`
    )
    .bind(revisionId, slideId, segmentAt)
    .first<{ object_key: string }>();
  return row === null
    ? null
    : env.MEDIA_BUCKET.get(
        row.object_key,
        rangeHeaders ? { range: rangeHeaders } : undefined
      );
}
