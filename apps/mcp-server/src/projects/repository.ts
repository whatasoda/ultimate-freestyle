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
    await db
      .prepare(
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
        JSON.stringify(options.document),
        options.idempotencyKey,
        now,
        now
      )
      .run();
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
    now?: Date;
  }
): Promise<ProjectRecord> {
  assertProjectSize(options.document);
  const now = (options.now ?? new Date()).toISOString();
  const result = await db
    .prepare(
      `UPDATE research_projects
       SET title = ?, stage = ?, document_json = ?,
           version = version + 1, updated_at = ?
       WHERE id = ? AND owner_user_id = ? AND version = ?`
    )
    .bind(
      options.document.title,
      options.document.stage,
      JSON.stringify(options.document),
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
  return updateProject(db, {
    ownerUserId: options.ownerUserId,
    projectId: options.projectId,
    expectedVersion: options.expectedVersion,
    document: validated,
    now: options.now
  });
}
