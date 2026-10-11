import type { AuthUser } from '@job-assist/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useMemo } from 'react';
import { ApiError, errorMessage } from '../../../lib/api/api-error';
import { apiRequest } from '../../../lib/api/http';
import { AuthContext, type AuthContextValue } from '../auth-context';
import { useAuthSession } from '../auth-session';

const currentUserKey = ['auth', 'me'] as const;

/**
 * Combines the identity-provider session with the application's own user record.
 * GET /auth/me makes the API validate the token and create/sync the local user.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const signedIn = session.status === 'authenticated';

  const me = useQuery({
    queryKey: [...currentUserKey, session.accessToken ? 'session' : 'none'],
    queryFn: () => apiRequest<AuthUser>('/auth/me'),
    enabled: signedIn,
    staleTime: 5 * 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });

  const value = useMemo<AuthContextValue>(() => {
    const meFailed =
      signedIn && me.isError && !(me.error instanceof ApiError && me.error.status === 401);
    return {
      user: signedIn ? (me.data ?? null) : null,
      isAuthenticated: signedIn && me.isSuccess,
      isLoading: session.status === 'loading' || (signedIn && me.isPending),
      error: session.status === 'error' ? session.error : meFailed ? errorMessage(me.error) : null,
      signIn: session.signIn,
      register: session.register,
      signOut: async () => {
        queryClient.clear();
        await session.signOut();
      },
      retry: () => void me.refetch(),
    };
  }, [session, signedIn, me, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
