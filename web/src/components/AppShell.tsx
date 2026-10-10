import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '../lib/cn';
import { shouldIgnoreShortcut } from '../lib/keyboard';
import { useAuth } from '../state/AuthContext';
import { CommandPalette } from './CommandPalette';
import { EventPeekProvider } from './EventPeek';
import { AdminShell } from './shell/AdminShell';
import { PublicShell } from './shell/PublicShell';
import { ADMIN_NAV, PUBLIC_NAV } from './shell/nav';

/**
 * One application, two shells. A student gets a page with a top bar; an
 * administrator gets a working surface with a sidebar. Both share the command
 * palette and the phone's bottom bar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The palette itself answers to the shortcut that opened it, so this
      // one is allowed through from a field; the rest are not.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (shouldIgnoreShortcut(event)) return;

      if (event.key === '/') {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (event.key.toLowerCase() === 'c' && isAdmin) {
        event.preventDefault();
        navigate('/admin/events/new');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAdmin, navigate]);

  const openSearch = () => setPaletteOpen(true);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised"
      >
        Skip to content
      </a>

      <EventPeekProvider>
        {isAdmin ? (
          <AdminShell onOpenSearch={openSearch}>{children}</AdminShell>
        ) : (
          <PublicShell onOpenSearch={openSearch}>{children}</PublicShell>
        )}
      </EventPeekProvider>

      <MobileNav isAdmin={isAdmin} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

/** Thumb-reachable navigation on phones, where a sidebar does not belong. */
function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const items = (isAdmin ? ADMIN_NAV : PUBLIC_NAV).filter((item) => item.primary);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur md:hidden"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 py-2.5 text-2xs font-medium transition-colors',
                isActive ? 'text-ink' : 'text-faint'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
