import { FastifyPluginAsync } from 'fastify';

export const leadsModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => ({
    module: 'leads',
    org_id: req.org_id,
    user_id: req.user_id,
    role: req.role,
  }));
};
