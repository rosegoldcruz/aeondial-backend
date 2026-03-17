import { FastifyPluginAsync } from 'fastify';

export const automationsModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => ({
    module: 'automations',
    org_id: req.org_id,
    user_id: req.user_id,
    role: req.role,
  }));
};
