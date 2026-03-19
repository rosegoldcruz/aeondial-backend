"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAriEventService = startAriEventService;
const config_1 = require("./config");
const logger_1 = require("./logger");
const ws_1 = __importDefault(require("ws"));
const orchestrator_1 = require("../modules/dialer/orchestrator");
const callState_1 = require("../modules/dialer/callState");
let socket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
function scheduleReconnect() {
    if (reconnectTimer)
        return;
    const delayMs = Math.min(30000, 1000 * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connectAriEventSocket();
    }, delayMs);
}
function buildEventsUrl() {
    const base = config_1.config.ariUrl.replace(/\/$/, '');
    const url = new URL(`${base}/events`);
    url.searchParams.set('app', config_1.config.ariApp);
    url.searchParams.set('subscribeAll', 'true');
    url.searchParams.set('api_key', `${config_1.config.ariUsername}:${config_1.config.ariPassword}`);
    return url.toString().replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}
async function recordChannelEvent(event, eventType) {
    const channelId = event.channel?.id;
    if (!channelId)
        return;
    const call = await (0, orchestrator_1.findCallByChannelId)(channelId);
    if (!call)
        return;
    await (0, callState_1.recordDialerCallEvent)(call, eventType, {
        channel_id: channelId,
        channel_state: event.channel?.state || null,
        channel_name: event.channel?.name || null,
        ari_event: event.type || null,
    });
}
async function recordPlaybackEvent(event, eventType) {
    const playbackId = event.playback?.id;
    if (!playbackId)
        return;
    const call = await (0, orchestrator_1.findCallByPlaybackId)(playbackId);
    if (!call)
        return;
    await (0, callState_1.recordDialerCallEvent)(call, eventType, {
        playback_id: playbackId,
        target_uri: event.playback?.target_uri || null,
        media_uri: event.playback?.media_uri || null,
        ari_event: event.type || null,
    });
}
async function recordBridgeEvent(event, eventType) {
    const bridgeId = event.bridge?.id;
    if (!bridgeId)
        return;
    const call = await (0, orchestrator_1.findCallByBridgeId)(bridgeId);
    if (!call)
        return;
    await (0, callState_1.recordDialerCallEvent)(call, eventType, {
        bridge_id: bridgeId,
        bridge_type: event.bridge?.bridge_type || null,
        ari_event: event.type || null,
    });
}
async function handleAriEvent(event) {
    switch (event.type) {
        case 'StasisStart': {
            await recordChannelEvent(event, 'ari.stasis_start');
            if (event.channel?.state === 'Up' && event.channel.id) {
                await (0, orchestrator_1.handleLeadChannelAnswered)(event.channel.id).catch(() => undefined);
                await (0, orchestrator_1.handleAgentAlertAnswered)(event.channel.id).catch(() => undefined);
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
                await (0, orchestrator_1.finalizeBridgeAfterBeep)(event.playback.id).catch((error) => {
                    logger_1.logger.error({ error, playback_id: event.playback?.id }, 'Failed finalizing bridge after beep');
                });
            }
            return;
        }
        case 'ChannelHangupRequest':
        case 'ChannelDestroyed': {
            await recordChannelEvent(event, `ari.${event.type === 'ChannelDestroyed' ? 'channel_destroyed' : 'hangup_request'}`);
            if (event.channel?.id) {
                await (0, orchestrator_1.handleCallChannelHangup)(event.channel.id, event.cause_txt || event.type || 'hangup').catch((error) => {
                    logger_1.logger.error({ error, channel_id: event.channel?.id }, 'Failed handling channel hangup');
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
async function connectAriEventSocket() {
    if (!config_1.config.ariUrl || !config_1.config.ariUsername || !config_1.config.ariPassword) {
        logger_1.logger.warn('ARI event service disabled: missing ARI configuration');
        return;
    }
    if (socket && socket.readyState === ws_1.default.OPEN) {
        return;
    }
    const url = buildEventsUrl();
    socket = new ws_1.default(url);
    socket.on('open', () => {
        reconnectAttempt = 0;
        logger_1.logger.info({ url, app: config_1.config.ariApp }, 'Connected to ARI event socket');
    });
    socket.on('message', (message) => {
        let event;
        try {
            event = JSON.parse(message.toString());
        }
        catch (error) {
            logger_1.logger.warn({ error }, 'Ignoring malformed ARI websocket message');
            return;
        }
        void handleAriEvent(event).catch((error) => {
            logger_1.logger.error({ error, event_type: event.type }, 'Unhandled ARI event processing error');
        });
    });
    socket.on('error', (error) => {
        logger_1.logger.error({ error }, 'ARI websocket error');
    });
    socket.on('close', () => {
        logger_1.logger.warn('ARI websocket closed; scheduling reconnect');
        scheduleReconnect();
    });
}
function startAriEventService() {
    void connectAriEventSocket();
}
