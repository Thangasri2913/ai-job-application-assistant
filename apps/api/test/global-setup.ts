import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/** Applies all migrations to the test database before the e2e suite runs. */
export default function setup(): void {
  config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set for e2e tests (see .env.example).');
  // The suites truncate tables: refuse to run against the app's own (possibly production) database.
  for (const name of ['DATABASE_URL', 'DIRECT_DATABASE_URL'] as const) {
    if (process.env[name] && process.env[name] === url)
      throw new Error(`TEST_DATABASE_URL must be a separate database from ${name}.`);
  }

  execSync('npx prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '..'),
    // prisma.config.ts prefers DIRECT_DATABASE_URL, so override both: migrations must only
    // ever reach the test database.
    env: { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url },
    stdio: 'inherit',
  });
}
