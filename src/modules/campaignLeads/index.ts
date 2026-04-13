import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../core/supabase';

export const campaignLeadsModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const orgId = (req as any).orgId as string;
    const { data, error } = await supabase
      .from('campaign_leads')
      .select('*')
      .eq('org_id', orgId);
    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });
};
