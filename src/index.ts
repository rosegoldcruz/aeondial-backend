import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import { config, assertRequiredConfig } from './core/config';
import { logger } from './core/logger';
import { startBackgroundWorkers } from './core/redis';
import { startAriEventService } from './core/ariEvents';
import { authPlugin, requireTenantContext } from './core/auth';
import { websocketPlugin } from './core/websocket';

// Modules
import { agentSessionsModule } from './modules/agentSessions';
import { agentStateHistoryModule } from './modules/agentStateHistory';
import { aiEventsModule } from './modules/aiEvents';
import { aiSettingsModule } from './modules/aiSettings';
import { callEventsModule } from './modules/callEvents';
import { callsModule } from './modules/calls';
import { campaignAiSettingsModule } from './modules/campaignAiSettings';
import { campaignLeadsModule } from './modules/campaignLeads';
import { campaignsModule } from './modules/campaigns';
import { contactsModule } from './modules/contacts';
import { dialerCallAttemptsModule } from './modules/dialerCallAttempts';
import { dispositionsModule } from './modules/dispositions';
import { leadDispositionEventsModule } from './modules/leadDispositionEvents';
import { leadNotesModule } from './modules/leadNotes';
import { leadsModule } from './modules/leads';
import { orgsModule } from './modules/orgs';
import { phoneNumbersModule } from './modules/phoneNumbers';
import { recordingsModule } from './modules/recordings';
import { tenantAiSettingsModule } from './modules/tenantAiSettings';
import { trunksModule } from './modules/trunks';
import { usersModule } from './modules/users';

// Legacy composite modules (kept for backward compat)
import { agentsModule } from './modules/agents';
import { telephonyModule } from './modules/telephony';
import { aiModule } from './modules/ai';
import { automationsModule } from './modules/automations';
import { dialerModule } from './modules/dialer';

async function buildServer() {
  assertRequiredConfig();

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: [config.crmOrigin, config.aiWorkerOrigin],
    credentials: true,
  });
  await app.register(helmet);
  await app.register(websocket);
  await authPlugin(app, {});

  app.addHook('preHandler', requireTenantContext);

  await app.register(websocketPlugin);

  app.get('/health', async () => ({ ok: true }));
  app.get('/version', async () => ({
    version: 'phase1-phase2-scaffold',
    timestamp: new Date().toISOString(),
  }));

  // ── 21 resource modules ──────────────────────────────────────────────────
  app.register(agentSessionsModule,        { prefix: '/api/agent-sessions' });
  app.register(agentStateHistoryModule,    { prefix: '/api/agent-state-history' });
  app.register(aiEventsModule,             { prefix: '/api/ai-events' });
  app.register(aiSettingsModule,           { prefix: '/api/ai-settings' });
  app.register(callEventsModule,           { prefix: '/api/call-events' });
  app.register(callsModule,                { prefix: '/api/calls' });
  app.register(campaignAiSettingsModule,   { prefix: '/api/campaign-ai-settings' });
  app.register(campaignLeadsModule,        { prefix: '/api/campaign-leads' });
  app.register(campaignsModule,            { prefix: '/api/campaigns' });
  app.register(contactsModule,             { prefix: '/api/contacts' });
  app.register(dialerCallAttemptsModule,   { prefix: '/api/dialer-call-attempts' });
  app.register(dispositionsModule,         { prefix: '/api/dispositions' });
  app.register(leadDispositionEventsModule, { prefix: '/api/lead-disposition-events' });
  app.register(leadNotesModule,            { prefix: '/api/lead-notes' });
  app.register(leadsModule,                { prefix: '/api/leads' });
  app.register(orgsModule,                 { prefix: '/api/orgs' });
  app.register(phoneNumbersModule,         { prefix: '/api/phone-numbers' });
  app.register(recordingsModule,           { prefix: '/api/recordings' });
  app.register(tenantAiSettingsModule,     { prefix: '/api/tenant-ai-settings' });
  app.register(trunksModule,               { prefix: '/api/trunks' });
  app.register(usersModule,                { prefix: '/api/users' });

  // ── Legacy composite modules (backward compat) ───────────────────────────
  await app.register(agentsModule,         { prefix: '/agents' });
  await app.register(telephonyModule,      { prefix: '/telephony' });
  await app.register(aiModule,             { prefix: '/ai' });
  await app.register(automationsModule,    { prefix: '/automations' });
  await app.register(dialerModule,         { prefix: '/dialer' });

  return app;
}

buildServer()
  .then(async (app) => {
    startBackgroundWorkers();
    startAriEventService();
    await app.listen({ port: config.port, host: '0.0.0.0' });
  })
  .catch((error) => {
    logger.error({ error }, 'Failed to boot AEON backend');
    process.exit(1);
  });
