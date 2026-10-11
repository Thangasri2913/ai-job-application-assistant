import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { completion, emptyProfile, meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

describe('CareerProfilePage', () => {
  it('loads the profile and completion checklist', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /profile': { body: emptyProfile() },
      'GET /profile/completion': { body: completion(10) },
    });
    renderApp('/profile');

    expect(await screen.findByRole('heading', { name: 'Career profile' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Full name/)).toHaveValue('Priya Sharma');
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('readonly');
    const card = screen.getByRole('heading', { name: 'Profile completion' }).closest('section')!;
    expect(within(card).getByText('10%')).toBeInTheDocument();
    expect(within(card).getByText('Add a project you have worked on.')).toBeInTheDocument();
  });

  it('saves edited details exactly as entered', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /profile': { body: emptyProfile() },
      'GET /profile/completion': { body: completion() },
      'PUT /profile': ({ body }) => ({
        body: {
          ...emptyProfile().details,
          ...(body as object),
          email: 'priya@example.com',
          updatedAt: '2026-10-10T00:00:00Z',
        },
      }),
    });
    renderApp('/profile');

    const years = await screen.findByLabelText(/Years of experience/);
    await userEvent.type(years, '3.3');
    await userEvent.type(screen.getByLabelText(/^Phone/), '+91 98765 43210');
    await userEvent.type(
      screen.getByLabelText(/^Professional headline/),
      'Frontend Developer · Angular',
    );
    await userEvent.click(screen.getByLabelText('Remote'));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(api.find('PUT', '/profile')).toHaveLength(1));
    expect(api.find('PUT', '/profile')[0]!.body).toMatchObject({
      yearsOfExperience: 3.3,
      phone: '+91 98765 43210',
      workModes: ['REMOTE'],
      headline: 'Frontend Developer · Angular',
      summary: null,
    });
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
  });

  it('validates fields before saving', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /profile': { body: emptyProfile() },
      'GET /profile/completion': { body: completion() },
    });
    renderApp('/profile');

    await userEvent.type(await screen.findByLabelText(/^LinkedIn/), 'not a url');
    await userEvent.type(screen.getByLabelText(/Years of experience/), '3.33');
    await userEvent.click(screen.getByLabelText(/^Professional headline/));
    await userEvent.paste('x'.repeat(151));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Enter a full URL starting with https://')).toBeInTheDocument();
    expect(screen.getByText('Use a number like 3 or 3.3')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Professional headline/)).toHaveAttribute('aria-invalid', 'true');
    expect(api.find('PUT', '/profile')).toHaveLength(0);
  });

  it('adds an experience entry through the dialog', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /profile': { body: emptyProfile() },
      'GET /profile/completion': { body: completion() },
      'POST /profile/experiences': ({ body }) => ({
        status: 201,
        body: { id: 'e1', ...(body as object) },
      }),
    });
    renderApp('/profile');

    await userEvent.click(await screen.findByRole('tab', { name: 'Experience' }));
    expect(screen.getByText('No experience added yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add experience' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Job title'), 'Frontend Developer');
    await userEvent.type(within(dialog).getByLabelText('Company'), 'Acme');
    await userEvent.click(within(dialog).getByLabelText('I currently work here'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.find('POST', '/profile/experiences')).toHaveLength(1));
    expect(api.find('POST', '/profile/experiences')[0]!.body).toMatchObject({
      jobTitle: 'Frontend Developer',
      company: 'Acme',
      isCurrent: true,
      endDate: null,
    });
  });

  it('rejects a salary range whose maximum is below the minimum', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /profile': { body: emptyProfile() },
      'GET /profile/completion': { body: completion() },
    });
    renderApp('/profile');

    await userEvent.type(await screen.findByLabelText(/Minimum salary/), '2000000');
    await userEvent.type(screen.getByLabelText(/Maximum salary/), '1000000');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(
      await screen.findByText('Maximum must not be lower than the minimum.'),
    ).toBeInTheDocument();
    expect(api.find('PUT', '/profile')).toHaveLength(0);
  });

  it('cancels unsaved edits', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /profile': { body: emptyProfile() },
      'GET /profile/completion': { body: completion() },
    });
    renderApp('/profile');
    const phone = await screen.findByLabelText(/^Phone/);
    await userEvent.type(phone, '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(phone).toHaveValue('');
  });

  it('adds a language', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /profile': { body: emptyProfile() },
      'GET /profile/completion': { body: completion() },
      'POST /profile/languages': ({ body }) => ({
        status: 201,
        body: { id: 'l1', ...(body as object) },
      }),
    });
    renderApp('/profile');

    await userEvent.click(await screen.findByRole('tab', { name: 'Languages' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add language' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Language'), 'Tamil');
    await userEvent.type(within(dialog).getByLabelText(/Proficiency/), 'Native');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.find('POST', '/profile/languages')).toHaveLength(1));
    expect(api.find('POST', '/profile/languages')[0]!.body).toEqual({
      name: 'Tamil',
      proficiency: 'Native',
    });
  });

  it('reorders experience with the move buttons', async () => {
    const profile = emptyProfile();
    const exp = (id: string, company: string) => ({
      id,
      company,
      jobTitle: 'Developer',
      location: null,
      startDate: null,
      endDate: null,
      isCurrent: false,
      description: null,
      responsibilities: [],
      achievements: [],
      technologies: [],
    });
    profile.experiences = [exp('e1', 'First Co'), exp('e2', 'Second Co')];
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /profile': { body: profile },
      'GET /profile/completion': { body: completion() },
      'PUT /profile/experiences/order': { status: 204 },
    });
    renderApp('/profile');

    await userEvent.click(await screen.findByRole('tab', { name: 'Experience' }));
    const [firstUp] = screen.getAllByRole('button', { name: 'Move experience up' });
    expect(firstUp).toBeDisabled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Move experience down' })[0]!);

    await waitFor(() => expect(api.find('PUT', '/profile/experiences/order')).toHaveLength(1));
    expect(api.find('PUT', '/profile/experiences/order')[0]!.body).toEqual({ ids: ['e2', 'e1'] });
  });
});
