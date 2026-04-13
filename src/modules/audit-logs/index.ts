import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../core/supabase';

export const auditLogsModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req: any, reply) => {
    const orgId = req.orgId as string;
    if (!orgId) return reply.status(401).send({ error: 'Missing org context' });
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('org_id', orgId);
    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });
};
