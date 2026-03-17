import { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../core/supabase';

export const aiModule: FastifyPluginAsync = async (app) => {
  app.get('/providers', async (req, reply) => {
    const { org_id, campaign_id } = req.query as {
      org_id?: string;
      campaign_id?: string;
    };

    if (!org_id) {
      return reply.status(400).send({ error: 'org_id is required' });
    }

    if (!req.org_id || req.org_id !== org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    let settingsRow: {
      llm_provider: string | null;
      tts_provider: string | null;
      stt_provider: string | null;
      voice_id: string | null;
      model_id: string | null;
    } | null = null;

    if (campaign_id) {
      const { data: campaignRow, error: campaignErr } = await supabase
        .from('ai_settings')
        .select('llm_provider, tts_provider, stt_provider, voice_id, model_id')
        .eq('org_id', org_id)
        .eq('campaign_id', campaign_id)
        .eq('is_active', true)
        .maybeSingle();

      if (campaignErr) {
        return reply.status(500).send({ error: campaignErr.message });
      }

      settingsRow = campaignRow;
    }

    if (!settingsRow) {
      const { data: orgRow, error: orgErr } = await supabase
        .from('ai_settings')
        .select('llm_provider, tts_provider, stt_provider, voice_id, model_id')
        .eq('org_id', org_id)
        .is('campaign_id', null)
        .eq('is_active', true)
        .maybeSingle();

      if (orgErr) {
        return reply.status(500).send({ error: orgErr.message });
      }

      settingsRow = orgRow;
    }

    return reply.send({
      org_id,
      campaign_id: campaign_id || null,
      llm_provider: settingsRow?.llm_provider || 'openai',
      tts_provider: settingsRow?.tts_provider || 'elevenlabs',
      stt_provider: settingsRow?.stt_provider || 'openai',
      voice_id: settingsRow?.voice_id || process.env.ELEVENLABS_VOICE_ID || 'default',
      model_id: settingsRow?.model_id || process.env.DEFAULT_MODEL_ID || 'gpt-4.1-mini',
    });
  });

  app.post('/events', async (req, reply) => {
    const body = (req.body || {}) as {
      org_id?: string;
      campaign_id?: string;
      call_id?: string;
      type?: string;
      payload?: Record<string, unknown>;
    };

    if (!body.org_id || !body.campaign_id || !body.type) {
      return reply
        .status(400)
        .send({ error: 'org_id, campaign_id, and type are required' });
    }

    if (!req.org_id || req.org_id !== body.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const { data, error } = await supabase
      .from('ai_events')
      .insert({
        ai_event_id: crypto.randomUUID(),
        org_id: body.org_id,
        campaign_id: body.campaign_id,
        call_id: body.call_id || null,
        event_type: body.type,
        payload: body.payload || {},
        created_by: req.user_id,
        updated_by: req.user_id,
      })
      .select('*')
      .single();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ success: true, event: data });
  });

  app.post('/summary', async (req, reply) => {
    const body = (req.body || {}) as {
      org_id?: string;
      campaign_id?: string;
      call_id?: string;
      summary?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.org_id || !body.campaign_id || !body.summary) {
      return reply
        .status(400)
        .send({ error: 'org_id, campaign_id, and summary are required' });
    }

    if (!req.org_id || req.org_id !== body.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const { data, error } = await supabase
      .from('ai_events')
      .insert({
        ai_event_id: crypto.randomUUID(),
        org_id: body.org_id,
        campaign_id: body.campaign_id,
        call_id: body.call_id || null,
        event_type: 'summary',
        payload: {
          summary: body.summary,
          ...(body.metadata || {}),
        },
        created_by: req.user_id,
        updated_by: req.user_id,
      })
      .select('*')
      .single();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ success: true, event: data });
  });

  app.post('/transcript', async (req, reply) => {
    const body = (req.body || {}) as {
      org_id?: string;
      campaign_id?: string;
      call_id?: string;
      transcript?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.org_id || !body.campaign_id || !body.transcript) {
      return reply
        .status(400)
        .send({ error: 'org_id, campaign_id, and transcript are required' });
    }

    if (!req.org_id || req.org_id !== body.org_id) {
      return reply.status(403).send({ error: 'Cross-tenant access denied' });
    }

    const { data, error } = await supabase
      .from('ai_events')
      .insert({
        ai_event_id: crypto.randomUUID(),
        org_id: body.org_id,
        campaign_id: body.campaign_id,
        call_id: body.call_id || null,
        event_type: 'transcript',
        payload: {
          transcript: body.transcript,
          ...(body.metadata || {}),
        },
        created_by: req.user_id,
        updated_by: req.user_id,
      })
      .select('*')
      .single();

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ success: true, event: data });
  });
};
