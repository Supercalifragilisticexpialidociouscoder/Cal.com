import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';
import {
  CloseIcon,
  LogOutIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from '../icons';
import { ThemeControl } from './ThemeControl';
import { ADMIN_NAV } from './nav';

/**
 * The administrator shell: a left sidebar on the muted ground with the working
 * area in white beside it. That split is the most recognisable part of
 * Cal.com's application layout, and it earns its place here - the sidebar
 * holds a stable set of destinations while the content area changes.
 *
 * Below `md` the sidebar collapses into a slide-over, and the phone keeps the
 * bottom bar, which is a better fit for a thumb than a rail.
 */
export function AdminShell({
  children,
  onOpenSearch,
}: {
  children: React.ReactNode;
  onOpenSearch: () => void;
}) {
  const { viewer, signOut } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDrawerOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [accountOpen]);

  const handleSignOut = async () => {
    await signOut();
    notify('You have been signed out.', 'info');
    navigate('/');
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-1 px-2 py-3 lg:px-3">
      {/* Account first, the way Cal.com puts identity at the top of the rail. */}
      <div className="relative mb-1" ref={accountRef}>
        <button
          type="button"
          onClick={() => setAccountOpen((open) => !open)}
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors',
            'hover:bg-emphasis'
          )}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-[0.625rem] font-bold text-accent-ink">
            i8
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-sm font-medium text-ink">{viewer?.name}</span>
            <span className="block truncate text-2xs text-muted">
              {viewer?.role === 'super_admin' ? 'Super Admin' : 'Staff Admin'}
            </span>
          </span>
        </button>

        {accountOpen && (
          <div
            role="menu"
            className="absolute left-0 right-0 top-full z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-hairline bg-surface shadow-overlay animate-scale-in"
          >
            <div className="border-b border-hairline px-3 py-2">
              <p className="truncate text-xs text-muted">{viewer?.email}</p>
            </div>
            <div className="p-1">
              <NavLink
                to="/admin/account"
                role="menuitem"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <SettingsIcon className="h-4 w-4" />
                Account settings
              </NavLink>
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <LogOutIcon className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        className={cn(
          'mb-1 flex w-full items-center gap-2 rounded-lg border border-edge bg-surface px-2 py-1.5',
          'text-sm text-faint transition-colors hover:border-edge-strong'
        )}
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="hidden flex-1 text-left lg:block">Search</span>
        <kbd className="hidden rounded border border-hairline bg-raised px-1 text-2xs font-medium text-faint lg:block">
          ⌘K
        </kbd>
      </button>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {ADMIN_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-emphasis text-ink'
                  : 'text-muted hover:bg-raised hover:text-ink'
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="hidden truncate lg:block">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-3 hidden lg:block">
        <NavLink to="/admin/events/new" className="btn btn-md btn-primary w-full">
          <PlusIcon className="h-4 w-4" />
          New event
        </NavLink>
      </div>
      <NavLink
        to="/admin/events/new"
        title="New event"
        className="btn btn-md btn-primary mt-3 px-0 lg:hidden"
      >
        <PlusIcon className="h-4 w-4" />
      </NavLink>

      <div className="mt-auto flex flex-col gap-1 pt-3">
        <ThemeControl compact />
        <NavLink
          to="/"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-faint transition-colors hover:bg-raised hover:text-ink"
          title="Public calendar"
        >
          <span className="hidden lg:block">View public calendar</span>
          <span className="lg:hidden">↗</span>
        </NavLink>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-14 shrink-0 border-r border-hairline bg-canvas md:block lg:w-60">
        {sidebar}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-hairline bg-canvas shadow-overlay animate-slide-in-left">
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-hairline bg-surface/90 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="btn btn-sm btn-ghost px-2"
            aria-label="Open menu"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-ink">Infin8 Calendar</span>
          <button
            type="button"
            onClick={onOpenSearch}
            className="btn btn-sm btn-ghost ml-auto px-2"
            aria-label="Search"
          >
            <SearchIcon className="h-5 w-5" />
          </button>
        </header>

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pb-10 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function DrawerCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn btn-sm btn-ghost px-2" aria-label="Close menu">
      <CloseIcon className="h-4 w-4" />
    </button>
  );
}
