import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../core/supabase';

export const callsModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const orgId = (req as any).orgId as string;
    const { data, error } = await supabase
      .from('calls')
      .select('*')
      .eq('org_id', orgId)
      .order('started_at', { ascending: false });
    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });
};
