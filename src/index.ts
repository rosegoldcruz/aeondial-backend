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

// ── Phase 1 resource modules (original 21) ───────────────────────────────────
import { agentSessionsModule }        from './modules/agentSessions';
import { agentStateHistoryModule }    from './modules/agentStateHistory';
import { aiEventsModule }             from './modules/aiEvents';
import { aiSettingsModule }           from './modules/aiSettings';
import { callEventsModule }           from './modules/callEvents';
import { callsModule }                from './modules/calls';
import { campaignAiSettingsModule }   from './modules/campaignAiSettings';
import { campaignLeadsModule }        from './modules/campaignLeads';
import { campaignsModule }            from './modules/campaigns';
import { contactsModule }             from './modules/contacts';
import { dialerCallAttemptsModule }   from './modules/dialerCallAttempts';
import { dispositionsModule }         from './modules/dispositions';
import { leadDispositionEventsModule } from './modules/leadDispositionEvents';
import { leadNotesModule }            from './modules/leadNotes';
import { leadsModule }                from './modules/leads';
import { orgsModule }                 from './modules/orgs';
import { phoneNumbersModule }         from './modules/phoneNumbers';
import { recordingsModule }           from './modules/recordings';
import { tenantAiSettingsModule }     from './modules/tenantAiSettings';
import { trunksModule }               from './modules/trunks';
import { usersModule }                from './modules/users';

// ── Phase 2 resource modules (21 new tables) ─────────────────────────────────
import { orgProfilesModule }              from './modules/org-profiles';
import { billingInfoModule }              from './modules/billing-info';
import { paymentMethodsModule }           from './modules/payment-methods';
import { subscriptionsModule }            from './modules/subscriptions';
import { leadTagsModule }                 from './modules/lead-tags';
import { opportunitiesModule }            from './modules/opportunities';
import { pipelinesModule }                from './modules/pipelines';
import { pipelineStagesModule }           from './modules/pipeline-stages';
import { appointmentsModule }             from './modules/appointments';
import { workflowsModule }                from './modules/workflows';
import { workflowTriggersModule }         from './modules/workflow-triggers';
import { workflowActionsModule }          from './modules/workflow-actions';
import { workflowExecutionsModule }       from './modules/workflow-executions';
import { leadListsModule }                from './modules/lead-lists';
import { leadListMembersModule }          from './modules/lead-list-members';
import { tagsModule }                     from './modules/tags';
import { notificationPreferencesModule }  from './modules/notification-preferences';
import { notificationsModule }            from './modules/notifications';
import { integrationsModule }             from './modules/integrations';
import { auditLogsModule }                from './modules/audit-logs';
import { dncNumbersModule }               from './modules/dnc-numbers';

// ── Legacy composite modules (backward compat) ───────────────────────────────
import { agentsModule }       from './modules/agents';
import { telephonyModule }    from './modules/telephony';
import { aiModule }           from './modules/ai';
import { automationsModule }  from './modules/automations';
import { dialerModule }       from './modules/dialer';

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

  // ── Phase 1 routes ───────────────────────────────────────────────────────
  app.register(agentSessionsModule,         { prefix: '/api/agent-sessions' });
  app.register(agentStateHistoryModule,     { prefix: '/api/agent-state-history' });
  app.register(aiEventsModule,              { prefix: '/api/ai-events' });
  app.register(aiSettingsModule,            { prefix: '/api/ai-settings' });
  app.register(callEventsModule,            { prefix: '/api/call-events' });
  app.register(callsModule,                 { prefix: '/api/calls' });
  app.register(campaignAiSettingsModule,    { prefix: '/api/campaign-ai-settings' });
  app.register(campaignLeadsModule,         { prefix: '/api/campaign-leads' });
  app.register(campaignsModule,             { prefix: '/api/campaigns' });
  app.register(contactsModule,              { prefix: '/api/contacts' });
  app.register(dialerCallAttemptsModule,    { prefix: '/api/dialer-call-attempts' });
  app.register(dispositionsModule,          { prefix: '/api/dispositions' });
  app.register(leadDispositionEventsModule, { prefix: '/api/lead-disposition-events' });
  app.register(leadNotesModule,             { prefix: '/api/lead-notes' });
  app.register(leadsModule,                 { prefix: '/api/leads' });
  app.register(orgsModule,                  { prefix: '/api/orgs' });
  app.register(phoneNumbersModule,          { prefix: '/api/phone-numbers' });
  app.register(recordingsModule,            { prefix: '/api/recordings' });
  app.register(tenantAiSettingsModule,      { prefix: '/api/tenant-ai-settings' });
  app.register(trunksModule,                { prefix: '/api/trunks' });
  app.register(usersModule,                 { prefix: '/api/users' });

  // ── Phase 2 routes ───────────────────────────────────────────────────────
  app.register(orgProfilesModule,             { prefix: '/api/org-profiles' });
  app.register(billingInfoModule,             { prefix: '/api/billing-info' });
  app.register(paymentMethodsModule,          { prefix: '/api/payment-methods' });
  app.register(subscriptionsModule,           { prefix: '/api/subscriptions' });
  app.register(leadTagsModule,                { prefix: '/api/lead-tags' });
  app.register(opportunitiesModule,           { prefix: '/api/opportunities' });
  app.register(pipelinesModule,               { prefix: '/api/pipelines' });
  app.register(pipelineStagesModule,          { prefix: '/api/pipeline-stages' });
  app.register(appointmentsModule,            { prefix: '/api/appointments' });
  app.register(workflowsModule,               { prefix: '/api/workflows' });
  app.register(workflowTriggersModule,        { prefix: '/api/workflow-triggers' });
  app.register(workflowActionsModule,         { prefix: '/api/workflow-actions' });
  app.register(workflowExecutionsModule,      { prefix: '/api/workflow-executions' });
  app.register(leadListsModule,               { prefix: '/api/lead-lists' });
  app.register(leadListMembersModule,         { prefix: '/api/lead-list-members' });
  app.register(tagsModule,                    { prefix: '/api/tags' });
  app.register(notificationPreferencesModule, { prefix: '/api/notification-preferences' });
  app.register(notificationsModule,           { prefix: '/api/notifications' });
  app.register(integrationsModule,            { prefix: '/api/integrations' });
  app.register(auditLogsModule,               { prefix: '/api/audit-logs' });
  app.register(dncNumbersModule,              { prefix: '/api/dnc-numbers' });

  // ── Legacy composite modules (backward compat) ───────────────────────────
  await app.register(agentsModule,      { prefix: '/agents' });
  await app.register(telephonyModule,   { prefix: '/telephony' });
  await app.register(aiModule,          { prefix: '/ai' });
  await app.register(automationsModule, { prefix: '/automations' });
  await app.register(dialerModule,      { prefix: '/dialer' });

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
