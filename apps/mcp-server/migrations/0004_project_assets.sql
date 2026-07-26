CREATE TABLE project_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
  width INTEGER NOT NULL CHECK (width > 0 AND width <= 2560),
  height INTEGER NOT NULL CHECK (height > 0 AND height <= 2560),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX project_assets_project_created_idx
  ON project_assets(project_id, created_at DESC);

CREATE INDEX project_assets_owner_created_idx
  ON project_assets(owner_user_id, created_at DESC);

CREATE TRIGGER project_assets_project_quota
BEFORE INSERT ON project_assets
WHEN (
  SELECT COUNT(*) FROM project_assets WHERE project_id = NEW.project_id
) >= 100
BEGIN
  SELECT RAISE(ABORT, 'ASSET_PROJECT_LIMIT');
END;

CREATE TRIGGER project_assets_user_count_quota
BEFORE INSERT ON project_assets
WHEN (
  SELECT COUNT(*) FROM project_assets WHERE owner_user_id = NEW.owner_user_id
) >= 300
BEGIN
  SELECT RAISE(ABORT, 'ASSET_USER_LIMIT');
END;

CREATE TRIGGER project_assets_user_bytes_quota
BEFORE INSERT ON project_assets
WHEN (
  SELECT COALESCE(SUM(byte_size), 0) FROM project_assets
  WHERE owner_user_id = NEW.owner_user_id
) + NEW.byte_size > 157286400
BEGIN
  SELECT RAISE(ABORT, 'ASSET_STORAGE_LIMIT');
END;
