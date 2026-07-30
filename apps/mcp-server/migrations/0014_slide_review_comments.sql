CREATE TABLE slide_review_comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slide_id TEXT NOT NULL,
  project_version INTEGER NOT NULL,
  target_key TEXT NOT NULL,
  target_label TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('slide', 'content', 'narration')),
  range_start INTEGER,
  range_end INTEGER,
  selected_text TEXT NOT NULL,
  quote_prefix TEXT NOT NULL,
  quote_suffix TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (
    (range_start IS NULL AND range_end IS NULL AND selected_text = '') OR
    (range_start IS NOT NULL AND range_start >= 0 AND range_end IS NOT NULL AND range_end > range_start AND selected_text <> '')
  )
);

CREATE INDEX slide_review_comments_owner_project_idx
  ON slide_review_comments(owner_user_id, project_id, status, created_at DESC);

CREATE INDEX slide_review_comments_owner_slide_idx
  ON slide_review_comments(owner_user_id, project_id, slide_id, status, created_at DESC);
