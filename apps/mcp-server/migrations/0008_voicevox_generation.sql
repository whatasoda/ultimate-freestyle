CREATE UNIQUE INDEX research_projects_owner_id_idx
  ON research_projects(owner_user_id, id);

CREATE UNIQUE INDEX presentation_revisions_owner_project_id_idx
  ON presentation_revisions(owner_user_id, project_id, id);

CREATE TABLE voice_generation_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  requested_version INTEGER NOT NULL CHECK (requested_version >= 1),
  idempotency_key TEXT NOT NULL CHECK (
    length(idempotency_key) BETWEEN 1 AND 128
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'queued',
      'running',
      'completed',
      'partially_failed',
      'failed',
      'cancelled'
    )
  ),
  total_segments INTEGER NOT NULL CHECK (
    total_segments BETWEEN 1 AND 101
  ),
  completed_segments INTEGER NOT NULL DEFAULT 0 CHECK (
    completed_segments >= 0
  ),
  failed_segments INTEGER NOT NULL DEFAULT 0 CHECK (
    failed_segments >= 0
  ),
  cached_segments INTEGER NOT NULL DEFAULT 0 CHECK (
    cached_segments >= 0
  ),
  total_characters INTEGER NOT NULL CHECK (
    total_characters > 0 AND total_characters <= 202000
  ),
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  UNIQUE(owner_user_id, idempotency_key),
  FOREIGN KEY (owner_user_id, project_id)
    REFERENCES research_projects(owner_user_id, id)
    ON DELETE CASCADE,
  CHECK (completed_segments + failed_segments <= total_segments),
  CHECK (cached_segments <= completed_segments)
);

CREATE INDEX voice_generation_jobs_owner_created_idx
  ON voice_generation_jobs(owner_user_id, created_at DESC);

CREATE INDEX voice_generation_jobs_project_version_idx
  ON voice_generation_jobs(project_id, requested_version, created_at DESC);

CREATE INDEX voice_generation_jobs_status_created_idx
  ON voice_generation_jobs(status, created_at);

CREATE UNIQUE INDEX voice_generation_jobs_project_active_idx
  ON voice_generation_jobs(project_id)
  WHERE status IN ('queued', 'running');

CREATE TRIGGER voice_generation_jobs_owner_pending_quota
BEFORE INSERT ON voice_generation_jobs
WHEN
  NEW.status IN ('queued', 'running') AND
  (
    SELECT COUNT(*)
    FROM voice_generation_jobs
    WHERE
      owner_user_id = NEW.owner_user_id AND
      status IN ('queued', 'running')
  ) >= 3
BEGIN
  SELECT RAISE(ABORT, 'VOICE_PENDING_JOB_LIMIT');
END;

CREATE TABLE voice_audio_artifacts (
  fingerprint TEXT NOT NULL CHECK (
    length(fingerprint) = 64 AND
    fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  owner_user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE CHECK (
    length(object_key) BETWEEN 1 AND 1024
  ),
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 64 AND
    content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  mime_type TEXT NOT NULL CHECK (mime_type = 'audio/mpeg'),
  byte_size INTEGER NOT NULL CHECK (
    byte_size > 0 AND byte_size <= 16777216
  ),
  engine_version TEXT NOT NULL CHECK (
    length(engine_version) BETWEEN 1 AND 64
  ),
  image_digest TEXT NOT NULL CHECK (
    length(image_digest) = 71 AND
    substr(image_digest, 1, 7) = 'sha256:' AND
    substr(image_digest, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  r2_etag TEXT,
  duration_ms INTEGER CHECK (
    duration_ms IS NULL OR (duration_ms > 0 AND duration_ms <= 3600000)
  ),
  codec TEXT NOT NULL DEFAULT 'mp3' CHECK (codec = 'mp3'),
  sample_rate_hz INTEGER NOT NULL DEFAULT 24000 CHECK (
    sample_rate_hz = 24000
  ),
  channels INTEGER NOT NULL DEFAULT 1 CHECK (channels = 1),
  bitrate_bps INTEGER NOT NULL DEFAULT 64000 CHECK (bitrate_bps = 64000),
  last_accessed_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_user_id, project_id, fingerprint),
  FOREIGN KEY (owner_user_id, project_id)
    REFERENCES research_projects(owner_user_id, id)
    ON DELETE CASCADE
);

CREATE INDEX voice_audio_artifacts_owner_created_idx
  ON voice_audio_artifacts(owner_user_id, created_at DESC);

CREATE INDEX voice_audio_artifacts_project_created_idx
  ON voice_audio_artifacts(project_id, created_at DESC);

CREATE INDEX voice_audio_artifacts_fingerprint_idx
  ON voice_audio_artifacts(fingerprint);

CREATE TRIGGER voice_audio_artifacts_owner_bytes_quota
BEFORE INSERT ON voice_audio_artifacts
WHEN (
  SELECT COALESCE(SUM(byte_size), 0)
  FROM voice_audio_artifacts
  WHERE owner_user_id = NEW.owner_user_id
) + NEW.byte_size > 104857600
BEGIN
  SELECT RAISE(ABORT, 'VOICE_STORAGE_LIMIT');
END;

CREATE TABLE voice_generation_segments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES voice_generation_jobs(id) ON DELETE CASCADE,
  slide_id TEXT NOT NULL CHECK (
    length(slide_id) BETWEEN 1 AND 64
  ),
  segment_at INTEGER NOT NULL CHECK (
    segment_at BETWEEN 0 AND 999
  ),
  fingerprint TEXT NOT NULL CHECK (
    length(fingerprint) = 64 AND
    fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  input_json TEXT NOT NULL CHECK (
    length(input_json) BETWEEN 2 AND 262144 AND json_valid(input_json)
  ),
  status TEXT NOT NULL CHECK (
    status IN (
      'queued',
      'running',
      'completed',
      'cached',
      'failed',
      'cancelled'
    )
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token TEXT,
  lease_expires_at TEXT,
  object_key TEXT CHECK (
    object_key IS NULL OR length(object_key) BETWEEN 1 AND 1024
  ),
  byte_size INTEGER CHECK (
    byte_size IS NULL OR (byte_size > 0 AND byte_size <= 16777216)
  ),
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id, slide_id, segment_at),
  UNIQUE(job_id, id),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((status = 'running') = (lease_token IS NOT NULL)),
  CHECK (
    status NOT IN ('completed', 'cached') OR (
      object_key IS NOT NULL AND byte_size IS NOT NULL
    )
  )
);

CREATE INDEX voice_generation_segments_job_status_idx
  ON voice_generation_segments(job_id, status, segment_at);

CREATE INDEX voice_generation_segments_status_lease_idx
  ON voice_generation_segments(status, lease_expires_at);

CREATE INDEX voice_generation_segments_fingerprint_idx
  ON voice_generation_segments(fingerprint, status);

CREATE TRIGGER voice_generation_segments_input_immutable
BEFORE UPDATE OF slide_id, segment_at, fingerprint, input_json
ON voice_generation_segments
WHEN
  NEW.slide_id IS NOT OLD.slide_id OR
  NEW.segment_at IS NOT OLD.segment_at OR
  NEW.fingerprint IS NOT OLD.fingerprint OR
  NEW.input_json IS NOT OLD.input_json
BEGIN
  SELECT RAISE(ABORT, 'VOICE_SEGMENT_INPUT_IMMUTABLE');
END;

CREATE TABLE voice_project_audio (
  project_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  slide_id TEXT NOT NULL CHECK (
    length(slide_id) BETWEEN 1 AND 64
  ),
  segment_at INTEGER NOT NULL CHECK (
    segment_at BETWEEN 0 AND 999
  ),
  fingerprint TEXT NOT NULL CHECK (
    length(fingerprint) = 64 AND
    fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  artifact_fingerprint TEXT NOT NULL,
  source_project_version INTEGER NOT NULL CHECK (
    source_project_version >= 1
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, slide_id, segment_at),
  FOREIGN KEY (owner_user_id, project_id)
    REFERENCES research_projects(owner_user_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, project_id, artifact_fingerprint)
    REFERENCES voice_audio_artifacts(owner_user_id, project_id, fingerprint)
    ON DELETE CASCADE,
  CHECK (fingerprint = artifact_fingerprint)
);

CREATE INDEX voice_project_audio_artifact_idx
  ON voice_project_audio(
    owner_user_id,
    project_id,
    artifact_fingerprint
  );

CREATE INDEX voice_project_audio_version_idx
  ON voice_project_audio(project_id, source_project_version, segment_at);

CREATE TABLE presentation_revision_audio (
  revision_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  slide_id TEXT NOT NULL CHECK (
    length(slide_id) BETWEEN 1 AND 64
  ),
  segment_at INTEGER NOT NULL CHECK (
    segment_at BETWEEN 0 AND 999
  ),
  artifact_fingerprint TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE CHECK (
    length(object_key) BETWEEN 1 AND 1024
  ),
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 64 AND
    content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  mime_type TEXT NOT NULL CHECK (mime_type = 'audio/mpeg'),
  byte_size INTEGER NOT NULL CHECK (
    byte_size > 0 AND byte_size <= 16777216
  ),
  duration_ms INTEGER CHECK (
    duration_ms IS NULL OR (duration_ms > 0 AND duration_ms <= 3600000)
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (revision_id, slide_id, segment_at),
  FOREIGN KEY (owner_user_id, project_id, revision_id)
    REFERENCES presentation_revisions(owner_user_id, project_id, id)
    ON DELETE CASCADE
);

CREATE INDEX presentation_revision_audio_revision_idx
  ON presentation_revision_audio(revision_id, segment_at);

CREATE INDEX presentation_revision_audio_artifact_idx
  ON presentation_revision_audio(
    owner_user_id,
    project_id,
    artifact_fingerprint
  );

CREATE TRIGGER presentation_revision_audio_immutable
BEFORE UPDATE ON presentation_revision_audio
BEGIN
  SELECT RAISE(ABORT, 'PRESENTATION_REVISION_AUDIO_IMMUTABLE');
END;

CREATE TABLE voice_usage_monthly (
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL CHECK (
    length(month_key) = 7 AND
    month_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND
    CAST(substr(month_key, 6, 2) AS INTEGER) BETWEEN 1 AND 12
  ),
  jobs_requested INTEGER NOT NULL DEFAULT 0 CHECK (jobs_requested >= 0),
  characters_requested INTEGER NOT NULL DEFAULT 0 CHECK (
    characters_requested >= 0
  ),
  characters_generated INTEGER NOT NULL DEFAULT 0 CHECK (
    characters_generated >= 0
  ),
  bytes_generated INTEGER NOT NULL DEFAULT 0 CHECK (bytes_generated >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_user_id, month_key),
  CHECK (characters_generated <= characters_requested)
);

CREATE INDEX voice_usage_monthly_month_idx
  ON voice_usage_monthly(month_key, owner_user_id);

CREATE TABLE voice_queue_outbox (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  segment_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'publishing', 'sent', 'dead')
  ),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id, segment_id)
    REFERENCES voice_generation_segments(job_id, id)
    ON DELETE CASCADE,
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((status = 'publishing') = (lease_token IS NOT NULL)),
  CHECK (status != 'sent' OR sent_at IS NOT NULL)
);

CREATE INDEX voice_queue_outbox_dispatch_idx
  ON voice_queue_outbox(status, next_attempt_at);

CREATE INDEX voice_queue_outbox_job_idx
  ON voice_queue_outbox(job_id, status);

CREATE INDEX voice_queue_outbox_lease_idx
  ON voice_queue_outbox(status, lease_expires_at);
