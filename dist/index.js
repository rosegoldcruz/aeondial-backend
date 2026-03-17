"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const config_1 = require("./core/config");
const logger_1 = require("./core/logger");
const auth_1 = require("./core/auth");
const websocket_2 = require("./core/websocket");
const orgs_1 = require("./modules/orgs");
const users_1 = require("./modules/users");
const agents_1 = require("./modules/agents");
const contacts_1 = require("./modules/contacts");
const leads_1 = require("./modules/leads");
const campaigns_1 = require("./modules/campaigns");
const telephony_1 = require("./modules/telephony");
const ai_1 = require("./modules/ai");
const automations_1 = require("./modules/automations");
async function buildServer() {
    (0, config_1.assertRequiredConfig)();
    const app = (0, fastify_1.default)({ logger: logger_1.logger });
    await app.register(cors_1.default, {
        origin: [config_1.config.crmOrigin, config_1.config.aiWorkerOrigin],
        credentials: true,
    });
    await app.register(helmet_1.default);
    await app.register(websocket_1.default);
    await app.register(auth_1.authPlugin);
    app.addHook('preHandler', auth_1.requireTenantContext);
    await app.register(websocket_2.websocketPlugin);
    app.get('/health', async () => ({ ok: true }));
    app.get('/version', async () => ({
        version: 'phase1-phase2-scaffold',
        timestamp: new Date().toISOString(),
    }));
    await app.register(orgs_1.orgsModule, { prefix: '/orgs' });
    await app.register(users_1.usersModule, { prefix: '/users' });
    await app.register(agents_1.agentsModule, { prefix: '/agents' });
    await app.register(contacts_1.contactsModule, { prefix: '/contacts' });
    await app.register(leads_1.leadsModule, { prefix: '/leads' });
    await app.register(campaigns_1.campaignsModule, { prefix: '/campaigns' });
    await app.register(telephony_1.telephonyModule, { prefix: '/telephony' });
    await app.register(ai_1.aiModule, { prefix: '/ai' });
    await app.register(automations_1.automationsModule, { prefix: '/automations' });
    return app;
}
buildServer()
    .then(async (app) => {
    await app.listen({ port: config_1.config.port, host: '0.0.0.0' });
})
    .catch((error) => {
    logger_1.logger.error({ error }, 'Failed to boot AEON backend');
    process.exit(1);
});
