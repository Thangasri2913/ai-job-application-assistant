import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BackHandler } from 'react-native';

/**
 * Navigation: a bottom tab bar for the four primary areas, each with its own stack, so
 * switching tabs never loses your place. Android back pops the current stack, then returns to
 * Home, then leaves the app. Kept dependency-free on purpose (see docs/MOBILE.md).
 */
export const TABS = ['home', 'jobs', 'applications', 'profile'] as const;
export type Tab = (typeof TABS)[number];

export type Route =
  | { name: 'home' }
  | { name: 'questions' }
  | { name: 'jobs' }
  | { name: 'job'; jobId: string; recommendationId?: string }
  | { name: 'applications' }
  | { name: 'application'; id: string }
  | { name: 'trackedApplication'; id: string }
  | { name: 'materials'; id: string }
  | { name: 'profile' }
  | { name: 'resumes' }
  | { name: 'smartApplySettings' }
  | { name: 'savedAnswers' };

const ROOT: Record<Tab, Route> = {
  home: { name: 'home' },
  jobs: { name: 'jobs' },
  applications: { name: 'applications' },
  profile: { name: 'profile' },
};

/** A screen can block leaving it (e.g. unsaved changes); resolve true to allow. */
type Guard = () => Promise<boolean>;

interface Nav {
  tab: Tab;
  route: Route;
  /** Depth of the current tab's stack (1 = its root screen). */
  depth: number;
  push: (route: Route) => void;
  /** Switch to a tab (and optionally open a screen in it). Re-selecting a tab returns to its root. */
  navigate: (tab: Tab, route?: Route) => void;
  back: () => Promise<boolean>;
  setGuard: (guard: Guard | null) => void;
}

const NavContext = createContext<Nav | null>(null);

export function NavigationProvider({
  children,
  initialTab = 'home',
}: {
  children: ReactNode;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>({
    home: [ROOT.home],
    jobs: [ROOT.jobs],
    applications: [ROOT.applications],
    profile: [ROOT.profile],
  });
  const guard = useRef<Guard | null>(null);
  const state = useRef({ tab, stacks });
  state.current = { tab, stacks };

  const leave = useCallback(async () => {
    if (!guard.current) return true;
    const ok = await guard.current();
    if (ok) guard.current = null;
    return ok;
  }, []);

  const push = useCallback((route: Route) => {
    setStacks((s) => {
      const t = state.current.tab;
      return { ...s, [t]: [...s[t], route] };
    });
  }, []);

  const navigate = useCallback(
    (target: Tab, route?: Route) => {
      void (async () => {
        const { tab: current, stacks: s } = state.current;
        if (target === current && !route && s[target].length > 1) {
          if (!(await leave())) return;
          setStacks((prev) => ({ ...prev, [target]: [ROOT[target]] }));
          return;
        }
        if (target !== current && !(await leave())) return;
        setTab(target);
        if (route) setStacks((prev) => ({ ...prev, [target]: [ROOT[target], route] }));
      })();
    },
    [leave],
  );

  const back = useCallback(async () => {
    const { tab: current, stacks: s } = state.current;
    if (s[current].length > 1) {
      if (!(await leave())) return true;
      setStacks((prev) => ({ ...prev, [current]: prev[current].slice(0, -1) }));
      return true;
    }
    if (current !== 'home') {
      setTab('home');
      return true;
    }
    return false;
  }, [leave]);

  // Android back button.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const { tab: current, stacks: s } = state.current;
      if (s[current].length <= 1 && current === 'home') return false; // leave the app
      void back();
      return true;
    });
    return () => sub.remove();
  }, [back]);

  const setGuard = useCallback((g: Guard | null) => {
    guard.current = g;
  }, []);

  const stack = stacks[tab];
  const value = useMemo<Nav>(
    () => ({
      tab,
      route: stack[stack.length - 1]!,
      depth: stack.length,
      push,
      navigate,
      back,
      setGuard,
    }),
    [tab, stack, push, navigate, back, setGuard],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav must be used inside NavigationProvider');
  return nav;
}
