import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from '../api/client';
import { invalidate } from '../api/useQuery';
import type { Viewer } from '../api/types';

interface AuthValue {
  viewer: Viewer | null;
  /** True until we know whether a session exists. */
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signIn: (email: string, password: string) => Promise<Viewer>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * A value-free cookie the server sets alongside the HttpOnly session cookie.
 * Its only job is to tell the client that asking /auth/me is worthwhile, so a
 * student opening the calendar makes no authentication request at all (spec 36).
 */
const HINT_COOKIE = 'infin8_session_hint';

function hasSessionHint(): boolean {
  return document.cookie.split('; ').some((entry) => entry.startsWith(`${HINT_COOKIE}=`));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState<boolean>(hasSessionHint());

  useEffect(() => {
    if (!hasSessionHint()) {
      setLoading(false);
      return;
    }

    let active = true;
    api<{ user: Viewer | null }>('/auth/me')
      .then((response) => {
        if (active) setViewer(response.user);
      })
      .catch(() => {
        if (active) setViewer(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await api<{ user: Viewer }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    // Public responses were cached without admin fields; drop them all.
    invalidate();
    setViewer(response.user);
    return response.user;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      // A session that is already gone is still a successful sign out.
      if (!(error instanceof ApiError)) throw error;
    }
    invalidate();
    setViewer(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      viewer,
      loading,
      isAdmin: viewer !== null,
      isSuperAdmin: viewer?.role === 'super_admin',
      signIn,
      signOut,
    }),
    [viewer, loading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
