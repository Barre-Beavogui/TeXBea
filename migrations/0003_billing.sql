-- TeXBea billing migration: Stripe subscriptions and per-plan quotas.
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
