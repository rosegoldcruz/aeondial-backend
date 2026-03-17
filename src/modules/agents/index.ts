import { FastifyPluginAsync } from 'fastify';

export const agentsModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => ({
    module: 'agents',
    org_id: req.org_id,
    user_id: req.user_id,
    role: req.role,
  }));
};
