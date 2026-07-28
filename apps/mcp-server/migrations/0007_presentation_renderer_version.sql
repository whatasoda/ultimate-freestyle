ALTER TABLE presentation_revisions
ADD COLUMN renderer_version TEXT NOT NULL DEFAULT 'uf-renderer@1';
