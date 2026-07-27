CREATE TABLE presentation_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_version INTEGER NOT NULL CHECK (project_version >= 1),
  object_key TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
  created_at TEXT NOT NULL
);

CREATE INDEX presentation_revisions_project_created_idx
  ON presentation_revisions(project_id, created_at DESC);

CREATE TABLE project_publications (
  project_id TEXT PRIMARY KEY REFERENCES research_projects(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  latest_preview_revision_id TEXT REFERENCES presentation_revisions(id) ON DELETE SET NULL,
  published_revision_id TEXT REFERENCES presentation_revisions(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX project_publications_owner_updated_idx
  ON project_publications(owner_user_id, updated_at DESC);
