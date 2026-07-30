CREATE TABLE publication_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('publish', 'rollback', 'unpublish')),
  from_revision_id TEXT REFERENCES presentation_revisions(id) ON DELETE SET NULL,
  to_revision_id TEXT REFERENCES presentation_revisions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX publication_events_owner_project_created_idx
  ON publication_events(owner_user_id, project_id, created_at DESC);

INSERT INTO publication_events (
  id, project_id, owner_user_id, action, from_revision_id, to_revision_id, created_at
)
SELECT lower(hex(randomblob(16))), publications.project_id,
       publications.owner_user_id, 'publish', NULL,
       publications.published_revision_id,
       COALESCE(revisions.published_at, publications.updated_at)
FROM project_publications AS publications
JOIN presentation_revisions AS revisions
  ON revisions.id = publications.published_revision_id
WHERE publications.published_revision_id IS NOT NULL;
