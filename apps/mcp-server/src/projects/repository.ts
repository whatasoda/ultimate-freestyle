import {
  projectDocumentSchema,
  type ProjectDocument,
  type ProjectRecord,
  type ProjectSummary
} from "./schema";

export type ProjectRepositoryErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_VERSION_CONFLICT"
  | "PROJECT_LIMIT_REACHED"
  | "PROJECT_TOO_LARGE";

export type ProjectSizeDetails = {
  current_bytes: number | null;
  proposed_bytes: number;
  limit_bytes: number;
  exceeded_by_bytes: number;
};

export type ProjectStorageUsage = {
  current_bytes: number;
  limit_bytes: number;
  remaining_bytes: number;
  usage_percent: number;
};

export type DashboardProjectSummary = ProjectSummary & {
  voice_segment_count: number;
  voice_ready_count: number;
  publication_slug: string | null;
  preview_project_version: number | null;
  preview_renderer_version: string | null;
  preview_reviewed_at: string | null;
  published_project_version: number | null;
  published_renderer_version: string | null;
  quality_project_version: number | null;
  quality_renderer_version: string | null;
  quality_status: "completed" | "cancelled" | null;
  quality_issue_count: number | null;
};

export class ProjectRepositoryError extends Error {
  constructor(
    readonly code: ProjectRepositoryErrorCode,
    message: string,
    readonly currentVersion?: number,
    readonly size?: ProjectSizeDetails
  ) {
    super(message);
  }
}

type ProjectRow = {
  id: string;
  title: string;
  document_json: string;
  version: number;
  created_at: string;
  updated_at: string;
};

const MAX_PROJECTS_PER_USER = 20;
export const MAX_PROJECT_DOCUMENT_BYTES = 512 * 1024;

export function projectDocumentBytes(document: ProjectDocument): number {
  return new TextEncoder().encode(JSON.stringify(document)).length;
}

export function projectStorageUsage(document: ProjectDocument): ProjectStorageUsage {
  const currentBytes = projectDocumentBytes(document);
  return {
    current_bytes: currentBytes,
    limit_bytes: MAX_PROJECT_DOCUMENT_BYTES,
    remaining_bytes: Math.max(0, MAX_PROJECT_DOCUMENT_BYTES - currentBytes),
    usage_percent: Math.round(currentBytes / MAX_PROJECT_DOCUMENT_BYTES * 1_000) / 10
  };
}

function assertProjectSize(document: ProjectDocument, current?: ProjectDocument): void {
  const proposedBytes = projectDocumentBytes(document);
  if (proposedBytes > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new ProjectRepositoryError(
      "PROJECT_TOO_LARGE",
      `The project document must not exceed ${MAX_PROJECT_DOCUMENT_BYTES} bytes.`,
      undefined,
      {
        current_bytes: current === undefined ? null : projectDocumentBytes(current),
        proposed_bytes: proposedBytes,
        limit_bytes: MAX_PROJECT_DOCUMENT_BYTES,
        exceeded_by_bytes: proposedBytes - MAX_PROJECT_DOCUMENT_BYTES
      }
    );
  }
}

function toProject(row: ProjectRow): ProjectRecord {
  return {
    project_id: row.id,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    document: projectDocumentSchema.parse(JSON.parse(row.document_json))
  };
}

export async function listProjects(
  db: D1Database,
  ownerUserId: string
): Promise<ProjectSummary[]> {
  const result = await db
    .prepare(
      `SELECT id, title, version, created_at, updated_at,
              CASE WHEN json_type(document_json, '$.deck') = 'object' THEN 1 ELSE 0 END AS has_presentation,
              COALESCE(json_array_length(document_json, '$.deck.slides'), 0) AS slide_count,
              COALESCE((
                SELECT SUM(CAST(json_extract(slide.value, '$.duration_seconds') AS INTEGER))
                FROM json_each(research_projects.document_json, '$.deck.slides') AS slide
              ), 0) AS total_duration_seconds
       FROM research_projects
       WHERE owner_user_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .bind(ownerUserId, MAX_PROJECTS_PER_USER)
    .all<Omit<ProjectRow, "document_json"> & {
      has_presentation: number;
      slide_count: number;
      total_duration_seconds: number;
    }>();

  return result.results.map((row) => ({
    project_id: row.id,
    title: row.title,
    version: row.version,
    has_presentation: row.has_presentation === 1,
    slide_count: row.slide_count,
    total_duration_seconds: row.total_duration_seconds,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

export async function listDashboardProjects(
  db: D1Database,
  ownerUserId: string
): Promise<DashboardProjectSummary[]> {
  const result = await db
    .prepare(
      `SELECT projects.id, projects.title, projects.version,
              projects.created_at, projects.updated_at,
              CASE WHEN json_type(projects.document_json, '$.deck') = 'object' THEN 1 ELSE 0 END AS has_presentation,
              COALESCE(json_array_length(projects.document_json, '$.deck.slides'), 0) AS slide_count,
              COALESCE((
                SELECT SUM(CAST(json_extract(slide.value, '$.duration_seconds') AS INTEGER))
                FROM json_each(projects.document_json, '$.deck.slides') AS slide
              ), 0) AS total_duration_seconds,
              COALESCE((
                SELECT COUNT(*)
                FROM json_each(projects.document_json, '$.deck.slides') AS slide,
                     json_each(slide.value, '$.narration.segments') AS segment
              ), 0) AS voice_segment_count,
              COALESCE((
                SELECT COUNT(*)
                FROM json_each(projects.document_json, '$.deck.slides') AS slide,
                     json_each(slide.value, '$.narration.segments') AS segment
                WHERE json_extract(segment.value, '$.audio_src') IS NOT NULL
              ), 0) AS voice_ready_count,
              publications.slug AS publication_slug,
              preview.project_version AS preview_project_version,
              preview.renderer_version AS preview_renderer_version,
              preview.reviewed_at AS preview_reviewed_at,
              published.project_version AS published_project_version,
              published.renderer_version AS published_renderer_version,
              quality.project_version AS quality_project_version,
              quality.renderer_version AS quality_renderer_version,
              quality.status AS quality_status,
              quality.issue_count AS quality_issue_count
       FROM research_projects AS projects
       LEFT JOIN project_publications AS publications
         ON publications.project_id = projects.id AND publications.owner_user_id = projects.owner_user_id
       LEFT JOIN presentation_revisions AS preview
         ON preview.id = publications.latest_preview_revision_id AND preview.owner_user_id = projects.owner_user_id
       LEFT JOIN presentation_revisions AS published
         ON published.id = publications.published_revision_id AND published.owner_user_id = projects.owner_user_id
       LEFT JOIN project_quality_reports AS quality
         ON quality.project_id = projects.id AND quality.owner_user_id = projects.owner_user_id
       WHERE projects.owner_user_id = ?
       ORDER BY projects.updated_at DESC
       LIMIT ?`
    )
    .bind(ownerUserId, MAX_PROJECTS_PER_USER)
    .all<Omit<ProjectRow, "document_json"> & {
      has_presentation: number;
      slide_count: number;
      total_duration_seconds: number;
      voice_segment_count: number;
      voice_ready_count: number;
      publication_slug: string | null;
      preview_project_version: number | null;
      preview_renderer_version: string | null;
      preview_reviewed_at: string | null;
      published_project_version: number | null;
      published_renderer_version: string | null;
      quality_project_version: number | null;
      quality_renderer_version: string | null;
      quality_status: "completed" | "cancelled" | null;
      quality_issue_count: number | null;
    }>();

  return result.results.map((row) => ({
    project_id: row.id,
    title: row.title,
    version: row.version,
    has_presentation: row.has_presentation === 1,
    slide_count: row.slide_count,
    total_duration_seconds: row.total_duration_seconds,
    voice_segment_count: row.voice_segment_count,
    voice_ready_count: row.voice_ready_count,
    publication_slug: row.publication_slug,
    preview_project_version: row.preview_project_version,
    preview_renderer_version: row.preview_renderer_version,
    preview_reviewed_at: row.preview_reviewed_at,
    published_project_version: row.published_project_version,
    published_renderer_version: row.published_renderer_version,
    quality_project_version: row.quality_project_version,
    quality_renderer_version: row.quality_renderer_version,
    quality_status: row.quality_status,
    quality_issue_count: row.quality_issue_count,
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

export async function getProject(
  db: D1Database,
  ownerUserId: string,
  projectId: string
): Promise<ProjectRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, title, document_json, version, created_at, updated_at
       FROM research_projects
       WHERE id = ? AND owner_user_id = ?`
    )
    .bind(projectId, ownerUserId)
    .first<ProjectRow>();
  return row === null ? null : toProject(row);
}

export async function deleteProject(
  db: D1Database,
  options: {
    ownerUserId: string;
    projectId: string;
    expectedVersion: number;
  }
): Promise<{ projectId: string; queuedObjectDeletions: number }> {
  const deleted = await db
    .prepare(
      `DELETE FROM research_projects
       WHERE id = ? AND owner_user_id = ? AND version = ?
       RETURNING id`
    )
    .bind(options.projectId, options.ownerUserId, options.expectedVersion)
    .first<{ id: string }>();
  if (deleted === null) {
    const current = await getProject(db, options.ownerUserId, options.projectId);
    if (current === null) {
      throw new ProjectRepositoryError(
        "PROJECT_NOT_FOUND",
        "The project does not exist."
      );
    }
    throw new ProjectRepositoryError(
      "PROJECT_VERSION_CONFLICT",
      "The project was changed after it was read.",
      current.version
    );
  }
  const pending = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM storage_deletion_outbox
       WHERE project_id = ?`
    )
    .bind(options.projectId)
    .first<{ count: number }>();
  return {
    projectId: deleted.id,
    queuedObjectDeletions: Number(pending?.count ?? 0)
  };
}

export async function createProject(
  db: D1Database,
  options: {
    ownerUserId: string;
    idempotencyKey: string;
    document: ProjectDocument;
    now?: Date;
  }
): Promise<{ project: ProjectRecord; replayed: boolean }> {
  const existing = await db
    .prepare(
      `SELECT id, title, document_json, version, created_at, updated_at
       FROM research_projects
       WHERE owner_user_id = ? AND idempotency_key = ?`
    )
    .bind(options.ownerUserId, options.idempotencyKey)
    .first<ProjectRow>();
  if (existing !== null) {
    return { project: toProject(existing), replayed: true };
  }

  const count = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM research_projects WHERE owner_user_id = ?"
    )
    .bind(options.ownerUserId)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= MAX_PROJECTS_PER_USER) {
    throw new ProjectRepositoryError(
      "PROJECT_LIMIT_REACHED",
      `A user can own at most ${MAX_PROJECTS_PER_USER} projects.`
    );
  }

  assertProjectSize(options.document);

  const now = (options.now ?? new Date()).toISOString();
  const projectId = crypto.randomUUID();
  try {
    const documentJson = JSON.stringify(options.document);
    await db
      .prepare(
        `INSERT INTO research_projects (
           id, owner_user_id, title, document_json, version,
           idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .bind(
        projectId,
        options.ownerUserId,
        options.document.title,
        documentJson,
        options.idempotencyKey,
        now,
        now
      )
      .run();
  } catch (error) {
    const replay = await db
      .prepare(
        `SELECT id, title, document_json, version, created_at, updated_at
         FROM research_projects
         WHERE owner_user_id = ? AND idempotency_key = ?`
      )
      .bind(options.ownerUserId, options.idempotencyKey)
      .first<ProjectRow>();
    if (replay !== null) {
      return { project: toProject(replay), replayed: true };
    }
    throw error;
  }

  const project = await getProject(db, options.ownerUserId, projectId);
  if (project === null) {
    throw new Error("Created project could not be read.");
  }
  return { project, replayed: false };
}

export async function updateProject(
  db: D1Database,
  options: {
    ownerUserId: string;
    projectId: string;
    expectedVersion: number;
    document: ProjectDocument;
    revisionSource?: "edit" | "restore";
    now?: Date;
  }
): Promise<ProjectRecord> {
  assertProjectSize(options.document);
  const now = (options.now ?? new Date()).toISOString();
  const documentJson = JSON.stringify(options.document);
  const result = await db
    .prepare(
      `UPDATE research_projects
       SET title = ?, document_json = ?,
           version = version + 1, updated_at = ?
       WHERE id = ? AND owner_user_id = ? AND version = ?`
    )
    .bind(
      options.document.title,
      documentJson,
      now,
      options.projectId,
      options.ownerUserId,
      options.expectedVersion
    )
    .run();

  if (result.meta.changes === 0) {
    const current = await getProject(
      db,
      options.ownerUserId,
      options.projectId
    );
    if (current === null) {
      throw new ProjectRepositoryError(
        "PROJECT_NOT_FOUND",
        "The project does not exist."
      );
    }
    throw new ProjectRepositoryError(
      "PROJECT_VERSION_CONFLICT",
      "The project was changed after it was read.",
      current.version
    );
  }

  const project = await getProject(db, options.ownerUserId, options.projectId);
  if (project === null) {
    throw new Error("Updated project could not be read.");
  }
  return project;
}

export async function mutateProject(
  db: D1Database,
  options: {
    ownerUserId: string;
    projectId: string;
    expectedVersion: number;
    mutate: (document: ProjectDocument) => void;
    now?: Date;
  }
): Promise<ProjectRecord> {
  const current = await getProject(db, options.ownerUserId, options.projectId);
  if (current === null) {
    throw new ProjectRepositoryError(
      "PROJECT_NOT_FOUND",
      "The project does not exist."
    );
  }
  if (current.version !== options.expectedVersion) {
    throw new ProjectRepositoryError(
      "PROJECT_VERSION_CONFLICT",
      "The project was changed after it was read.",
      current.version
    );
  }

  const document = structuredClone(current.document);
  options.mutate(document);
  const validated = projectDocumentSchema.parse(document);
  assertProjectSize(validated, current.document);
  return updateProject(db, {
    ownerUserId: options.ownerUserId,
    projectId: options.projectId,
    expectedVersion: options.expectedVersion,
    document: validated,
    now: options.now
  });
}
