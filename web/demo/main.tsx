import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from '../src/App';
import { AuthProvider } from '../src/state/AuthContext';
import { ThemeProvider } from '../src/state/ThemeContext';
import { ToastProvider } from '../src/state/ToastContext';
import { installMockApi } from './mockFetch';
import '../src/index.css';
import './demo.css';

/**
 * Demo entry point.
 *
 * Identical to src/main.tsx except that the Calendar API is replaced by an
 * in-browser store, and routing is hash based so the app can be served as
 * static files without a server rewriting unknown paths to index.html.
 */
installMockApi();

// The demo has no session cookie, so clear any stale hint the app looks for.
document.cookie = 'infin8_session_hint=; Max-Age=0; path=/';

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing');

createRoot(container).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <DemoBanner />
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>
);

/**
 * Says plainly that this is a preview with sample data, so nothing here is
 * mistaken for MRTC's real schedule.
 */
function DemoBanner() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="border-b border-attention-edge bg-attention-wash text-attention-text">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <span
            aria-hidden="true"
            className="grid h-4 w-4 place-items-center rounded-full bg-attention/25 text-[0.625rem] font-bold"
          >
            i
          </span>
          Demo
        </span>
        <span className="min-w-0 flex-1">
          Sample data, not MRTC's real schedule. Everything you change stays in this browser tab.
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md border border-attention-edge px-2 py-0.5 font-medium transition-colors hover:bg-attention/15"
          aria-expanded={open}
        >
          {open ? 'Hide sign-in details' : 'Admin sign-in details'}
        </button>
      </div>

      {open && (
        <div className="mx-auto max-w-6xl px-4 pb-3 text-xs sm:px-6">
          <div className="rounded-lg border border-attention-edge bg-surface/70 p-3 text-ink dark:bg-black/20">
            <p className="mb-2 text-muted">
              Sign in from <strong className="text-ink">Admin Login</strong> in the footer to see the
              administrator experience. Public visitors never need an account.
            </p>
            <ul className="space-y-1 font-mono text-2xs">
              <li>
                <span className="text-muted">Super Admin</span> &nbsp;admin@mrtc.edu &nbsp;/&nbsp; infin8-super-admin
              </li>
              <li>
                <span className="text-muted">Staff Admin</span> &nbsp;staff1@mrtc.edu &nbsp;/&nbsp; infin8-staff-one
              </li>
              <li>
                <span className="text-muted">Staff Admin</span> &nbsp;staff2@mrtc.edu &nbsp;/&nbsp; infin8-staff-two
              </li>
            </ul>
            <p className="mt-2 text-2xs text-muted">
              These are the seeded development credentials from .env.example, not real accounts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
