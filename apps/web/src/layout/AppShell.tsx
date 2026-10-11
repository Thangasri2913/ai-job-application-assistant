import { LogOut, Menu, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../features/auth/auth-context';
import { Badge } from '../shared/ui/Badge';
import { BrandMark } from '../shared/ui/BrandMark';
import { buttonClasses } from '../shared/ui/button-classes';
import { cn } from '../shared/ui/cn';
import { type NavItem, NAV_ITEMS, SECONDARY_NAV_ITEMS } from './nav-items';
import { NotificationBell } from '../features/job-discovery/components/NotificationBell';

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function NavList({ items, onNavigate }: { items: readonly NavItem[]; onNavigate: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map(({ label, icon: Icon, path, available }) => (
        <li key={path}>
          <NavLink
            to={path}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-soft text-primary'
                  : 'text-muted hover:bg-surface-muted hover:text-fg',
              )
            }
          >
            <Icon className="size-4.5 shrink-0" aria-hidden />
            <span className="flex-1">{label}</span>
            {!available ? <Badge>Soon</Badge> : null}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function AccountMenu() {
  const { user, signOut: endSession } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !containerRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setSigningOut(true);
    // Ends the Keycloak session too; Keycloak redirects back to /login.
    await endSession().catch(() => setSigningOut(false));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
      >
        {initialsOf(user?.fullName ?? '')}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
        >
          <div className="px-3 py-2.5">
            <div className="truncate text-sm font-semibold">{user?.fullName}</div>
            <div className="truncate text-sm text-muted">{user?.email}</div>
          </div>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const closeNav = () => setMobileNavOpen(false);

  // Close the mobile drawer whenever the route changes.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMobileNavOpen(false);
  }

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg"
      >
        Skip to main content
      </a>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={closeNav} aria-hidden />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface px-3 py-4 transition-transform lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-5 flex items-center justify-between px-2">
          <BrandMark />
          <button
            type="button"
            className="lg:hidden"
            aria-label="Close navigation"
            onClick={closeNav}
          >
            <X className="size-5" />
          </button>
        </div>
        <nav aria-label="Main" className="flex-1">
          <NavList items={NAV_ITEMS} onNavigate={closeNav} />
        </nav>
        <div className="border-t border-border pt-3">
          <NavList items={SECONDARY_NAV_ITEMS} onNavigate={closeNav} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
        <button
          type="button"
          className="-ml-1 rounded-lg p-2 hover:bg-surface-muted lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="size-5" />
        </button>
        <div className="flex-1" />
        <Link to="/jobs/new" className={buttonClasses('primary', 'md')}>
          <Plus className="size-4" aria-hidden />
          Add Job
        </Link>
        <NotificationBell />
        <AccountMenu />
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-8 outline-none sm:px-6"
      >
        <Outlet />
      </main>
    </div>
  );
}
