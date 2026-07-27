CREATE TABLE presentation_revision_assets (
  revision_id TEXT NOT NULL REFERENCES presentation_revisions(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  alt_text TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
  width INTEGER NOT NULL CHECK (width > 0 AND width <= 2560),
  height INTEGER NOT NULL CHECK (height > 0 AND height <= 2560),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
  created_at TEXT NOT NULL,
  PRIMARY KEY (revision_id, asset_id)
);

CREATE INDEX presentation_revision_assets_revision_idx
  ON presentation_revision_assets(revision_id);
