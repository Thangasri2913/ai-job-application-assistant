import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { signedOutSession } from '../../../test/fake-session';
import { renderApp } from '../../../test/render-app';

describe('LoginPage', () => {
  beforeEach(() => mockApi({}));

  it('offers Keycloak sign-in and registration — never a password form', async () => {
    renderApp('/login', signedOutSession());
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(document.querySelector('input[type=password]')).toBeNull();
  });

  it('starts Keycloak sign-in with the page the user wanted', async () => {
    const session = signedOutSession();
    renderApp('/login?returnUrl=%2Fresumes', session);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(session.signIn).toHaveBeenCalledWith('/resumes');
  });

  it('starts Keycloak registration for new users', async () => {
    const session = signedOutSession();
    renderApp('/login', session);
    await userEvent.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(session.register).toHaveBeenCalledWith('/dashboard');
  });

  it('ignores unsafe return URLs', async () => {
    const session = signedOutSession();
    renderApp('/login?returnUrl=https%3A%2F%2Fevil.example', session);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(session.signIn).toHaveBeenCalledWith('/dashboard');
  });

  it('explains when Keycloak cannot be reached', async () => {
    const session = signedOutSession({
      signIn: vi.fn(() => Promise.reject(new Error('Failed to fetch'))),
    });
    renderApp('/login', session);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'couldn’t reach the sign-in service',
    );
  });

  it('shows the session error reported by the identity provider', async () => {
    renderApp(
      '/login',
      signedOutSession({
        status: 'error',
        error: 'Sign-in couldn’t be completed. Please try again.',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in couldn’t be completed.');
  });
});
