import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './features/auth/components/AuthProvider';
import { OidcSessionProvider } from './features/auth/components/OidcSessionProvider';
import { ApiError } from './lib/api/api-error';
import { createAppRouter } from './router';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Don't retry client errors (4xx) — they won't fix themselves.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  });
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);

  const onSignedIn = useCallback(
    (returnUrl: string) => void router.navigate(returnUrl, { replace: true }),
    [router],
  );
  const onSessionExpired = useCallback(() => {
    queryClient.clear();
    void router.navigate('/login?reason=expired', { replace: true });
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <OidcSessionProvider onSignedIn={onSignedIn} onSessionExpired={onSessionExpired}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </OidcSessionProvider>
    </QueryClientProvider>
  );
}
