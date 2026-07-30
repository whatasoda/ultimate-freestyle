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

export type ProjectDraftRevisionSummary = {
  project_id: string;
  version: number;
  title: string;
  stage: ProjectDocument["stage"];
  slide_count: number;
  total_duration_seconds: number;
  source: "created" | "edit" | "restore";
  created_at: string;
};

export type ProjectDraftRevision = {
  project_id: string;
  version: number;
  source: ProjectDraftRevisionSummary["source"];
  created_at: string;
  document: ProjectDocument;
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
};

export class ProjectRepositoryError extends Error {
  constructor(
    readonly code: ProjectRepositoryErrorCode,
    message: string,
    readonly currentVersion?: number
  ) {
    super(message);
  }
}

type ProjectRow = {
  id: string;
  title: string;
  stage: string;
  document_json: string;
  version: number;
  created_at: string;
  updated_at: string;
};

const MAX_PROJECTS_PER_USER = 20;
const MAX_PROJECT_DOCUMENT_BYTES = 512 * 1024;
export const PROJECT_DRAFT_REVISION_LIMIT = 50;
export const PROJECT_DRAFT_REVISION_MINIMUM = 10;
export const PROJECT_DRAFT_REVISION_BYTE_BUDGET = 8 * 1024 * 1024;

function assertProjectSize(document: ProjectDocument): void {
  const byteLength = new TextEncoder().encode(JSON.stringify(document)).length;
  if (byteLength > MAX_PROJECT_DOCUMENT_BYTES) {
    throw new ProjectRepositoryError(
      "PROJECT_TOO_LARGE",
      `The project document must not exceed ${MAX_PROJECT_DOCUMENT_BYTES} bytes.`
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
      `SELECT id, title, stage, version, created_at, updated_at,
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
    stage: projectDocumentSchema.shape.stage.parse(row.stage),
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
      `SELECT projects.id, projects.title, projects.stage, projects.version,
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
              published.renderer_version AS published_renderer_version
       FROM research_projects AS projects
       LEFT JOIN project_publications AS publications
         ON publications.project_id = projects.id AND publications.owner_user_id = projects.owner_user_id
       LEFT JOIN presentation_revisions AS preview
         ON preview.id = publications.latest_preview_revision_id AND preview.owner_user_id = projects.owner_user_id
       LEFT JOIN presentation_revisions AS published
         ON published.id = publications.published_revision_id AND published.owner_user_id = projects.owner_user_id
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
    }>();

  return result.results.map((row) => ({
    project_id: row.id,
    title: row.title,
    stage: projectDocumentSchema.shape.stage.parse(row.stage),
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
      `SELECT id, title, stage, document_json, version, created_at, updated_at
       FROM research_projects
       WHERE id = ? AND owner_user_id = ?`
    )
    .bind(projectId, ownerUserId)
    .first<ProjectRow>();
  return row === null ? null : toProject(row);
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
      `SELECT id, title, stage, document_json, version, created_at, updated_at
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

  const now = (options.now ?? new Date()).toISOString();
  const projectId = crypto.randomUUID();
  try {
    const documentJson = JSON.stringify(options.document);
    await db.batch([
      db.prepare(
        `INSERT INTO research_projects (
           id, owner_user_id, title, stage, document_json, version,
           idempotency_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .bind(
        projectId,
        options.ownerUserId,
        options.document.title,
        options.document.stage,
        documentJson,
        options.idempotencyKey,
        now,
        now
      ),
      db.prepare(
        `INSERT INTO project_draft_revisions (
           project_id, owner_user_id, version, document_json, source, created_at
         ) VALUES (?, ?, 1, ?, 'created', ?)`
      ).bind(projectId, options.ownerUserId, documentJson, now)
    ]);
  } catch (error) {
    const replay = await db
      .prepare(
        `SELECT id, title, stage, document_json, version, created_at, updated_at
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
  const [result] = await db.batch([
    db.prepare(
      `UPDATE research_projects
       SET title = ?, stage = ?, document_json = ?,
           version = version + 1, updated_at = ?
       WHERE id = ? AND owner_user_id = ? AND version = ?`
    )
    .bind(
      options.document.title,
      options.document.stage,
      documentJson,
      now,
      options.projectId,
      options.ownerUserId,
      options.expectedVersion
    ),
    db.prepare(
      `INSERT INTO project_draft_revisions (
         project_id, owner_user_id, version, document_json, source, created_at
       )
       SELECT id, owner_user_id, version, document_json, ?, ?
       FROM research_projects
       WHERE id = ? AND owner_user_id = ? AND version = ? AND document_json = ?
       ON CONFLICT(project_id, version) DO NOTHING`
    ).bind(
      options.revisionSource ?? "edit",
      now,
      options.projectId,
      options.ownerUserId,
      options.expectedVersion + 1,
      documentJson
    ),
    db.prepare(
      `DELETE FROM project_draft_revisions
       WHERE project_id = ? AND owner_user_id = ? AND version IN (
         SELECT version FROM (
           SELECT version,
                  ROW_NUMBER() OVER (ORDER BY version DESC) AS position,
                  SUM(LENGTH(CAST(document_json AS BLOB))) OVER (
                    ORDER BY version DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                  ) AS cumulative_bytes
           FROM project_draft_revisions
           WHERE project_id = ? AND owner_user_id = ?
         )
         WHERE position > ?
            OR (position > ? AND cumulative_bytes > ?)
       )`
    ).bind(
      options.projectId,
      options.ownerUserId,
      options.projectId,
      options.ownerUserId,
      PROJECT_DRAFT_REVISION_LIMIT,
      PROJECT_DRAFT_REVISION_MINIMUM,
      PROJECT_DRAFT_REVISION_BYTE_BUDGET
    )
  ]);

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

export async function listProjectDraftRevisions(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  limit = 20
): Promise<ProjectDraftRevisionSummary[]> {
  const result = await db.prepare(
    `SELECT project_id, version,
            json_extract(document_json, '$.title') AS title,
            json_extract(document_json, '$.stage') AS stage,
            COALESCE(json_array_length(document_json, '$.deck.slides'), 0) AS slide_count,
            COALESCE((
              SELECT SUM(CAST(json_extract(slide.value, '$.duration_seconds') AS INTEGER))
              FROM json_each(project_draft_revisions.document_json, '$.deck.slides') AS slide
            ), 0) AS total_duration_seconds,
            source, created_at
     FROM project_draft_revisions
     WHERE project_id = ? AND owner_user_id = ?
     ORDER BY version DESC
     LIMIT ?`
  ).bind(projectId, ownerUserId, Math.min(Math.max(limit, 1), PROJECT_DRAFT_REVISION_LIMIT)).all<{
    project_id: string;
    version: number;
    title: string;
    stage: string;
    slide_count: number;
    total_duration_seconds: number;
    source: "created" | "edit" | "restore";
    created_at: string;
  }>();
  return result.results.map((row) => ({
    ...row,
    stage: projectDocumentSchema.shape.stage.parse(row.stage)
  }));
}

export async function getProjectDraftRevision(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  version: number
): Promise<ProjectDraftRevision | null> {
  const row = await db.prepare(
    `SELECT project_id, version, document_json, source, created_at
     FROM project_draft_revisions
     WHERE project_id = ? AND owner_user_id = ? AND version = ?`
  ).bind(projectId, ownerUserId, version).first<{
    project_id: string;
    version: number;
    document_json: string;
    source: ProjectDraftRevisionSummary["source"];
    created_at: string;
  }>();
  if (row === null) return null;
  return {
    project_id: row.project_id,
    version: row.version,
    source: row.source,
    created_at: row.created_at,
    document: projectDocumentSchema.parse(JSON.parse(row.document_json))
  };
}

export async function restoreProjectDraftRevision(
  db: D1Database,
  options: {
    ownerUserId: string;
    projectId: string;
    expectedVersion: number;
    targetVersion: number;
    now?: Date;
  }
): Promise<ProjectRecord> {
  const current = await getProject(db, options.ownerUserId, options.projectId);
  if (current === null) {
    throw new ProjectRepositoryError("PROJECT_NOT_FOUND", "The project does not exist.");
  }
  if (current.version !== options.expectedVersion) {
    throw new ProjectRepositoryError(
      "PROJECT_VERSION_CONFLICT",
      "The project was changed after it was read.",
      current.version
    );
  }
  const revision = await db.prepare(
    `SELECT document_json FROM project_draft_revisions
     WHERE project_id = ? AND owner_user_id = ? AND version = ?`
  ).bind(options.projectId, options.ownerUserId, options.targetVersion).first<{
    document_json: string;
  }>();
  if (revision === null) {
    throw new ProjectRepositoryError("PROJECT_NOT_FOUND", "The draft revision does not exist.");
  }
  return updateProject(db, {
    ownerUserId: options.ownerUserId,
    projectId: options.projectId,
    expectedVersion: options.expectedVersion,
    document: projectDocumentSchema.parse(JSON.parse(revision.document_json)),
    revisionSource: "restore",
    now: options.now
  });
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
  return updateProject(db, {
    ownerUserId: options.ownerUserId,
    projectId: options.projectId,
    expectedVersion: options.expectedVersion,
    document: validated,
    now: options.now
  });
}
