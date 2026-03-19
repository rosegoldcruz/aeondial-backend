import { config } from './config';
import { logger } from './logger';
import WebSocket from 'ws';
import {
  finalizeBridgeAfterBeep,
  findCallByBridgeId,
  findCallByChannelId,
  findCallByPlaybackId,
  handleAgentAlertAnswered,
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
      if (event.channel?.state === 'Up' && event.channel.id) {
        await handleLeadChannelAnswered(event.channel.id).catch(() => undefined);
        await handleAgentAlertAnswered(event.channel.id).catch(() => undefined);
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
      if (event.playback?.id) {
        await finalizeBridgeAfterBeep(event.playback.id).catch((error) => {
          logger.error({ error, playback_id: event.playback?.id }, 'Failed finalizing bridge after beep');
        });
      }
      return;
    }

    case 'ChannelHangupRequest':
    case 'ChannelDestroyed': {
      await recordChannelEvent(event, `ari.${event.type === 'ChannelDestroyed' ? 'channel_destroyed' : 'hangup_request'}`);
      if (event.channel?.id) {
        await handleCallChannelHangup(event.channel.id, event.cause_txt || event.type || 'hangup').catch((error) => {
          logger.error({ error, channel_id: event.channel?.id }, 'Failed handling channel hangup');
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
