-- ============================================================
-- AeonDial AI Settings Tables
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Tenant-level AI provider settings
CREATE TABLE IF NOT EXISTS tenant_ai_settings (
  tenant_id   text PRIMARY KEY,
  llm_provider text,
  tts_provider text,
  stt_provider text,
  updated_at  timestamptz DEFAULT now()
);

-- Campaign-level AI provider settings (overrides tenant defaults)
CREATE TABLE IF NOT EXISTS campaign_ai_settings (
  campaign_id text PRIMARY KEY,
  tenant_id   text NOT NULL REFERENCES tenant_ai_settings (tenant_id),
  llm_provider text,
  tts_provider text,
  stt_provider text,
  updated_at  timestamptz DEFAULT now()
);

-- ============================================================
-- If you need to recreate tables from scratch (drops existing data):
-- ============================================================
-- DROP TABLE IF EXISTS campaign_ai_settings;
-- DROP TABLE IF EXISTS tenant_ai_settings;
-- Then run the CREATE TABLE statements above.
