import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../core/supabase';

export const agentStateHistoryModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const orgId = (req as any).orgId as string;
    const { data, error } = await supabase
      .from('agent_state_history')
      .select('*')
      .eq('org_id', orgId)
      .order('occurred_at', { ascending: false });
    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });
};
