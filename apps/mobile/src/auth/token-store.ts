import * as SecureStore from 'expo-secure-store';

/**
 * Tokens are kept only in expo-secure-store (Android Keystore-backed encrypted storage) —
 * never in AsyncStorage, logs or source. Each token has its own entry to stay under the
 * per-item size limit. Nothing here ever logs a token value.
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

const KEYS = {
  access: 'jobassist.access_token',
  refresh: 'jobassist.refresh_token',
  id: 'jobassist.id_token',
  expiresAt: 'jobassist.expires_at',
} as const;

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const tokenStore = {
  async save(t: StoredTokens): Promise<void> {
    await SecureStore.setItemAsync(KEYS.access, t.accessToken, OPTIONS);
    await setOrDelete(KEYS.refresh, t.refreshToken);
    await setOrDelete(KEYS.id, t.idToken);
    await SecureStore.setItemAsync(KEYS.expiresAt, String(t.expiresAt), OPTIONS);
  },

  async load(): Promise<StoredTokens | null> {
    const accessToken = await SecureStore.getItemAsync(KEYS.access, OPTIONS);
    if (!accessToken) return null;
    const expiresAt = Number(await SecureStore.getItemAsync(KEYS.expiresAt, OPTIONS));
    return {
      accessToken,
      refreshToken: await SecureStore.getItemAsync(KEYS.refresh, OPTIONS),
      idToken: await SecureStore.getItemAsync(KEYS.id, OPTIONS),
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    };
  },

  async clear(): Promise<void> {
    await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k, OPTIONS)));
  },
};

async function setOrDelete(key: string, value: string | null): Promise<void> {
  if (value) await SecureStore.setItemAsync(key, value, OPTIONS);
  else await SecureStore.deleteItemAsync(key, OPTIONS);
}
