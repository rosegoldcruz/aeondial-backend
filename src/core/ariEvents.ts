import { config } from './config';
import { logger } from './logger';
import WebSocket from 'ws';
import {
  findCallByBridgeId,
  findCallByChannelId,
  findCallByPlaybackId,
  handleAgentLegAnswered,
  handleAgentLegHangup,
  handleCallChannelHangup,
  handleLeadChannelAnswered,
} from '../modules/dialer/orchestrator';
import { recordDialerCallEvent } from '../modules/dialer/callState';

type AriEvent = {
  type?: string;
  application?: string;
  args?: string[];
  channel?: {
    id: string;
    state?: string;
    name?: string;
  };
  bridge?: {
    id: string;
    bridge_type?: string;
  };
  playback?: {
    id: string;
    target_uri?: string;
    media_uri?: string;
  };
  cause_txt?: string;
};

let socket: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempt = 0;

function scheduleReconnect(): void {
  if (reconnectTimer) return;

  const delayMs = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectAriEventSocket();
  }, delayMs);
}

function buildEventsUrl(): string {
  const base = config.ariUrl.replace(/\/$/, '');
  const url = new URL(`${base}/events`);
  url.searchParams.set('app', config.ariApp);
  url.searchParams.set('subscribeAll', 'true');
  url.searchParams.set('api_key', `${config.ariUsername}:${config.ariPassword}`);
  return url.toString().replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

async function recordChannelEvent(event: AriEvent, eventType: string): Promise<void> {
  const channelId = event.channel?.id;
  if (!channelId) return;

  const call = await findCallByChannelId(channelId);
  if (!call) return;

  await recordDialerCallEvent(call, eventType, {
    channel_id: channelId,
    channel_state: event.channel?.state || null,
    channel_name: event.channel?.name || null,
    ari_event: event.type || null,
  });
}

async function recordPlaybackEvent(event: AriEvent, eventType: string): Promise<void> {
  const playbackId = event.playback?.id;
  if (!playbackId) return;

  const call = await findCallByPlaybackId(playbackId);
  if (!call) return;

  await recordDialerCallEvent(call, eventType, {
    playback_id: playbackId,
    target_uri: event.playback?.target_uri || null,
    media_uri: event.playback?.media_uri || null,
    ari_event: event.type || null,
  });
}

async function recordBridgeEvent(event: AriEvent, eventType: string): Promise<void> {
  const bridgeId = event.bridge?.id;
  if (!bridgeId) return;

  const call = await findCallByBridgeId(bridgeId);
  if (!call) return;

  await recordDialerCallEvent(call, eventType, {
    bridge_id: bridgeId,
    bridge_type: event.bridge?.bridge_type || null,
    ari_event: event.type || null,
  });
}

async function handleAriEvent(event: AriEvent): Promise<void> {
  switch (event.type) {
    case 'StasisStart': {
      await recordChannelEvent(event, 'ari.stasis_start');

      const channelId = event.channel?.id;
      if (!channelId) return;

      // Determine channel role from appArgs
      const args = event.args || [];
      const role = typeof args[0] === 'string' ? args[0] : '';

      if (role === 'agent-leg') {
        // Agent answered their SIP phone — args: [agent-leg, session_id, org_id]
        const sessionId = typeof args[1] === 'string' ? args[1] : '';
        const orgId = typeof args[2] === 'string' ? args[2] : '';
        if (sessionId && orgId) {
          await handleAgentLegAnswered(channelId, sessionId, orgId).catch((err) => {
            logger.error({ err, channel_id: channelId, session_id: sessionId }, 'Failed handling agent-leg StasisStart');
          });
        } else {
          logger.warn({ channel_id: channelId, args }, 'agent-leg StasisStart missing session_id/org_id in appArgs');
        }
        return;
      }

      if (role === 'lead-leg' || role === 'dialer') {
        // Lead answered — args: [lead-leg, call_id, org_id, bridge_id]
        if (event.channel?.state === 'Up') {
          await handleLeadChannelAnswered(channelId).catch((err) => {
            logger.error({ err, channel_id: channelId }, 'Failed handling lead-leg StasisStart');
          });
        }
        return;
      }

      // Unknown role — attempt both handlers (graceful fallback for unlabeled channels)
      if (event.channel?.state === 'Up') {
        await handleLeadChannelAnswered(channelId).catch(() => undefined);
      }
      return;
    }

    case 'ChannelStateChange': {
      await recordChannelEvent(event, 'ari.channel_state');
      return;
    }

    case 'ChannelEnteredBridge':
      await recordChannelEvent(event, 'ari.channel_entered_bridge');
      return;

    case 'ChannelLeftBridge':
      await recordChannelEvent(event, 'ari.channel_left_bridge');
      return;

    case 'PlaybackFinished': {
      await recordPlaybackEvent(event, 'ari.playback_finished');
      // Note: PlaybackFinished/beep bridge finalization removed in agent-first model
      // AMD alert beep is no longer used in progressive mode
      return;
    }

    case 'ChannelHangupRequest': {
      await recordChannelEvent(event, 'ari.hangup_request');
      if (event.channel?.id) {
        const channelId = event.channel.id;
        // Call-side hangup fires on HangupRequest to start wrap-up promptly.
        // Agent-leg cleanup is intentionally deferred to ChannelDestroyed — the
        // agent SIP channel is still physically alive when a HangupRequest fires
        // (BYE is in-flight). Clearing DB state here causes the UI to spin even
        // though the call is still connected.
        await handleCallChannelHangup(channelId, event.cause_txt || 'hangup_request').catch((err) => {
          logger.error({ err, channel_id: channelId }, 'Failed handling call channel hangup (HangupRequest)');
        });
      }
      return;
    }

    case 'ChannelDestroyed': {
      await recordChannelEvent(event, 'ari.channel_destroyed');
      if (event.channel?.id) {
        const channelId = event.channel.id;
        // Agent-leg cleanup: channel is definitively gone.
        await handleAgentLegHangup(channelId).catch((err) => {
          logger.error({ err, channel_id: channelId }, 'Failed handling agent-leg hangup (ChannelDestroyed)');
        });
        // Call-side cleanup: idempotent if already handled on HangupRequest.
        await handleCallChannelHangup(channelId, event.cause_txt || 'channel_destroyed').catch((err) => {
          logger.error({ err, channel_id: channelId }, 'Failed handling call channel hangup (ChannelDestroyed)');
        });
      }
      return;
    }

    case 'BridgeDestroyed':
      await recordBridgeEvent(event, 'ari.bridge_destroyed');
      return;

    default:
      return;
  }
}

async function connectAriEventSocket(): Promise<void> {
  if (!config.ariUrl || !config.ariUsername || !config.ariPassword) {
    logger.warn('ARI event service disabled: missing ARI configuration');
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  const url = buildEventsUrl();
  socket = new WebSocket(url);

  socket.on('open', () => {
    reconnectAttempt = 0;
    logger.info({ url, app: config.ariApp }, 'Connected to ARI event socket');
  });

  socket.on('message', (message) => {
    let event: AriEvent;
    try {
      event = JSON.parse(message.toString()) as AriEvent;
    } catch (error) {
      logger.warn({ error }, 'Ignoring malformed ARI websocket message');
      return;
    }

    void handleAriEvent(event).catch((error) => {
      logger.error({ error, event_type: event.type }, 'Unhandled ARI event processing error');
    });
  });

  socket.on('error', (error) => {
    logger.error({ error }, 'ARI websocket error');
  });

  socket.on('close', () => {
    logger.warn('ARI websocket closed; scheduling reconnect');
    scheduleReconnect();
  });
}

export function startAriEventService(): void {
  void connectAriEventSocket();
}
