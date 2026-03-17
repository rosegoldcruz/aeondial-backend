ALTER TABLE tenant_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_ai_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE tenant_ai_settings FROM anon, authenticated, public;
REVOKE ALL ON TABLE campaign_ai_settings FROM anon, authenticated, public;

GRANT ALL ON TABLE tenant_ai_settings TO service_role;
GRANT ALL ON TABLE campaign_ai_settings TO service_role;

DROP POLICY IF EXISTS tenant_ai_settings_service_role_all ON tenant_ai_settings;
CREATE POLICY tenant_ai_settings_service_role_all
  ON tenant_ai_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS campaign_ai_settings_service_role_all ON campaign_ai_settings;
CREATE POLICY campaign_ai_settings_service_role_all
  ON campaign_ai_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
