CREATE TABLE IF NOT EXISTS dating_members (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  joined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dating_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES dating_members(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dating_sessions_member ON dating_sessions(member_id);
CREATE INDEX IF NOT EXISTS dating_sessions_expiry ON dating_sessions(expires_at);

CREATE TABLE IF NOT EXISTS dating_profiles (
  id TEXT PRIMARY KEY REFERENCES dating_members(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age BETWEEN 18 AND 120),
  region TEXT NOT NULL,
  intent TEXT NOT NULL CHECK (intent IN ('long-term', 'short-term', 'open')),
  intro TEXT NOT NULL,
  icebreaker TEXT NOT NULL,
  listed INTEGER NOT NULL CHECK (listed IN (0, 1)),
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dating_discovery ON dating_profiles(listed, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS dating_choices (
  actor TEXT NOT NULL REFERENCES dating_profiles(id) ON DELETE CASCADE,
  target TEXT NOT NULL REFERENCES dating_profiles(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK (choice IN ('interested', 'pass')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (actor, target),
  CHECK (actor <> target)
);
CREATE INDEX IF NOT EXISTS dating_incoming_choices ON dating_choices(target, actor);

CREATE TABLE IF NOT EXISTS dating_blocks (
  actor TEXT NOT NULL REFERENCES dating_members(id) ON DELETE CASCADE,
  target TEXT NOT NULL REFERENCES dating_members(id) ON DELETE CASCADE,
  PRIMARY KEY (actor, target),
  CHECK (actor <> target)
);
CREATE INDEX IF NOT EXISTS dating_incoming_blocks ON dating_blocks(target, actor);

CREATE TABLE IF NOT EXISTS dating_messages (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT NOT NULL REFERENCES dating_profiles(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL REFERENCES dating_profiles(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  UNIQUE (sender, client_id),
  CHECK (sender <> recipient)
);
CREATE INDEX IF NOT EXISTS dating_message_threads ON dating_messages(sender, recipient, sequence DESC);
CREATE INDEX IF NOT EXISTS dating_received_messages ON dating_messages(recipient, sender);

-- Reports survive profile removal so a moderator can review the submitted reason.
CREATE TABLE IF NOT EXISTS dating_reports (
  reporter TEXT NOT NULL,
  subject TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('harassment', 'spam', 'underage', 'impersonation', 'other')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (reporter, subject),
  CHECK (reporter <> subject)
);

CREATE TABLE IF NOT EXISTS dating_rate_limits (
  bucket TEXT PRIMARY KEY,
  used INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dating_rate_expiry ON dating_rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS dating_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO dating_settings (name, value) VALUES ('rate-salt', lower(hex(randomblob(32))));
