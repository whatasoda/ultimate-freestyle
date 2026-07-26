CREATE TABLE web_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token_hash TEXT NOT NULL,
  authenticated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX web_sessions_user_expires_idx
  ON web_sessions(user_id, expires_at DESC);

CREATE INDEX web_sessions_expires_idx
  ON web_sessions(expires_at);
