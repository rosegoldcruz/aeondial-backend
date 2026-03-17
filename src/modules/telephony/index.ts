import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../core/supabase';

interface CallScopedPayload {
  org_id?: string;
  agent_id?: string;
  campaign_id?: string;
  contact_id?: string;
}

function validateRequiredCallScope(payload: CallScopedPayload): string | null {
  if (!payload.org_id) return 'org_id is required';
  if (!payload.agent_id) return 'agent_id is required';
  if (!payload.campaign_id) return 'campaign_id is required';
  if (!payload.contact_id) return 'contact_id is required';
  return null;
}

export const telephonyModule: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => ({
    module: 'telephony',
    org_id: req.org_id,
    user_id: req.user_id,
    role: req.role,
  }));

  app.get('/calls', async (req, reply) => {
    const { org_id, campaign_id, status, limit } = req.query as {
      org_id?: string;
      campaign_id?: string;
      status?: string;
      limit?: string;
    };

    if (!req.org_id) {
      return reply.status(401).send({ error: 'Missing org scope' });
    }

    if (!org_id) {
      return reply.status(400).send({ error: 'org_id is required' });
    }

    if (org_id !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    let query = supabase.from('calls').select('*').eq('org_id', req.org_id);
    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const parsedLimit = Number.parseInt(limit || '100', 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 500)
      : 100;

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send(data || []);
  });

  app.post('/calls/originate', async (req, reply) => {
    const body = (req.body || {}) as CallScopedPayload & {
      call_id?: string;
      direction?: 'inbound' | 'outbound';
      metadata?: Record<string, unknown>;
    };

    const validationError = validateRequiredCallScope(body);
    if (validationError) {
      return reply.status(400).send({ error: validationError });
    }

    if (!req.org_id || body.org_id !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const call_id = body.call_id || crypto.randomUUID();

    const { data, error } = await supabase
      .from('calls')
      .insert({
        call_id,
        org_id: body.org_id,
        campaign_id: body.campaign_id,
        contact_id: body.contact_id,
        direction: body.direction || 'outbound',
        status: 'originated',
        metadata: {
          ...(body.metadata || {}),
          agent_id: body.agent_id,
        },
        created_by: req.user_id,
        updated_by: req.user_id,
      })
      .select('*')
      .single();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ success: true, call: data });
  });

  app.post('/calls/bridge', async (req, reply) => {
    const body = (req.body || {}) as CallScopedPayload & {
      call_id?: string;
      bridge_to_call_id?: string;
    };

    const validationError = validateRequiredCallScope(body);
    if (validationError) {
      return reply.status(400).send({ error: validationError });
    }

    if (!body.call_id) {
      return reply.status(400).send({ error: 'call_id is required' });
    }

    if (!req.org_id || body.org_id !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('calls')
      .select('metadata')
      .eq('call_id', body.call_id)
      .eq('org_id', body.org_id)
      .maybeSingle();

    if (fetchError) {
      return reply.status(500).send({ error: fetchError.message });
    }

    if (!existing) {
      return reply.status(404).send({ error: 'Call not found' });
    }

    const mergedMetadata = {
      ...(existing.metadata || {}),
      agent_id: body.agent_id,
      bridge_to_call_id: body.bridge_to_call_id || null,
    };

    const { data, error } = await supabase
      .from('calls')
      .update({
        status: 'bridged',
        campaign_id: body.campaign_id,
        contact_id: body.contact_id,
        metadata: mergedMetadata,
        updated_by: req.user_id,
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', body.call_id)
      .eq('org_id', body.org_id)
      .select('*')
      .maybeSingle();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ success: true, call: data });
  });

  app.post('/calls/transfer', async (req, reply) => {
    const body = (req.body || {}) as CallScopedPayload & {
      call_id?: string;
      transfer_target?: string;
    };

    const validationError = validateRequiredCallScope(body);
    if (validationError) {
      return reply.status(400).send({ error: validationError });
    }

    if (!body.call_id) {
      return reply.status(400).send({ error: 'call_id is required' });
    }

    if (!req.org_id || body.org_id !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('calls')
      .select('metadata')
      .eq('call_id', body.call_id)
      .eq('org_id', body.org_id)
      .maybeSingle();

    if (fetchError) {
      return reply.status(500).send({ error: fetchError.message });
    }

    if (!existing) {
      return reply.status(404).send({ error: 'Call not found' });
    }

    const mergedMetadata = {
      ...(existing.metadata || {}),
      agent_id: body.agent_id,
      transfer_target: body.transfer_target || null,
    };

    const { data, error } = await supabase
      .from('calls')
      .update({
        status: 'transferred',
        campaign_id: body.campaign_id,
        contact_id: body.contact_id,
        metadata: mergedMetadata,
        updated_by: req.user_id,
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', body.call_id)
      .eq('org_id', body.org_id)
      .select('*')
      .maybeSingle();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ success: true, call: data });
  });

  app.post('/calls/disposition', async (req, reply) => {
    const body = (req.body || {}) as CallScopedPayload & {
      call_id?: string;
      disposition?: string;
      notes?: string;
    };

    const validationError = validateRequiredCallScope(body);
    if (validationError) {
      return reply.status(400).send({ error: validationError });
    }

    if (!body.call_id) {
      return reply.status(400).send({ error: 'call_id is required' });
    }

    if (!req.org_id || body.org_id !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('calls')
      .select('metadata')
      .eq('call_id', body.call_id)
      .eq('org_id', body.org_id)
      .maybeSingle();

    if (fetchError) {
      return reply.status(500).send({ error: fetchError.message });
    }

    if (!existing) {
      return reply.status(404).send({ error: 'Call not found' });
    }

    const mergedMetadata = {
      ...(existing.metadata || {}),
      agent_id: body.agent_id,
      disposition: body.disposition || null,
      notes: body.notes || null,
    };

    const { data, error } = await supabase
      .from('calls')
      .update({
        status: 'completed',
        campaign_id: body.campaign_id,
        contact_id: body.contact_id,
        metadata: mergedMetadata,
        updated_by: req.user_id,
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', body.call_id)
      .eq('org_id', body.org_id)
      .select('*')
      .maybeSingle();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ success: true, call: data });
  });
};
