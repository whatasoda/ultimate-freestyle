CREATE TABLE storage_deletion_outbox (
  object_key TEXT PRIMARY KEY CHECK (
    length(object_key) BETWEEN 1 AND 1024
  ),
  project_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason = 'project_deleted'),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX storage_deletion_outbox_due_idx
  ON storage_deletion_outbox(next_attempt_at, created_at);

CREATE TRIGGER research_projects_queue_storage_deletion
BEFORE DELETE ON research_projects
BEGIN
  INSERT OR IGNORE INTO storage_deletion_outbox (
    object_key, project_id, reason, next_attempt_at, created_at
  )
  SELECT object_key, OLD.id, 'project_deleted',
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM project_assets
  WHERE project_id = OLD.id;

  INSERT OR IGNORE INTO storage_deletion_outbox (
    object_key, project_id, reason, next_attempt_at, created_at
  )
  SELECT object_key, OLD.id, 'project_deleted',
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM presentation_revisions
  WHERE project_id = OLD.id;

  INSERT OR IGNORE INTO storage_deletion_outbox (
    object_key, project_id, reason, next_attempt_at, created_at
  )
  SELECT assets.object_key, OLD.id, 'project_deleted',
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM presentation_revision_assets AS assets
  JOIN presentation_revisions AS revisions
    ON revisions.id = assets.revision_id
  WHERE revisions.project_id = OLD.id;

  INSERT OR IGNORE INTO storage_deletion_outbox (
    object_key, project_id, reason, next_attempt_at, created_at
  )
  SELECT audio.object_key, OLD.id, 'project_deleted',
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM presentation_revision_audio AS audio
  JOIN presentation_revisions AS revisions
    ON revisions.id = audio.revision_id
  WHERE revisions.project_id = OLD.id;

  INSERT OR IGNORE INTO storage_deletion_outbox (
    object_key, project_id, reason, next_attempt_at, created_at
  )
  SELECT object_key, OLD.id, 'project_deleted',
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM voice_audio_artifacts
  WHERE project_id = OLD.id;
END;
