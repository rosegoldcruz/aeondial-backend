import { FastifyPluginAsync } from 'fastify';

type PresenceState = {
  agent_id: string;
  status: 'online' | 'away' | 'busy' | 'offline';
};

export type WsEventType =
  | 'agent.presence'
  | 'agent.state'          // agent FSM transition: READY / INCALL / WRAP …
  | 'call.event'
  | 'call.amd_result'      // AMD detection result for a call
  | 'call.human_ready'     // human detected; agent alert leg/beep is in progress
  | 'call.bridged'         // agent + lead channels joined
  | 'call.wrap'            // call ended, wrap timer started
  | 'queue.metrics'
  | 'queue.lead_dialing'   // dialer picked a lead and is dialling it
  | 'queue.lead_answered'  // lead answered (post-AMD human)
  | 'queue.lead_abandoned' // lead was abandoned (no agent available)
  | 'ai.whisper'
  | 'supervisor.control'
  | 'campaign.paused'        // campaign was paused (manually or via auto-pause)
  | 'campaign.infra_blocked';// infrastructure failure blocked a call attempt

export type WsEnvelope = {
  type: WsEventType;
  org_id: string;
  campaign_id?: string;
  payload?: Record<string, unknown>;
};

const orgSockets = new Map<string, Set<any>>();
const orgPresence = new Map<string, Map<string, PresenceState>>();

function emitToOrg(org_id: string, event: WsEnvelope) {
  const sockets = orgSockets.get(org_id);
  if (!sockets) return;

  const message = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  }
}

export function emitOrgEvent(event: WsEnvelope): void {
  emitToOrg(event.org_id, event);
}

export const websocketPlugin: FastifyPluginAsync = async (app) => {
  app.get('/ws', { websocket: true }, (socket, req) => {
    const headerOrg = req.org_id || (req.headers['x-org-id'] as string | undefined);
    const query = req.query as { org_id?: string };
    const org_id = query.org_id || headerOrg;

    if (!org_id) {
      socket.send(JSON.stringify({ error: 'org_id is required' }));
      socket.close();
      return;
    }

    const sockets = orgSockets.get(org_id) || new Set<any>();
    sockets.add(socket);
    orgSockets.set(org_id, sockets);

    socket.send(
      JSON.stringify({
        type: 'ws.connected',
        org_id,
        payload: { active_clients: sockets.size },
      }),
    );

    socket.on('message', (raw: Buffer) => {
      let event: WsEnvelope;
      try {
        event = JSON.parse(raw.toString()) as WsEnvelope;
      } catch {
        socket.send(JSON.stringify({ error: 'Invalid JSON message' }));
        return;
      }

      if (!event.org_id) {
        socket.send(JSON.stringify({ error: 'All events must include org_id' }));
        return;
      }

      if (event.org_id !== org_id) {
        socket.send(JSON.stringify({ error: 'Cross-tenant websocket event denied' }));
        return;
      }

      switch (event.type) {
        case 'agent.presence': {
          const payload = event.payload || {};
          const agent_id = payload.agent_id as string | undefined;
          const status = payload.status as PresenceState['status'] | undefined;
          if (!agent_id || !status) {
            socket.send(JSON.stringify({ error: 'agent_id and status are required' }));
            return;
          }

          const presenceByOrg = orgPresence.get(org_id) || new Map<string, PresenceState>();
          presenceByOrg.set(agent_id, { agent_id, status });
          orgPresence.set(org_id, presenceByOrg);

          emitToOrg(org_id, {
            type: 'agent.presence',
            org_id,
            campaign_id: event.campaign_id,
            payload: {
              agent_id,
              status,
              total_agents: presenceByOrg.size,
            },
          });
          return;
        }

        case 'agent.state':
        case 'call.event':
        case 'call.amd_result':
        case 'call.human_ready':
        case 'call.bridged':
        case 'call.wrap':
        case 'queue.metrics':
        case 'queue.lead_dialing':
        case 'queue.lead_answered':
        case 'queue.lead_abandoned':
        case 'ai.whisper':
        case 'supervisor.control': {
          emitToOrg(org_id, {
            type: event.type,
            org_id,
            campaign_id: event.campaign_id,
            payload: event.payload || {},
          });
          return;
        }

        default:
          socket.send(JSON.stringify({ error: 'Unsupported event type' }));
      }
    });

    socket.on('close', () => {
      const current = orgSockets.get(org_id);
      if (!current) return;
      current.delete(socket);
      if (current.size === 0) {
        orgSockets.delete(org_id);
      }

      emitToOrg(org_id, {
        type: 'queue.metrics',
        org_id,
        payload: { active_clients: current.size },
      });
    });
  });
};
