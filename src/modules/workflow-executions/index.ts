import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../core/supabase';

export const workflowExecutionsModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req: any, reply) => {
    const orgId = req.org_id as string;
    if (!orgId) return reply.status(401).send({ error: 'Missing org context' });
    const { data, error } = await supabase
      .from('workflow_executions')
      .select('*')
      .eq('org_id', orgId);
    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });

  app.post('/', async (req: any, reply) => {
    const orgId = req.org_id as string;
    if (!orgId) return reply.status(401).send({ error: 'Missing org context' });
    const body = { ...(req.body as object), org_id: orgId };
    const { data, error } = await supabase
      .from('workflow_executions')
      .insert(body)
      .select()
      .single();
    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(201).send(data);
  });

  app.patch('/:id', async (req: any, reply) => {
    const orgId = req.org_id as string;
    if (!orgId) return reply.status(401).send({ error: 'Missing org context' });
    const { id } = req.params as { id: string };
    const { data, error } = await supabase
      .from('workflow_executions')
      .update(req.body as object)
      .eq('execution_id', id)
      .eq('org_id', orgId)
      .select()
      .single();
    if (error) return reply.status(500).send({ error: error.message });
    if (!data) return reply.status(404).send({ error: 'Not found' });
    return data;
  });

  app.delete('/:id', async (req: any, reply) => {
    const orgId = req.org_id as string;
    if (!orgId) return reply.status(401).send({ error: 'Missing org context' });
    const { id } = req.params as { id: string };
    const { error } = await supabase
      .from('workflow_executions')
      .delete()
      .eq('execution_id', id)
      .eq('org_id', orgId);
    if (error) return reply.status(500).send({ error: error.message });
    return reply.status(204).send();
  });
};
