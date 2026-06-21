CREATE TABLE IF NOT EXISTS assessment_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  draft_json TEXT NOT NULL,
  published_json TEXT NOT NULL,
  draft_revision INTEGER NOT NULL DEFAULT 1,
  published_revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
