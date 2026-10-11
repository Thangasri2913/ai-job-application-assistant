import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { type AuthSession, AuthSessionContext } from '../features/auth/auth-session';
import { AuthProvider } from '../features/auth/components/AuthProvider';
import { tokenSource } from '../lib/auth/token-source';
import { routes } from '../router';
import { fakeSession } from './fake-session';

/**
 * Renders the real route tree at `path` with a fake identity-provider session
 * (signed in by default). Everything below the session — AuthProvider, guards,
 * GET /auth/me, the API client — is the production code.
 */
export function renderApp(path: string, session: AuthSession = fakeSession()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  tokenSource.register({
    getAccessToken: () => Promise.resolve(session.accessToken),
    renew: session.renew,
    onSessionExpired: () => void router.navigate('/login?reason=expired'),
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthSessionContext.Provider value={session}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AuthSessionContext.Provider>
    </QueryClientProvider>,
  );
  return { ...utils, router, session };
}
