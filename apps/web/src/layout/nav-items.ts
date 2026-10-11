import {
  BadgeCheck,
  BarChart3,
  BellRing,
  Briefcase,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  type LucideIcon,
  Mic,
  Settings,
  Sparkles,
} from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  /** False while the feature is not built yet — shown with a "Soon" badge. */
  available: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', available: true },
  { label: 'Jobs', icon: Briefcase, path: '/jobs', available: true },
  { label: 'Recommendations', icon: Sparkles, path: '/recommendations', available: true },
  { label: 'Job Alerts', icon: BellRing, path: '/job-alerts', available: true },
  { label: 'Applications', icon: KanbanSquare, path: '/applications', available: true },
  { label: 'Resumes', icon: FileText, path: '/resumes', available: true },
  { label: 'Interview', icon: Mic, path: '/interviews', available: true },
  { label: 'Career Profile', icon: BadgeCheck, path: '/profile', available: true },
  { label: 'Analytics', icon: BarChart3, path: '/analytics', available: false },
];

export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Settings', icon: Settings, path: '/settings', available: false },
];
