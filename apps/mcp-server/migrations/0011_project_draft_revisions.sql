CREATE TABLE project_draft_revisions (
  project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  document_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('created', 'edit', 'restore')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, version)
);

CREATE INDEX project_draft_revisions_owner_project_version_idx
  ON project_draft_revisions(owner_user_id, project_id, version DESC);

INSERT INTO project_draft_revisions (
  project_id, owner_user_id, version, document_json, source, created_at
)
SELECT id, owner_user_id, version, document_json, 'edit', updated_at
FROM research_projects;
