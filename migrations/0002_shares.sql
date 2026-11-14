-- Sharing a cloud project with another TeXBea account, by e-mail (read-only, the recipient can copy it).
-- The functions also create this table on first use, so an existing database needs no manual step.
CREATE TABLE IF NOT EXISTS shares (
  owner_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  to_email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, project_id, to_email)
);
CREATE INDEX IF NOT EXISTS shares_to ON shares (to_email);
