ALTER TABLE research_projects DROP COLUMN stage;

DROP INDEX IF EXISTS project_draft_revisions_owner_project_version_idx;
DROP TABLE IF EXISTS project_draft_revisions;
