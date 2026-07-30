CREATE TABLE project_quality_reports (
  project_id TEXT PRIMARY KEY REFERENCES research_projects(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_version INTEGER NOT NULL,
  renderer_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'cancelled')),
  completed_checkpoints INTEGER NOT NULL,
  total_checkpoints INTEGER NOT NULL,
  issue_count INTEGER NOT NULL,
  results_json TEXT NOT NULL CHECK (json_valid(results_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX project_quality_reports_owner_project_idx
  ON project_quality_reports(owner_user_id, project_id);
