import { config } from './config';
import { logger } from './logger';

type AriQueryValue = string | number | boolean | undefined;

interface AriRequestOptions {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  query?: Record<string, AriQueryValue>;
  body?: unknown;
  okStatuses?: number[];
}

export interface AriOriginateParams {
  endpoint: string;
  app?: string;
  appArgs?: string;
  callerId?: string;
  timeout?: number;
  channelId?: string;
  variables?: Record<string, string>;
  debugContext?: string;
}

export interface AriChannel {
  id: string;
  name?: string;
  state?: string;
}

export interface AriEndpoint {
  technology?: string;
  resource?: string;
  state?: string;
  channel_ids?: string[];
}

export class AriRequestError extends Error {
  status: number;
  responseText: string;

  constructor(message: string, status: number, responseText: string) {
    super(message);
    this.name = 'AriRequestError';
    this.status = status;
    this.responseText = responseText;
  }
}

function assertAriConfig(): void {
  if (!config.ariUrl || !config.ariUsername || !config.ariPassword || !config.ariApp) {
    throw new Error('ARI_URL, ARI_USERNAME, ARI_PASSWORD, and ARI_APP are required for telephony operations');
  }
}

function buildUrl(path: string, query?: Record<string, AriQueryValue>): string {
  const baseUrl = config.ariUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

async function ariRequest<T = Record<string, unknown>>({
  method,
  path,
  query,
  body,
  okStatuses = [200, 201, 204],
}: AriRequestOptions): Promise<T> {
  assertAriConfig();

  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.ariUsername}:${config.ariPassword}`).toString('base64')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!okStatuses.includes(response.status)) {
    const responseText = await response.text();
    throw new AriRequestError(
      `ARI request failed with status ${response.status}`,
      response.status,
      responseText,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const ARI = {
  channels: {
    originate(params: AriOriginateParams) {
      const query = {
        endpoint: params.endpoint,
        app: params.app || config.ariApp,
        appArgs: params.appArgs,
        callerId: params.callerId,
        timeout: params.timeout,
        channelId: params.channelId,
      };
      const body = params.variables ? { variables: params.variables } : undefined;
      logger.info(
        {
          debug_context: params.debugContext || 'unspecified',
          ari_route: buildUrl('/channels', query),
          endpoint: query.endpoint,
          app: query.app,
          appArgs: query.appArgs,
          callerId: query.callerId,
          timeout: query.timeout,
          channelId: query.channelId,
          body,
        },
        'ARI originate request',
      );
      return ariRequest({
        method: 'POST',
        path: '/channels',
        query,
        body,
      });
    },

    redirect(channelId: string, endpoint: string) {
      return ariRequest({
        method: 'POST',
        path: `/channels/${encodeURIComponent(channelId)}/redirect`,
        query: { endpoint },
      });
    },

    hangup(channelId: string) {
      return ariRequest({
        method: 'DELETE',
        path: `/channels/${encodeURIComponent(channelId)}`,
      });
    },

    /** Answer an inbound channel that is currently ringing. */
    answer(channelId: string) {
      return ariRequest({
        method: 'POST',
        path: `/channels/${encodeURIComponent(channelId)}/answer`,
        okStatuses: [204],
      });
    },

    /** Start music-on-hold on a channel (puts lead on hold). */
    startMoh(channelId: string, mohClass = 'default') {
      return ariRequest({
        method: 'POST',
        path: `/channels/${encodeURIComponent(channelId)}/moh`,
        query: { mohClass },
        okStatuses: [204],
      });
    },

    /** Stop music-on-hold on a channel. */
    stopMoh(channelId: string) {
      return ariRequest({
        method: 'DELETE',
        path: `/channels/${encodeURIComponent(channelId)}/moh`,
        okStatuses: [204],
      });
    },

    /**
     * Create a snoop (eavesdrop/whisper) channel on an existing channel.
     * @param channelId  - channel to snoop on
     * @param app        - ARI Stasis app to handle the snoop channel
     * @param spy        - 'none' | 'in' | 'out' | 'both' (what supervisor hears)
     * @param whisper    - 'none' | 'in' | 'out' | 'both' (what supervisor can say)
     * @param snoopId    - optional stable snoop channel id
     */
    snoop(
      channelId: string,
      app: string,
      spy: 'none' | 'in' | 'out' | 'both' = 'both',
      whisper: 'none' | 'in' | 'out' | 'both' = 'none',
      snoopId?: string,
    ) {
      return ariRequest({
        method: 'POST',
        path: `/channels/${encodeURIComponent(channelId)}/snoop`,
        query: {
          app,
          snoopId,
          spy,
          whisper,
        },
      });
    },

    /** Start a live recording on a channel. */
    record(
      channelId: string,
      name: string,
      opts: {
        format?: string;
        maxDurationSeconds?: number;
        maxSilenceSeconds?: number;
        ifExists?: 'fail' | 'overwrite' | 'append';
        beep?: boolean;
        terminateOn?: 'none' | 'any' | '*' | '#';
      } = {},
    ) {
      return ariRequest({
        method: 'POST',
        path: `/channels/${encodeURIComponent(channelId)}/record`,
        query: {
          name,
          format: opts.format ?? 'wav',
          maxDurationSeconds: opts.maxDurationSeconds,
          maxSilenceSeconds: opts.maxSilenceSeconds,
          ifExists: opts.ifExists ?? 'overwrite',
          beep: opts.beep,
          terminateOn: opts.terminateOn,
        },
      });
    },

    /** Play audio to a channel (e.g. a beep or announcement). */
    play(channelId: string, media: string, playbackId?: string) {
      return ariRequest({
        method: 'POST',
        path: `/channels/${encodeURIComponent(channelId)}/play`,
        query: { media, playbackId },
      });
    },

    get(channelId: string) {
      return ariRequest<AriChannel>({
        method: 'GET',
        path: `/channels/${encodeURIComponent(channelId)}`,
      });
    },

    continueInDialplan(
      channelId: string,
      context: string,
      extension = 's',
      priority = 1,
      label?: string,
    ) {
      return ariRequest({
        method: 'POST',
        path: `/channels/${encodeURIComponent(channelId)}/continue`,
        query: {
          context,
          extension,
          priority,
          label,
        },
        okStatuses: [204],
      });
    },
  },

  bridges: {
    create(bridgeId: string, type = 'mixing') {
      return ariRequest({
        method: 'POST',
        path: `/bridges/${encodeURIComponent(bridgeId)}`,
        query: { type },
      });
    },

    addChannel(bridgeId: string, channelIds: string[]) {
      return ariRequest({
        method: 'POST',
        path: `/bridges/${encodeURIComponent(bridgeId)}/addChannel`,
        query: { channel: channelIds.join(',') },
      });
    },

    removeChannel(bridgeId: string, channelIds: string[]) {
      return ariRequest({
        method: 'POST',
        path: `/bridges/${encodeURIComponent(bridgeId)}/removeChannel`,
        query: { channel: channelIds.join(',') },
      });
    },

    destroy(bridgeId: string) {
      return ariRequest({
        method: 'DELETE',
        path: `/bridges/${encodeURIComponent(bridgeId)}`,
        okStatuses: [204],
      });
    },
  },

  recordings: {
    /** Stop an active live recording. */
    stop(recordingName: string) {
      return ariRequest({
        method: 'POST',
        path: `/recordings/live/${encodeURIComponent(recordingName)}/stop`,
        okStatuses: [204],
      });
    },

    /** Retrieve stored recording metadata. */
    get(recordingName: string) {
      return ariRequest({
        method: 'GET',
        path: `/recordings/stored/${encodeURIComponent(recordingName)}`,
      });
    },
  },

  endpoints: {
    get(technology: string, resource: string) {
      return ariRequest<AriEndpoint>({
        method: 'GET',
        path: `/endpoints/${encodeURIComponent(technology)}/${encodeURIComponent(resource)}`,
      });
    },
  },
};
