import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { supabase } from './supabase';
import { config } from './config';
import { logger } from './logger';

type Role = 'owner' | 'admin' | 'agent';

interface JwtClaims {
  org_id?: string;
  user_id?: string;
  role?: Role;
}

declare module 'fastify' {
  interface FastifyRequest {
    org_id?: string;
    user_id?: string;
    role?: string;
  }
}

export const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('org_id', '');
  app.decorateRequest('user_id', '');
  app.decorateRequest('role', '');

  app.addHook('onRequest', async (req) => {
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    let claims: JwtClaims = {};
    if (bearer) {
      try {
        if (config.jwtSecret) {
          claims = jwt.verify(bearer, config.jwtSecret) as JwtClaims;
        } else {
          claims = (jwt.decode(bearer) as JwtClaims) || {};
        }
      } catch {
        // Fall through to header-based extraction.
      }
    }

    req.org_id =
      claims.org_id ||
      (req.headers['x-org-id'] as string | undefined) ||
      undefined;
    req.user_id =
      claims.user_id ||
      (req.headers['x-user-id'] as string | undefined) ||
      undefined;
    req.role =
      claims.role ||
      (req.headers['x-role'] as string | undefined) ||
      undefined;
  });
};

const PUBLIC_PATHS = new Set(['/health', '/version', '/ws']);
const INTERNAL_CALLBACK_PATHS = [
  /^\/dialer\/calls\/[^/]+\/amd_result$/,
];
const VALID_ROLES = new Set<Role>(['owner', 'admin', 'agent']);
const AGENT_WRITE_ALLOWLIST = [
  /^\/dialer\/agents\/session$/,
  /^\/dialer\/agents\/[^/]+\/state$/,
  /^\/dialer\/calls\/[^/]+\/disposition$/,
  /^\/telephony\/calls\/end$/,
];

function extractScopedOrgId(req: FastifyRequest): string | undefined {
  const query = (req.query || {}) as Record<string, unknown>;
  const body = (req.body || {}) as Record<string, unknown>;
  const params = (req.params || {}) as Record<string, unknown>;

  const candidates = [
    query.org_id,
    query.orgId,
    body.org_id,
    body.orgId,
    params.org_id,
    params.orgId,
  ];

  const scoped = candidates.find((value) => typeof value === 'string');
  return scoped as string | undefined;
}

function isWriteMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isAgentWriteAllowed(path: string): boolean {
  return AGENT_WRITE_ALLOWLIST.some((pattern) => pattern.test(path));
}

function bypassTenantContext(path: string): boolean {
  return PUBLIC_PATHS.has(path) || INTERNAL_CALLBACK_PATHS.some((pattern) => pattern.test(path));
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    const candidate = value.find((entry) => typeof entry === 'string' && entry.trim());
    return candidate?.trim();
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return undefined;
}

async function ensureOrgExists(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const { data: org, error } = await supabase
    .from('orgs')
    .select('org_id')
    .eq('org_id', req.org_id)
    .maybeSingle();

  if (error) {
    await reply.status(500).send({ error: error.message });
    return false;
  }

  if (org) {
    return true;
  }

  const orgSlug = firstHeaderValue(req.headers['x-org-slug']) || null;
  const orgName = firstHeaderValue(req.headers['x-org-name']) || orgSlug || req.org_id || 'Unknown organization';

  const { error: bootstrapError } = await supabase
    .from('orgs')
    .upsert(
      {
        org_id: req.org_id,
        name: orgName,
        status: 'active',
        metadata: {
          identity_provider: 'clerk',
          bootstrap_source: 'auth.requireTenantContext',
          clerk: {
            org_id: req.org_id,
            org_slug: orgSlug,
          },
        },
        created_by: req.user_id,
        updated_by: req.user_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' },
    );

  if (bootstrapError) {
    logger.error({ err: bootstrapError, org_id: req.org_id, user_id: req.user_id }, 'Failed to auto-bootstrap org scope');
    await reply.status(500).send({ error: bootstrapError.message });
    return false;
  }

  logger.info({ org_id: req.org_id, user_id: req.user_id, org_slug: orgSlug }, 'Auto-bootstrapped org from authenticated scope');
  return true;
}

export async function requireTenantContext(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const path = req.url.split('?')[0];
  if (bypassTenantContext(path)) {
    return;
  }

  if (!req.org_id) {
    await reply.status(401).send({ error: 'Missing org_id in JWT or header' });
    return;
  }

  if (!req.role || !VALID_ROLES.has(req.role as Role)) {
    await reply.status(403).send({ error: 'Invalid or missing role' });
    return;
  }

  // Enforce role-based write restrictions.
  if (isWriteMethod(req.method) && req.role === 'agent' && !path.startsWith('/ai')) {
    if (!isAgentWriteAllowed(path)) {
      await reply.status(403).send({ error: 'Agent role cannot perform write operations on this resource' });
      return;
    }
  }

  if (!(await ensureOrgExists(req, reply))) {
    return;
  }

  // Reject cross-tenant attempts when route payload/query includes org_id.
  const scopedOrgId = extractScopedOrgId(req);
  if (scopedOrgId && scopedOrgId !== req.org_id) {
    await reply.status(403).send({ error: 'Cross-tenant access denied' });
    return;
  }
}
