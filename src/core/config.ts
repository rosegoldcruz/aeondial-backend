import 'dotenv/config';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  crmOrigin: process.env.CRM_ORIGIN || 'http://localhost:3000',
  aiWorkerOrigin: process.env.AI_WORKER_ORIGIN || 'http://localhost:8787',
  ariUrl: process.env.ARI_URL || '',
  ariUsername: process.env.ARI_USERNAME || '',
  ariPassword: process.env.ARI_PASSWORD || '',
  ariApp: process.env.ARI_APP || 'aeondial',
  ariEndpointPrefix: process.env.ARI_ENDPOINT_PREFIX || 'PJSIP',
};

export function assertRequiredConfig(): void {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
}
