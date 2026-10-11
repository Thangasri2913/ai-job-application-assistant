import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../../../shared/ui/Spinner';
import { useAuth } from '../auth-context';
import { AuthErrorPage } from '../pages/AuthErrorPage';

/** Renders child routes only for signed-in users; otherwise sends them to /login (never straight to Keycloak, to avoid loops). */
export function RequireAuth() {
  const { isAuthenticated, isLoading, error } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageSpinner label="Signing you in" />;
  if (error) return <AuthErrorPage message={error} />;
  if (!isAuthenticated) {
    const returnUrl = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(returnUrl)}`} replace />;
  }
  return <Outlet />;
}

/** The login page is only for signed-out users. */
export function RedirectIfAuthenticated() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner label="Loading" />;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
