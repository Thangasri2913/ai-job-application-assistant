import { screen, waitFor } from '@testing-library/react';
import { mockApi } from '../../../test/api-mock';
import { fakeSession, signedOutSession } from '../../../test/fake-session';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

describe('route protection', () => {
  it('redirects signed-out users to the login page, keeping the return URL', async () => {
    const api = mockApi({});
    const { router } = renderApp('/resumes?tab=archived', signedOutSession());

    expect(
      await screen.findByRole('heading', { name: 'Welcome to JobAssist' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?returnUrl=%2Fresumes%3Ftab%3Darchived');
    expect(api.calls).toHaveLength(0); // no API calls without a session
  });

  it('shows a loading state while the session is being determined', async () => {
    renderApp('/dashboard', fakeSession({ status: 'loading', accessToken: null }));
    expect(await screen.findByRole('status', { name: 'Signing you in' })).toBeInTheDocument();
  });

  it('lets signed-in users through after the API confirms the account', async () => {
    const api = mockApi({ 'GET /auth/me': meOk, 'GET /dashboard/summary': { status: 404 } });
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Welcome, Priya' })).toBeInTheDocument();
    expect(api.find('GET', '/auth/me')).toHaveLength(1);
    const headers = new Headers((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer test-access-token');
  });

  it('sends signed-in users away from the login page', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /dashboard/summary': { status: 404 } });
    const { router } = renderApp('/login');
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
  });

  it('shows a helpful error when the account cannot be loaded', async () => {
    mockApi({
      'GET /auth/me': {
        status: 503,
        body: {
          code: 'IDENTITY_PROVIDER_UNAVAILABLE',
          message: 'The sign-in service is unavailable. Please try again shortly.',
        },
      },
    });
    renderApp('/dashboard');
    expect(await screen.findByText('We couldn’t sign you in')).toBeInTheDocument();
    expect(
      screen.getByText('The sign-in service is unavailable. Please try again shortly.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('returns to login with an explanation when the session expires and cannot be renewed', async () => {
    mockApi({
      'GET /auth/me': { status: 401, body: { code: 'TOKEN_EXPIRED', message: 'expired' } },
    });
    const { router } = renderApp('/dashboard');
    await waitFor(() => expect(router.state.location.search).toContain('reason=expired'));
    expect(
      await screen.findByText('Your session has expired. Please sign in again.'),
    ).toBeInTheDocument();
  });
});
