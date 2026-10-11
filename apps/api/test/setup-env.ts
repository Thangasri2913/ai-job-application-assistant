import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl)
  throw new Error('TEST_DATABASE_URL must be set for e2e tests (see .env.example).');

// Never point integration tests at the development database.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.SWAGGER_ENABLED = 'false';
process.env.RATE_LIMIT_MAX = '1000';
process.env.UPLOAD_RATE_LIMIT_MAX = '1000';
process.env.JOB_ANALYSIS_RATE_LIMIT_MAX = '1000';
// Development fixture source; the scheduler is driven explicitly by tests (tick()).
process.env.JOB_SOURCES = 'dev';
process.env.JOB_ALERT_SCHEDULER_ENABLED = 'false';
// Separate bucket so tests never touch development files.
process.env.S3_BUCKET = 'job-assist-test';
process.env.S3_AUTO_CREATE_BUCKET = 'true';
process.env.RESUME_MAX_UPLOAD_BYTES = String(512 * 1024);
