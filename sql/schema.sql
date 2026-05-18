-- ============================================================
-- Pixclof API — Supabase schema
-- Paste into the Supabase SQL Editor and run.
-- ============================================================

-- ------------------------------------------------------------
-- Drop existing tables (commented out — uncomment ONLY for a
-- clean rebuild; this destroys all data).
-- ------------------------------------------------------------
-- DROP TABLE IF EXISTS agent_states_latest CASCADE;
-- DROP TABLE IF EXISTS agent_states CASCADE;
-- DROP TABLE IF EXISTS agents CASCADE;
-- DROP TABLE IF EXISTS offices CASCADE;

-- ------------------------------------------------------------
-- 1. offices — one row per token-holding wallet
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offices (
  wallet       TEXT PRIMARY KEY,
  display_name TEXT,
  theme        TEXT NOT NULL DEFAULT 'cozy-day',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. agents — agents registered under an office
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet       TEXT NOT NULL REFERENCES offices(wallet) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  avatar_seed  TEXT,
  api_key_hash TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- 3. agent_states — append-only history of every state report
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_states (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  state      TEXT NOT NULL,
  zone       TEXT,
  task       TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 4. agent_states_latest — denormalized current state per agent
--    (fast reads for the realtime dashboard)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_states_latest (
  agent_id   UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  state      TEXT NOT NULL,
  zone       TEXT,
  task       TEXT,
  metadata   JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_agent_states_agent_created
  ON agent_states (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agents_wallet
  ON agents (wallet);

-- ------------------------------------------------------------
-- Realtime — publish latest-state table for client subscriptions
-- ------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE agent_states_latest;

-- ------------------------------------------------------------
-- Row-level security
-- All access goes through the API using the service-role key,
-- which bypasses RLS. With RLS enabled and NO permissive policies,
-- the anon/authenticated keys get zero direct access.
-- ------------------------------------------------------------
ALTER TABLE offices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_states        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_states_latest ENABLE ROW LEVEL SECURITY;

-- "Service role bypass" — service-role key bypasses RLS automatically,
-- so we deliberately add no permissive policies for anon/authenticated.
-- (Documented here for clarity; nothing to create.)
