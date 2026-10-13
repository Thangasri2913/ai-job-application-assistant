import { type AdzunaConfig, AdzunaJobSourceAdapter } from './adzuna-job-source.js';
import { DevJobSourceAdapter } from './dev-job-source.js';
import { type GreenhouseConfig, GreenhouseJobSourceAdapter } from './greenhouse-job-source.js';
import type { JobSourceAdapter } from './job-source-adapter.js';
import { type LeverConfig, LeverJobSourceAdapter } from './lever-job-source.js';
import { type RemotiveConfig, RemotiveJobSourceAdapter } from './remotive-job-source.js';

/** Configuration the built-in adapters read (all from environment variables). */
export interface SourcesConfig {
  adzuna: AdzunaConfig;
  remotive: RemotiveConfig;
  greenhouse: GreenhouseConfig;
  lever: LeverConfig;
}

/**
 * Every adapter the application ships, by key. Only official APIs or published feeds within
 * the provider's terms may be added here (no scraping).
 */
export const BUILT_IN_SOURCES: Record<string, (config: SourcesConfig) => JobSourceAdapter> = {
  // Real job ads from the official Adzuna API (needs ADZUNA_APP_ID / ADZUNA_APP_KEY).
  adzuna: (config) => new AdzunaJobSourceAdapter(config.adzuna),
  // Remote jobs from Remotive's public API (no credentials; cached, a few requests a day).
  remotive: (config) => new RemotiveJobSourceAdapter(config.remotive),
  // Employer boards on Greenhouse's public Job Board API (GREENHOUSE_BOARDS).
  greenhouse: (config) => new GreenhouseJobSourceAdapter(config.greenhouse),
  // Employer sites on Lever's public Postings API (LEVER_SITES).
  lever: (config) => new LeverJobSourceAdapter(config.lever),
  // Development sample data: never used in production.
  dev: () => new DevJobSourceAdapter(),
};

export interface SourceSelection {
  adapters: JobSourceAdapter[];
  /** Keys in JOB_SOURCES that no adapter implements. */
  unknown: string[];
  /** Development sources refused because the server runs in production. */
  refusedInProduction: string[];
  /** Enabled sources whose required configuration (e.g. credentials) is missing. */
  notConfigured: string[];
}

/**
 * The adapters JOB_SOURCES enables. Development (sample-data) sources are refused in
 * production, so a production server only ever discovers real postings.
 */
export function selectJobSources(
  keys: string[],
  nodeEnv: string,
  config: SourcesConfig,
): SourceSelection {
  const selection: SourceSelection = {
    adapters: [],
    unknown: [],
    refusedInProduction: [],
    notConfigured: [],
  };
  for (const key of keys) {
    const create = BUILT_IN_SOURCES[key];
    if (!create) {
      selection.unknown.push(key);
      continue;
    }
    const adapter = create(config);
    if (adapter.descriptor.isDevelopment && nodeEnv === 'production') {
      selection.refusedInProduction.push(key);
      continue;
    }
    if (!adapter.isConfigured()) selection.notConfigured.push(key);
    selection.adapters.push(adapter);
  }
  return selection;
}

const MISSING_CONFIG: Record<string, string> = {
  adzuna: 'ADZUNA_APP_ID and ADZUNA_APP_KEY are not set',
  greenhouse: 'GREENHOUSE_BOARDS is empty',
  lever: 'LEVER_SITES is empty',
};

/** One-line startup summary, so server logs show whether discovery can find anything. */
export function describeSelection(s: SourceSelection): { level: 'log' | 'warn'; message: string } {
  const notes = [
    ...s.unknown.map((k) => `"${k}" is not a supported source and was ignored`),
    ...s.refusedInProduction.map(
      (k) => `"${k}" provides development sample data and is disabled in production`,
    ),
    ...s.notConfigured.map(
      (k) => `"${k}" is enabled but not configured (${MISSING_CONFIG[k] ?? 'missing settings'})`,
    ),
  ];
  const usable = s.adapters.filter((a) => a.isConfigured());
  if (usable.length === 0) {
    return {
      level: 'warn',
      message: `Job discovery has no usable job sources: job alerts will run but cannot find any jobs${
        notes.length ? ` (${notes.join('; ')})` : ' (JOB_SOURCES is empty)'
      }. Supported sources: ${Object.keys(BUILT_IN_SOURCES).join(', ')}.`,
    };
  }
  const names = usable
    .map(
      (a) => `${a.descriptor.key}${a.descriptor.isDevelopment ? ' (sample data)' : ' (real jobs)'}`,
    )
    .join(', ');
  return {
    level: notes.length ? 'warn' : 'log',
    message: `Job discovery sources: ${names}${notes.length ? `; ${notes.join('; ')}` : ''}.`,
  };
}
