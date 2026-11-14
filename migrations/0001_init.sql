-- TeXBea cloud: accounts (no password anywhere) and per-user project sync.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar TEXT,
  created_at INTEGER NOT NULL
);
-- One row per way of signing in (github, google, email) pointing at the same user.
CREATE TABLE identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities (user_id);
-- Only the hash of the session token is kept.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE TABLE email_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE rate (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
-- A project is stored as opaque gzip chunks; `version` only grows and drives conflict detection.
CREATE TABLE projects (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  upload_id TEXT,
  name TEXT,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  chunks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE chunks (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id, upload_id, seq)
);
-- Per-user Stripe subscription and plan state (free, standard, pro).
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  price_id TEXT,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_customer ON subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_sub ON subscriptions (stripe_subscription_id);
