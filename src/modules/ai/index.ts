import { FastifyPluginAsync } from 'fastify';

export const aiModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => ({
    module: 'ai',
    org_id: req.org_id,
    user_id: req.user_id,
    role: req.role,
  }));
};
