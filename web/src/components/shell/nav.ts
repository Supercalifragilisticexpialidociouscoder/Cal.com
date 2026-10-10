import type { ComponentType, SVGProps } from 'react';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  HomeIcon,
  ListIcon,
  NoteIcon,
  SettingsIcon,
} from '../icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
  /** Shown in the phone's bottom bar as well as the sidebar. */
  primary?: boolean;
}

export const PUBLIC_NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: HomeIcon, end: true, primary: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon, primary: true },
  { to: '/events', label: 'Events', icon: ListIcon, primary: true },
  { to: '/upcoming', label: 'Upcoming', icon: ClockIcon },
];

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: HomeIcon, end: true, primary: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon, primary: true },
  { to: '/events', label: 'Events', icon: ListIcon },
  { to: '/admin/tasks', label: 'My tasks', icon: CheckCircleIcon, primary: true },
  { to: '/admin/notes', label: 'Quick notes', icon: NoteIcon, primary: true },
  { to: '/admin/manage', label: 'Administration', icon: SettingsIcon, end: true },
];
