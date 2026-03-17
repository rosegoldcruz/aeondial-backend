import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import { config, assertRequiredConfig } from './core/config';
import { logger } from './core/logger';
import { authPlugin, requireTenantContext } from './core/auth';
import { websocketPlugin } from './core/websocket';
import { orgsModule } from './modules/orgs';
import { usersModule } from './modules/users';
import { agentsModule } from './modules/agents';
import { contactsModule } from './modules/contacts';
import { leadsModule } from './modules/leads';
import { campaignsModule } from './modules/campaigns';
import { telephonyModule } from './modules/telephony';
import { aiModule } from './modules/ai';
import { automationsModule } from './modules/automations';

async function buildServer() {
  assertRequiredConfig();

  const app = Fastify({ logger });

  await app.register(cors, {
    origin: [config.crmOrigin, config.aiWorkerOrigin],
    credentials: true,
  });
  await app.register(helmet);
  await app.register(websocket);
  await app.register(authPlugin);

  app.addHook('preHandler', requireTenantContext);

  await app.register(websocketPlugin);

  app.get('/health', async () => ({ ok: true }));
  app.get('/version', async () => ({
    version: 'phase1-phase2-scaffold',
    timestamp: new Date().toISOString(),
  }));

  await app.register(orgsModule, { prefix: '/orgs' });
  await app.register(usersModule, { prefix: '/users' });
  await app.register(agentsModule, { prefix: '/agents' });
  await app.register(contactsModule, { prefix: '/contacts' });
  await app.register(leadsModule, { prefix: '/leads' });
  await app.register(campaignsModule, { prefix: '/campaigns' });
  await app.register(telephonyModule, { prefix: '/telephony' });
  await app.register(aiModule, { prefix: '/ai' });
  await app.register(automationsModule, { prefix: '/automations' });

  return app;
}

buildServer()
  .then(async (app) => {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  })
  .catch((error) => {
    logger.error({ error }, 'Failed to boot AEON backend');
    process.exit(1);
  });
