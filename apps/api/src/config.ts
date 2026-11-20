import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carga variables desde la raíz del repo. ENV_FILE permite elegir (p. ej. .env.local para desarrollo).
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const envFile = process.env.ENV_FILE ? resolve(root, process.env.ENV_FILE) : resolve(root, '.env');
if (existsSync(envFile)) loadEnv({ path: envFile, override: false });

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: req('DATABASE_URL'),
  jwtSecret: req('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'solo-desarrollo-no-usar-en-produccion'),
  tokenTtl: process.env.TOKEN_TTL ?? '7d',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  publicApiUrl: process.env.PUBLIC_API_URL ?? '',
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
    localDir: resolve(root, process.env.STORAGE_LOCAL_DIR ?? './data/evidencias'),
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? '',
      region: process.env.S3_REGION ?? 'sa-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      bucket: process.env.S3_BUCKET ?? 'evidencias',
    },
  },
  orsApiKey: process.env.ORS_API_KEY ?? '',
  dbSsl: /supabase|render|neon/.test(process.env.DATABASE_URL ?? ''),
  repoRoot: root,
};
