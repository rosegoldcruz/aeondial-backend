import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../../core/supabase';
import { ARI, AriRequestError } from '../../core/ari';
import { config } from '../../core/config';
import { emitOrgEvent } from '../../core/websocket';

interface CallScopedPayload {
  org_id?: string;
  agent_id?: string;
  campaign_id?: string;
  contact_id?: string;
  phone_number_id?: string;
}

interface CallRow {
  call_id: string;
  org_id: string;
  campaign_id: string | null;
  contact_id: string | null;
  phone_number_id: string | null;
  direction: 'inbound' | 'outbound';
  status: string;
  started_at: string | null;
  ended_at: string | null;
  metadata: Record<string, unknown> | null;
}

function validateRequiredCallScope(payload: CallScopedPayload): string | null {
  if (!payload.org_id) return 'org_id is required';
  if (!payload.agent_id) return 'agent_id is required';
  return null;
}

function requireRouteFields(
  payload: CallScopedPayload,
  fields: Array<'campaign_id' | 'contact_id'>,
): string | null {
  for (const field of fields) {
    if (!payload[field]) {
      return `${field} is required`;
    }
  }
  return null;
}

function actorId(req: FastifyRequest, payload: CallScopedPayload): string {
  return req.user_id || payload.agent_id || 'system';
}

function getAriChannelId(call: CallRow): string {
  const metadata = call.metadata || {};
  const value = metadata.ari_channel_id || metadata.channel_id;
  return typeof value === 'string' && value ? value : call.call_id;
}

function normalizeDialEndpoint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Dial endpoint is empty');
  }

  if (trimmed.includes('/')) {
    return trimmed;
  }

  return `${config.ariEndpointPrefix}/${trimmed}`;
}

function calculateDurationSeconds(startedAt: string | null, endedAtIso: string): number | null {
  if (!startedAt) {
    return null;
  }

  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAtIso);
  if (Number.isNaN(startedMs) || Number.isNaN(endedMs)) {
    return null;
  }

  return Math.max(0, Math.round((endedMs - startedMs) / 1000));
}

function emitCallEvent(call: CallRow, action: string, extraPayload?: Record<string, unknown>) {
  emitOrgEvent({
    type: 'call.event',
    org_id: call.org_id,
    campaign_id: call.campaign_id || undefined,
    payload: {
      action,
      call_id: call.call_id,
      status: call.status,
      direction: call.direction,
      contact_id: call.contact_id,
      phone_number_id: call.phone_number_id,
      metadata: call.metadata || {},
      ...extraPayload,
    },
  });
}

async function ensureScopedResource(
  table: 'campaigns' | 'contacts' | 'phone_numbers',
  idField: 'campaign_id' | 'contact_id' | 'phone_number_id',
  id: string | undefined,
  org_id: string,
  label: string,
  reply: FastifyReply,
): Promise<boolean> {
  if (!id) {
    return true;
  }

  const { data, error } = await supabase
    .from(table)
    .select(idField)
    .eq(idField, id)
    .eq('org_id', org_id)
    .maybeSingle();

  if (error) {
    reply.status(500).send({ error: error.message });
    return false;
  }

  if (!data) {
    reply.status(404).send({ error: `${label} not found` });
    return false;
  }

  return true;
}

async function getCallById(call_id: string, org_id: string, reply: FastifyReply): Promise<CallRow | null> {
  const { data, error } = await supabase
    .from('calls')
    .select('call_id, org_id, campaign_id, contact_id, phone_number_id, direction, status, started_at, ended_at, metadata')
    .eq('call_id', call_id)
    .eq('org_id', org_id)
    .maybeSingle();

  if (error) {
    reply.status(500).send({ error: error.message });
    return null;
  }

  if (!data) {
    reply.status(404).send({ error: 'Call not found' });
    return null;
  }

  return data as CallRow;
}

async function updateCallRow(
  call_id: string,
  org_id: string,
  updates: Record<string, unknown>,
  reply: FastifyReply,
): Promise<CallRow | null> {
  const { data, error } = await supabase
    .from('calls')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('call_id', call_id)
    .eq('org_id', org_id)
    .select('call_id, org_id, campaign_id, contact_id, phone_number_id, direction, status, started_at, ended_at, metadata')
    .single();

  if (error) {
    reply.status(500).send({ error: error.message });
    return null;
  }

  return data as CallRow;
}

async function resolveOriginateEndpoint(body: {
  endpoint?: string;
  contact_id?: string;
  org_id: string;
}, reply: FastifyReply): Promise<string | null> {
  if (body.endpoint) {
    return normalizeDialEndpoint(body.endpoint);
  }

  if (!body.contact_id) {
    reply.status(400).send({ error: 'endpoint or contact_id is required' });
    return null;
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('phone')
    .eq('contact_id', body.contact_id)
    .eq('org_id', body.org_id)
    .maybeSingle();

  if (error) {
    reply.status(500).send({ error: error.message });
    return null;
  }

  if (!data?.phone) {
    reply.status(404).send({ error: 'Contact phone not found' });
    return null;
  }

  return normalizeDialEndpoint(data.phone);
}

function getAriErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof AriRequestError) {
    return {
      message: error.message,
      status: error.status,
      response: error.responseText,
    };
  }

  return {
    message: error instanceof Error ? error.message : 'Unknown telephony error',
  };
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

  app.get('/calls/:call_id', async (req, reply) => {
    const { call_id } = req.params as { call_id: string };

    if (!req.org_id) {
      return reply.status(401).send({ error: 'Missing org scope' });
    }

    const call = await getCallById(call_id, req.org_id, reply);
    if (!call) {
      return;
    }

    return reply.send(call);
  });

  app.post('/calls/originate', async (req, reply) => {
    const body = (req.body || {}) as CallScopedPayload & {
      call_id?: string;
      direction?: 'inbound' | 'outbound';
      metadata?: Record<string, unknown>;
      endpoint?: string;
      caller_id?: string;
      timeout?: number;
      variables?: Record<string, string>;
    };

    const validationError = validateRequiredCallScope(body);
    if (validationError) {
      return reply.status(400).send({ error: validationError });
    }

    const routeValidationError = requireRouteFields(body, ['campaign_id', 'contact_id']);
    if (routeValidationError) {
      return reply.status(400).send({ error: routeValidationError });
    }

    if (!req.org_id || body.org_id !== req.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    if (!(await ensureScopedResource('campaigns', 'campaign_id', body.campaign_id, body.org_id, 'Campaign', reply))) {
      return;
    }
    if (!(await ensureScopedResource('contacts', 'contact_id', body.contact_id, body.org_id, 'Contact', reply))) {
      return;
    }
    if (!(await ensureScopedResource('phone_numbers', 'phone_number_id', body.phone_number_id, body.org_id, 'Phone number', reply))) {
      return;
    }

    const call_id = body.call_id || crypto.randomUUID();
    const initiatedBy = actorId(req, body);
    const endpoint = await resolveOriginateEndpoint({
      endpoint: body.endpoint,
      contact_id: body.contact_id,
      org_id: body.org_id,
    }, reply);

    if (!endpoint) {
      return;
    }

    const { data: insertedCall, error } = await supabase
      .from('calls')
      .insert({
        call_id,
        org_id: body.org_id,
        campaign_id: body.campaign_id,
        contact_id: body.contact_id,
        phone_number_id: body.phone_number_id || null,
        direction: body.direction || 'outbound',
        status: 'queued',
        started_at: new Date().toISOString(),
        metadata: {
          ...(body.metadata || {}),
          agent_id: body.agent_id,
          endpoint,
        },
        created_by: initiatedBy,
        updated_by: initiatedBy,
      })
      .select('call_id, org_id, campaign_id, contact_id, phone_number_id, direction, status, started_at, ended_at, metadata')
      .single();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    let queuedCall = insertedCall as CallRow;

    try {
      const ariChannel = await ARI.channels.originate({
        endpoint,
        callerId: body.caller_id,
        timeout: body.timeout,
        channelId: call_id,
        variables: body.variables,
      });

      const updatedCall = await updateCallRow(
        call_id,
        body.org_id,
        {
          status: 'originated',
          metadata: {
            ...(queuedCall.metadata || {}),
            agent_id: body.agent_id,
            endpoint,
            ari_channel_id:
              ariChannel && typeof ariChannel === 'object' && 'id' in ariChannel && typeof ariChannel.id === 'string'
                ? ariChannel.id
                : call_id,
          },
          updated_by: initiatedBy,
        },
        reply,
      );

      if (!updatedCall) {
        return;
      }

      emitCallEvent(updatedCall, 'originated', { endpoint });
      return reply.send({ success: true, call: updatedCall, ari: ariChannel });
    } catch (error) {
      const failedCall = await updateCallRow(
        call_id,
        body.org_id,
        {
          status: 'failed',
          metadata: {
            ...(queuedCall.metadata || {}),
            agent_id: body.agent_id,
            endpoint,
            ari_error: getAriErrorPayload(error),
          },
          updated_by: initiatedBy,
        },
        reply,
      );

      if (failedCall) {
        emitCallEvent(failedCall, 'originate.failed', { endpoint, error: getAriErrorPayload(error) });
      }

      return reply.status(502).send({ error: getAriErrorPayload(error) });
    }
  });

  app.post('/calls/bridge', async (req, reply) => {
    const body = (req.body || {}) as CallScopedPayload & {
      call_id?: string;
      bridge_to_call_id?: string;
      bridge_id?: string;
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

    const existing = await getCallById(body.call_id, body.org_id, reply);
    if (!existing) {
      return;
    }

    const targetCall = body.bridge_to_call_id
      ? await getCallById(body.bridge_to_call_id, body.org_id, reply)
      : null;
    if (body.bridge_to_call_id && !targetCall) {
      return;
    }

    const sourceChannelId = getAriChannelId(existing);
    const targetChannelId = targetCall ? getAriChannelId(targetCall) : null;
    if (!targetChannelId) {
      return reply.status(400).send({ error: 'bridge_to_call_id is required' });
    }

    const bridgeId = body.bridge_id || crypto.randomUUID();
    const initiatedBy = actorId(req, body);

    try {
      try {
        await ARI.bridges.addChannel(bridgeId, [sourceChannelId, targetChannelId]);
      } catch (error) {
        if (error instanceof AriRequestError && error.status === 404) {
          await ARI.bridges.create(bridgeId);
          await ARI.bridges.addChannel(bridgeId, [sourceChannelId, targetChannelId]);
        } else {
          throw error;
        }
      }

      const mergedMetadata = {
        ...(existing.metadata || {}),
        agent_id: body.agent_id,
        bridge_to_call_id: body.bridge_to_call_id,
        ari_bridge_id: bridgeId,
      };

      const updatedCall = await updateCallRow(
        body.call_id,
        body.org_id,
        {
          status: 'bridged',
          campaign_id: body.campaign_id || existing.campaign_id,
          contact_id: body.contact_id || existing.contact_id,
          metadata: mergedMetadata,
          updated_by: initiatedBy,
        },
        reply,
      );

      if (!updatedCall) {
        return;
      }

      if (targetCall) {
        await updateCallRow(
          targetCall.call_id,
          body.org_id,
          {
            status: 'bridged',
            metadata: {
              ...(targetCall.metadata || {}),
              agent_id: body.agent_id,
              bridge_to_call_id: body.call_id,
              ari_bridge_id: bridgeId,
            },
            updated_by: initiatedBy,
          },
          reply,
        );
      }

      emitCallEvent(updatedCall, 'bridged', {
        bridge_id: bridgeId,
        bridge_to_call_id: body.bridge_to_call_id,
      });
      return reply.send({ success: true, call: updatedCall, bridge_id: bridgeId });
    } catch (error) {
      emitCallEvent(existing, 'bridge.failed', {
        bridge_id: bridgeId,
        bridge_to_call_id: body.bridge_to_call_id,
        error: getAriErrorPayload(error),
      });
      return reply.status(502).send({ error: getAriErrorPayload(error) });
    }
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

    const existing = await getCallById(body.call_id, body.org_id, reply);
    if (!existing) {
      return;
    }

    if (!body.transfer_target) {
      return reply.status(400).send({ error: 'transfer_target is required' });
    }

    const transferEndpoint = normalizeDialEndpoint(body.transfer_target);
    const initiatedBy = actorId(req, body);

    try {
      await ARI.channels.redirect(getAriChannelId(existing), transferEndpoint);

      const updatedCall = await updateCallRow(
        body.call_id,
        body.org_id,
        {
          status: 'transferred',
          campaign_id: body.campaign_id || existing.campaign_id,
          contact_id: body.contact_id || existing.contact_id,
          metadata: {
            ...(existing.metadata || {}),
            agent_id: body.agent_id,
            transfer_target: transferEndpoint,
          },
          updated_by: initiatedBy,
        },
        reply,
      );

      if (!updatedCall) {
        return;
      }

      emitCallEvent(updatedCall, 'transferred', {
        transfer_target: transferEndpoint,
      });
      return reply.send({ success: true, call: updatedCall });
    } catch (error) {
      emitCallEvent(existing, 'transfer.failed', {
        transfer_target: transferEndpoint,
        error: getAriErrorPayload(error),
      });
      return reply.status(502).send({ error: getAriErrorPayload(error) });
    }
  });

  app.post('/calls/end', async (req, reply) => {
    const body = (req.body || {}) as CallScopedPayload & {
      call_id?: string;
      reason?: string;
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

    const existing = await getCallById(body.call_id, body.org_id, reply);
    if (!existing) {
      return;
    }

    const initiatedBy = actorId(req, body);
    const endedAt = new Date().toISOString();

    try {
      await ARI.channels.hangup(getAriChannelId(existing));

      const updatedCall = await updateCallRow(
        body.call_id,
        body.org_id,
        {
          status: 'ended',
          ended_at: endedAt,
          duration_seconds: calculateDurationSeconds(existing.started_at, endedAt),
          metadata: {
            ...(existing.metadata || {}),
            agent_id: body.agent_id,
            end_reason: body.reason || null,
          },
          updated_by: initiatedBy,
        },
        reply,
      );

      if (!updatedCall) {
        return;
      }

      emitCallEvent(updatedCall, 'ended', { reason: body.reason || null });
      return reply.send({ success: true, call: updatedCall });
    } catch (error) {
      emitCallEvent(existing, 'end.failed', {
        reason: body.reason || null,
        error: getAriErrorPayload(error),
      });
      return reply.status(502).send({ error: getAriErrorPayload(error) });
    }
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

    const existing = await getCallById(body.call_id, body.org_id, reply);
    if (!existing) {
      return;
    }

    const mergedMetadata = {
      ...(existing.metadata || {}),
      agent_id: body.agent_id,
      disposition: body.disposition || null,
      notes: body.notes || null,
    };

    const updatedCall = await updateCallRow(
      body.call_id,
      body.org_id,
      {
        status: 'completed',
        campaign_id: body.campaign_id || existing.campaign_id,
        contact_id: body.contact_id || existing.contact_id,
        metadata: mergedMetadata,
        updated_by: actorId(req, body),
      },
      reply,
    );

    if (!updatedCall) {
      return;
    }

    emitCallEvent(updatedCall, 'dispositioned', {
      disposition: body.disposition || null,
    });

    return reply.send({ success: true, call: updatedCall });
  });
};
