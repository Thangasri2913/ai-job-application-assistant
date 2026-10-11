import { vi } from 'vitest';
import type { AuthSession } from '../features/auth/auth-session';

/** A controllable stand-in for the Keycloak/OIDC session in component tests. */
export function fakeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    status: 'authenticated',
    error: null,
    accessToken: 'test-access-token',
    signIn: vi.fn(() => Promise.resolve()),
    register: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
    renew: vi.fn(() => Promise.resolve(null)),
    clear: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

export const signedOutSession = (overrides: Partial<AuthSession> = {}) =>
  fakeSession({ status: 'unauthenticated', accessToken: null, ...overrides });
