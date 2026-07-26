CREATE TABLE users (
  id TEXT PRIMARY KEY,
  twitch_user_id TEXT NOT NULL UNIQUE,
  twitch_login TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE oauth_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'twitch'),
  provider_user_id TEXT NOT NULL UNIQUE,
  provider_login TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  last_validated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE entitlements (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_override TEXT NOT NULL CHECK (access_override IN ('allow', 'deny')),
  reason TEXT NOT NULL,
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX audit_events_user_created_idx
  ON audit_events(user_id, created_at DESC);

CREATE INDEX audit_events_type_created_idx
  ON audit_events(event_type, created_at DESC);
