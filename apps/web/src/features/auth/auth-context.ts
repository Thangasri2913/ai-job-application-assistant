import type { AuthUser } from '@job-assist/shared';
import { createContext, useContext } from 'react';

export interface AuthContextValue {
  /** The application user (from GET /auth/me), once signed in and synchronised. */
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True while the session or the application user is being established. */
  isLoading: boolean;
  /** User-facing message if signing in or loading the account failed. */
  error: string | null;
  signIn: (returnUrl?: string) => Promise<void>;
  register: (returnUrl?: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
