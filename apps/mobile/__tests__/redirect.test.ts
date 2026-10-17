/**
 * The redirect URI is computed by the real expo-auth-session/expo-linking code, with
 * expo-constants describing the runtime (Expo Go vs a native build).
 */
function redirectFor(executionEnvironment: string, hostUri?: string) {
  let uri = '';
  let runtime = '';
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => {
      const ExecutionEnvironment = {
        Bare: 'bare',
        Standalone: 'standalone',
        StoreClient: 'storeClient',
      };
      const constants = {
        executionEnvironment,
        expoConfig: { scheme: 'jobassist', hostUri },
        // Set by Expo Go when the app is served by the Expo CLI.
        expoGoConfig:
          executionEnvironment === 'storeClient' ? { developer: { tool: 'expo-cli' } } : null,
        manifest: null,
        manifest2: null,
        linkingUri: hostUri ? `exp://${hostUri}` : 'jobassist://',
      };
      return { __esModule: true, default: constants, ExecutionEnvironment };
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../src/auth/redirect') as typeof import('../src/auth/redirect');
    uri = mod.redirectUri();
    runtime = mod.currentRuntime();
  });
  return { uri, runtime };
}

describe('OAuth redirect URI per runtime', () => {
  it('uses Expo Go’s exp:// callback through the dev server in Expo Go', () => {
    expect(redirectFor('storeClient', '192.168.1.20:8081')).toEqual({
      uri: 'exp://192.168.1.20:8081/--/auth/callback',
      runtime: 'expo-go',
    });
  });

  it('uses the registered jobassist:// scheme in a development or release build', () => {
    expect(redirectFor('bare', '192.168.1.20:8081')).toEqual({
      uri: 'jobassist://auth/callback',
      runtime: 'native-build',
    });
    expect(redirectFor('standalone').uri).toBe('jobassist://auth/callback');
  });
});
