import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { tokenSource } from '../lib/auth/token-source';

// Lazy routes render slower when many jsdom workers run in parallel; 1s (the default) is too tight.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  tokenSource.register({
    getAccessToken: () => Promise.resolve(null),
    renew: () => Promise.resolve(null),
    onSessionExpired: () => undefined,
  });
});
