-- Migration 006: Agent-First Progressive Dialing
-- Adds columns needed for:
--   1. Tracking the agent's persistent SIP leg (channel_id, waiting_bridge_id)
--   2. Verifying SIP registration before allowing READY state
--   3. Bridge/channel IDs per call attempt for call tracking
-- ─────────────────────────────────────────────────────────────────────────────

-- agent_sessions: agent leg lifecycle columns
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS channel_id              text,
  ADD COLUMN IF NOT EXISTS waiting_bridge_id       text,
  ADD COLUMN IF NOT EXISTS registration_verified   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_leg_answered_at    timestamptz;

-- Index for worker query: find READY + registered + has live channel
CREATE INDEX IF NOT EXISTS idx_agent_sessions_ready_registered
  ON agent_sessions (org_id, campaign_id, state, registration_verified)
  WHERE ended_at IS NULL;

-- Index to find session by channel_id (for agent-leg hangup lookup)
CREATE INDEX IF NOT EXISTS idx_agent_sessions_channel_id
  ON agent_sessions (channel_id)
  WHERE ended_at IS NULL AND channel_id IS NOT NULL;

-- dialer_call_attempts: bridge and channel tracking per attempt
ALTER TABLE dialer_call_attempts
  ADD COLUMN IF NOT EXISTS bridge_id        text,
  ADD COLUMN IF NOT EXISTS agent_channel_id text,
  ADD COLUMN IF NOT EXISTS lead_channel_id  text;
