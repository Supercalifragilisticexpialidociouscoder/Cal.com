import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../lib/cn';
import { useAuth } from '../state/AuthContext';
import { useTheme } from '../state/ThemeContext';
import { useToast } from '../state/ToastContext';
import { SearchDialog } from './SearchDialog';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const PUBLIC_NAV: NavItem[] = [
  { to: '/', label: 'Overview', end: true },
  { to: '/calendar', label: 'Calendar' },
  { to: '/events', label: 'Events' },
  { to: '/upcoming', label: 'Upcoming' },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/', label: 'Overview', end: true },
  { to: '/calendar', label: 'Calendar' },
  { to: '/events', label: 'Events' },
  { to: '/admin/tasks', label: 'My Tasks' },
  { to: '/admin/notes', label: 'Quick Notes' },
  { to: '/admin', label: 'Administration', end: true },
];

/**
 * One application, two experiences (spec 51). The public chrome is the whole
 * product; signing in adds capability to the same surface rather than swapping
 * in a separate admin console.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { viewer, isAdmin, signOut } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  // The compact navigation and the account dropdown are separate: they can
  // both be on screen at tablet widths, so one flag would open both.
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToast();

  const nav = isAdmin ? ADMIN_NAV : PUBLIC_NAV;

  useEffect(() => {
    setNavOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  // Cmd/Ctrl+K opens search, the convention people already expect.
  // Escape closes whichever menu is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        setAccountOpen(false);
        setNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    notify('You have been signed out.', 'info');
    navigate('/');
  };

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-hairline bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-[0.6875rem] font-bold text-accent-ink"
            >
              M
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight text-ink">
                MRTC Calendar
              </span>
              <span className="hidden text-2xs leading-tight text-muted sm:block">
                Events &middot; Activities &middot; Deadlines &middot; Schedule
              </span>
            </span>
          </Link>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 lg:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors',
                    isActive ? 'bg-accent-wash text-accent' : 'text-muted hover:bg-raised hover:text-ink'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="btn btn-sm btn-outline gap-2"
              aria-label="Search the calendar"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border border-edge bg-raised px-1 text-2xs font-medium text-faint lg:inline">
                ⌘K
              </kbd>
            </button>

            <ThemeToggle />

            {isAdmin ? (
              <>
                <Link to="/admin/events/new" className="btn btn-sm btn-primary hidden sm:inline-flex">
                  + Create Event
                </Link>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountOpen((open) => !open)}
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                    className="grid h-8 w-8 place-items-center rounded-full border border-edge bg-surface text-2xs font-semibold text-ink transition-colors hover:bg-raised"
                    aria-label="Account menu"
                  >
                    {initials(viewer?.name ?? '')}
                  </button>

                  {accountOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setAccountOpen(false)} aria-hidden="true" />
                      <div
                        role="menu"
                        className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-hairline bg-surface shadow-overlay animate-scale-in"
                      >
                        <div className="border-b border-hairline px-3.5 py-3">
                          <p className="truncate text-sm font-medium text-ink">{viewer?.name}</p>
                          <p className="truncate text-xs text-muted">{viewer?.email}</p>
                          <p className="mt-1.5 text-2xs font-semibold uppercase tracking-wider text-accent">
                            {viewer?.role === 'super_admin' ? 'Super Admin' : 'Staff Admin'}
                          </p>
                        </div>
                        <div className="p-1">
                          <MenuLink to="/admin" label="Admin overview" />
                          <MenuLink to="/admin/tasks" label="My tasks" />
                          <MenuLink to="/admin/notes" label="Quick notes" />
                          <MenuLink to="/admin/account" label="Account settings" />
                          <button
                            type="button"
                            role="menuitem"
                            onClick={handleSignOut}
                            className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
                          >
                            Sign out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : null}

            <button
              type="button"
              onClick={() => setNavOpen((open) => !open)}
              className="btn btn-sm btn-ghost px-2 lg:hidden"
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={navOpen}
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M2 4h12M2 8h12M2 12h12"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {navOpen && (
          <nav aria-label="Site" className="border-t border-hairline bg-surface px-4 py-2 lg:hidden">
            <div className="mx-auto grid max-w-6xl gap-0.5">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-accent-wash text-accent' : 'text-muted hover:bg-raised hover:text-ink'
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              {isAdmin && (
                <>
                  <NavLink
                    to="/admin/events/new"
                    className="rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-accent-wash"
                  >
                    + Create Event
                  </NavLink>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-lg px-3 py-2 text-left text-sm font-medium text-muted hover:bg-raised hover:text-ink"
                  >
                    Sign out
                  </button>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pb-10">
        {children}
      </main>

      <Footer isAdmin={isAdmin} />
      <MobileNav isAdmin={isAdmin} />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function MenuLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      role="menuitem"
      className={({ isActive }) =>
        cn(
          'block rounded-lg px-2.5 py-2 text-sm transition-colors',
          isActive ? 'bg-accent-wash text-accent' : 'text-muted hover:bg-raised hover:text-ink'
        )
      }
    >
      {label}
    </NavLink>
  );
}

function ThemeToggle() {
  const { mode, setMode, resolved } = useTheme();

  const next = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
  const labels = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' } as const;

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      className="btn btn-sm btn-ghost px-2"
      title={`${labels[mode]} - switch to ${labels[next].toLowerCase()}`}
      aria-label={`${labels[mode]}. Switch to ${labels[next].toLowerCase()}`}
    >
      {mode === 'system' ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
          <rect x="2" y="3" width="12" height="8.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.5 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : resolved === 'dark' ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
          <path
            d="M13 9.8A5.6 5.6 0 016.2 3 5.6 5.6 0 108.8 13c1.7 0 3.2-.8 4.2-2.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
          <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

/** Login lives here: discreet, never the first thing a student meets (spec 47). */
function Footer({ isAdmin }: { isAdmin: boolean }) {
  return (
    <footer className="mt-8 border-t border-hairline bg-surface/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 pb-24 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-5">
        <p>MRTC Calendar &middot; Everyone can see what is happening at MRTC.</p>
        <div className="flex items-center gap-3">
          <Link to="/upcoming" className="transition-colors hover:text-ink">
            Upcoming
          </Link>
          <span aria-hidden="true" className="text-faint">
            &middot;
          </span>
          {isAdmin ? (
            <Link to="/admin" className="transition-colors hover:text-ink">
              Admin overview
            </Link>
          ) : (
            <Link to="/login" className="transition-colors hover:text-ink">
              Admin Login
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}

/** Simplified bottom navigation on phones (spec 31). */
function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const items = isAdmin
    ? [
        { to: '/', label: 'Home', end: true, icon: HomeIcon },
        { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
        { to: '/admin/tasks', label: 'Tasks', icon: CheckIcon },
        { to: '/admin/notes', label: 'Notes', icon: NoteIcon },
      ]
    : [
        { to: '/', label: 'Home', end: true, icon: HomeIcon },
        { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
        { to: '/events', label: 'Events', icon: ListIcon },
      ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur sm:hidden"
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ to, label, end, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 py-2.5 text-2xs font-medium transition-colors',
                isActive ? 'text-accent' : 'text-muted'
              )
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
      <path
        d="M3 9l7-5.5L17 9v7.5a1 1 0 01-1 1h-3.5V12h-5v5.5H4a1 1 0 01-1-1V9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
      <path
        d="M6.5 5.5h10M6.5 10h10M6.5 14.5h10M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
      <path
        d="M4 10.5l3.5 3.5L16 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
      <path
        d="M5 3h7l3.5 3.5V17a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M11.5 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
