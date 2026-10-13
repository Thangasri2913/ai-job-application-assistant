import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Single source of env for the whole repo: <repo>/.env (see .env.example).
loadEnv({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Migrations may need a direct (non-pooled) connection, e.g. Neon's direct URL; the running
  // API always uses DATABASE_URL (see PrismaService). Optional here so that `prisma generate`
  // (run by `npm install`) works on a fresh clone without .env; migrate commands still require
  // a URL and say so.
  datasource: { url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL },
});
