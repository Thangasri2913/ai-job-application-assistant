/**
 * Whole-app journeys with the real AuthProvider, navigation and screens. Only the network
 * (global fetch) and secure storage are faked.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfirmProvider } from '../src/components/ConfirmDialog';
import { AuthProvider } from '../src/auth/AuthContext';
import { Root } from '../src/App';
import { metrics, recommendation } from './helpers';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
    setItemAsync: jest.fn((k: string, v: string) => Promise.resolve(void store.set(k, v))),
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    deleteItemAsync: jest.fn((k: string) => Promise.resolve(void store.delete(k))),
    __store: store,
  };
});
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

const dashboard = {
  resumes: {
    total: 1,
    active: 1,
    archived: 0,
    defaultResume: { id: 'r1', name: 'Angular Resume' },
    needsReview: 0,
    latestUpload: null,
    recentlyUpdated: null,
  },
  profileCompletion: {
    percentage: 60,
    items: [
      { key: 'skills', label: 'Skills', weight: 40, complete: false, hint: 'Add your skills' },
    ],
    missingSections: ['skills'],
  },
  applications: {
    total: 0,
    archived: 0,
    byStatus: Object.fromEntries(
      [
        'SAVED',
        'PREPARING',
        'APPLIED',
        'RECRUITER_SCREEN',
        'ASSESSMENT',
        'INTERVIEW',
        'TECHNICAL_INTERVIEW',
        'FINAL_INTERVIEW',
        'OFFER',
        'ACCEPTED',
        'REJECTED',
        'WITHDRAWN',
        'NO_RESPONSE',
      ].map((s) => [s, 0]),
    ),
  },
  recommendations: { new: 1, strong: 1, moderate: 0, low: 0 },
};

let routes: Record<string, unknown>;
const defaultFetch = (url: string) => {
  const path = new URL(url).pathname.replace(/^\/api\/v1/, '');
  if (path.endsWith('/protocol/openid-connect/logout'))
    return Promise.resolve(new Response(null, { status: 204 }));
  const key = Object.keys(routes).find((k) => path === k);
  if (!key)
    return Promise.resolve(new Response(JSON.stringify({ message: 'Not found' }), { status: 404 }));
  return Promise.resolve(
    new Response(JSON.stringify(routes[key]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
};
const fetchMock = jest.fn(defaultFetch);

function renderApp() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ConfirmProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </ConfirmProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  store.clear();
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockClear();
  fetchMock.mockImplementation(defaultFetch);
  routes = {
    '/auth/me': {
      id: 'u1',
      email: 'thanga@example.com',
      fullName: 'Thanga Sri',
      roles: [],
      createdAt: '',
    },
    '/dashboard/summary': dashboard,
    '/smart-apply/applications': { items: [], total: 0, page: 1, pageSize: 20 },
    '/recommendations': [recommendation()],
    '/applications': [],
    '/smart-apply/settings': {
      mode: 'PREPARE_ONLY',
      dailyApplicationLimit: 10,
      dailySubmissionLimit: 3,
      autoSubmitConsentAt: null,
      consentText: 'I allow the app to submit applications I have approved…',
      consentVersion: 'auto-submit@1',
      autoSubmitAvailable: false,
      providers: [],
      usage: { applicationsToday: 0, submissionsToday: 0 },
    },
  };
});

const signedInSession = () => {
  store.set('jobassist.access_token', 'access-1');
  store.set('jobassist.refresh_token', 'refresh-1');
  store.set('jobassist.expires_at', String(Date.now() + 10 * 60_000));
};

describe('app journeys', () => {
  it('shows sign-in when there is no saved session', async () => {
    renderApp();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByText(/The app never sees your password/)).toBeTruthy();
  });

  it('restores a saved session and opens on Home with real data and the next step', async () => {
    signedInSession();
    renderApp();
    expect(await screen.findByText('Hi, Thanga')).toBeTruthy();
    expect(screen.getByText('1 new job to look at')).toBeTruthy();
    expect(screen.getByText('Career profile 60% complete')).toBeTruthy();
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/auth/me')) as unknown as [
      string,
      RequestInit,
    ];
    expect(new Headers(call[1].headers).get('Authorization')).toBe('Bearer access-1');
  });

  it('navigates between the primary tabs with a clear active tab, keeping each tab’s place', async () => {
    signedInSession();
    renderApp();
    await screen.findByText('Hi, Thanga');
    fireEvent.press(screen.getByRole('tab', { name: 'Jobs' }));
    expect(await screen.findByText(recommendation().job.title)).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Jobs' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    fireEvent.press(screen.getByRole('tab', { name: 'Applications' }));
    expect(await screen.findByText('No applications yet')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Browse jobs' }));
    expect(await screen.findByText(recommendation().job.title)).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
    expect(await screen.findByText('thanga@example.com')).toBeTruthy();
  });

  it('signs out after confirmation and returns to sign-in, clearing the session', async () => {
    signedInSession();
    renderApp();
    await screen.findByText('Hi, Thanga');
    fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByText('You’ll need to sign in again to see your jobs and applications.'),
    ).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Sign out' });
    fireEvent.press(buttons[buttons.length - 1]!);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(store.has('jobassist.access_token')).toBe(false);
  });

  it('returns to sign-in with a reason when the API ends the session', async () => {
    signedInSession();
    store.delete('jobassist.refresh_token');
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify({}), { status: String(url).includes('/api/v1/') ? 401 : 400 }),
      ),
    );
    renderApp();
    expect(await screen.findByText('Your session has ended. Please sign in again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('asks before discarding unsaved settings, and validates limits inline', async () => {
    signedInSession();
    renderApp();
    await screen.findByText('Hi, Thanga');
    fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Smart Apply settings' }));
    const limit = await screen.findByLabelText('Applications prepared per day');
    fireEvent.changeText(limit, '0');
    expect(screen.getByText('Enter a whole number from 1 to 50.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByText('Discard changes?')).toBeNull());
    expect(screen.getByLabelText('Applications prepared per day').props.value).toBe('0');
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('thanga@example.com')).toBeTruthy();
  });
});
