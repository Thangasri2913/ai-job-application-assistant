import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../test/api-mock';
import { meOk } from '../test/factories';
import { renderApp } from '../test/render-app';

describe('AppShell', () => {
  it('shows the signed-in user and logs out through Keycloak', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /dashboard/summary': { status: 404 } });
    const { session } = renderApp('/dashboard');

    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }));
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => expect(session.signOut).toHaveBeenCalledTimes(1));
  });
});
