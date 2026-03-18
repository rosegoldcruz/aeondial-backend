import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../core/supabase';

export const campaignsModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req, reply) => {
    const { org_id, status } = req.query as {
      org_id?: string;
      status?: string;
    };

    if (!req.org_id) {
      return reply.status(401).send({ error: 'Missing org scope' });
    }

    const scopedOrgId = org_id || req.org_id;

    if (scopedOrgId !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    let query = supabase.from('campaigns').select('*').eq('org_id', req.org_id);
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send(data || []);
  });
};
