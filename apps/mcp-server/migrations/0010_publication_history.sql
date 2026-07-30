ALTER TABLE presentation_revisions
ADD COLUMN published_at TEXT;

UPDATE presentation_revisions
SET published_at = created_at
WHERE id IN (
  SELECT published_revision_id
  FROM project_publications
  WHERE published_revision_id IS NOT NULL
);
