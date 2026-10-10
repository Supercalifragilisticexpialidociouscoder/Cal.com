import { Link, NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { SearchIcon } from '../icons';
import { ThemeControl } from './ThemeControl';
import { PUBLIC_NAV } from './nav';

/**
 * The public shell stays a light top bar over a muted ground - the shape of a
 * page you land on from a link, not an application you work in. Students get
 * no sidebar, no admin chrome, and nothing to sign into.
 */
export function PublicShell({
  children,
  onOpenSearch,
}: {
  children: React.ReactNode;
  onOpenSearch: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-[0.625rem] font-bold text-accent-ink"
            >
              i8
            </span>
            <span className="truncate text-sm font-semibold text-ink">Infin8 Calendar</span>
          </Link>

          <nav aria-label="Main" className="ml-3 hidden items-center gap-0.5 sm:flex">
            {PUBLIC_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-medium transition-colors',
                    isActive ? 'bg-emphasis text-ink' : 'text-muted hover:bg-raised hover:text-ink'
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
              onClick={onOpenSearch}
              className="btn btn-sm btn-outline gap-2"
              aria-label="Search the calendar"
            >
              <SearchIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border border-hairline bg-raised px-1 text-2xs font-medium text-faint lg:inline">
                ⌘K
              </kbd>
            </button>
            <ThemeControl />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 sm:px-6 sm:pb-10">
        {children}
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-5 pb-24 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-5">
          <p>Infin8 Calendar &middot; Everyone can see what is happening at MRTC.</p>
          <div className="flex items-center gap-3">
            <Link to="/upcoming" className="transition-colors hover:text-ink">
              Upcoming
            </Link>
            <span aria-hidden="true" className="text-faint">
              &middot;
            </span>
            <Link to="/login" className="transition-colors hover:text-ink">
              Admin Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
