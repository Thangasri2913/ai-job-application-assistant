import {
  BadgeCheck,
  BarChart3,
  BellRing,
  Briefcase,
  FileText,
  GraduationCap,
  KanbanSquare,
  LayoutDashboard,
  type LucideIcon,
  Mic,
  Settings,
  Sparkles,
  Wand2,
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
  { label: 'Smart Apply', icon: Wand2, path: '/smart-apply', available: true },
  { label: 'Applications', icon: KanbanSquare, path: '/applications', available: true },
  { label: 'Resumes', icon: FileText, path: '/resumes', available: true },
  { label: 'Interview', icon: Mic, path: '/interviews', available: true },
  { label: 'Career Profile', icon: BadgeCheck, path: '/profile', available: true },
  { label: 'Career Intelligence', icon: BarChart3, path: '/career-intelligence', available: true },
  { label: 'Learn & Prepare', icon: GraduationCap, path: '/learn', available: true },
];

export const SECONDARY_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Settings', icon: Settings, path: '/settings', available: false },
];
