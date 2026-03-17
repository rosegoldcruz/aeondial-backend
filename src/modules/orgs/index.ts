import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../core/supabase';

export const orgsModule: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, reply) => {
    const body = (req.body || {}) as {
      org_id?: string;
      name?: string;
      status?: string;
      metadata?: Record<string, unknown>;
    };

    const scopedOrgId = req.org_id;
    if (!scopedOrgId) {
      return reply.status(401).send({ error: 'Missing org scope' });
    }

    const orgId = body.org_id || scopedOrgId;
    if (orgId !== scopedOrgId) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    if (!body.name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const { data, error } = await supabase
      .from('orgs')
      .upsert(
        {
          org_id: orgId,
          name: body.name,
          status: body.status || 'active',
          metadata: body.metadata || {},
          created_by: req.user_id,
          updated_by: req.user_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id' },
      )
      .select('*')
      .single();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send(data);
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    if (!req.org_id || id !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const { data, error } = await supabase
      .from('orgs')
      .select('*')
      .eq('org_id', id)
      .maybeSingle();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    if (!data) {
      return reply.status(404).send({ error: 'Org not found' });
    }

    return reply.send(data);
  });

  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body || {}) as {
      name?: string;
      status?: string;
      metadata?: Record<string, unknown>;
    };

    if (!req.org_id || id !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const patch: Record<string, unknown> = {
      updated_by: req.user_id,
      updated_at: new Date().toISOString(),
    };

    if (typeof body.name !== 'undefined') patch.name = body.name;
    if (typeof body.status !== 'undefined') patch.status = body.status;
    if (typeof body.metadata !== 'undefined') patch.metadata = body.metadata;

    const { data, error } = await supabase
      .from('orgs')
      .update(patch)
      .eq('org_id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    if (!data) {
      return reply.status(404).send({ error: 'Org not found' });
    }

    return reply.send(data);
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    if (!req.org_id || id !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const { error } = await supabase.from('orgs').delete().eq('org_id', id);

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ success: true });
  });
};
