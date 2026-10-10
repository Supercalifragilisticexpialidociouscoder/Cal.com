import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './client';

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

/**
 * A small module level cache. Switching between Month, Week and Agenda, or
 * stepping back to a month already visited, renders from memory instead of
 * waiting on the network (spec 36).
 */
const cache = new Map<string, CacheEntry>();

/**
 * Requests in flight, keyed by path, so several panels asking for the same
 * data cause one round trip.
 *
 * These promises are deliberately never aborted. They are shared, so cancelling
 * on behalf of one subscriber would reject the promise the others are waiting
 * on; and a response that arrives after a component unmounts still usefully
 * warms the cache. Components guard their own setState instead.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Mounted readers, keyed by path. A cache entry rewritten in place has to
 * reach the components already showing it, which is what makes an optimistic
 * update appear everywhere at once rather than only where it was clicked.
 */
const readers = new Map<string, Set<() => void>>();

function announce(path: string): void {
  for (const listener of readers.get(path) ?? []) listener();
}

/**
 * Rewrites every cached entry under `prefix` without refetching.
 *
 * Use it for a change whose result is already known - ticking a checklist
 * item, say. The server is still the authority: callers re-request afterwards,
 * and `invalidate` undoes this if the request fails.
 */
export function patchCache<T>(prefix: string, update: (data: T) => T): void {
  for (const [key, entry] of [...cache.entries()]) {
    if (!key.startsWith(prefix)) continue;
    try {
      cache.set(key, { data: update(entry.data as T), fetchedAt: entry.fetchedAt });
    } catch {
      // A shape we did not expect: drop it rather than render something wrong.
      cache.delete(key);
    }
    announce(key);
  }
}

export function invalidate(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function peek<T>(path: string): T | undefined {
  return cache.get(path)?.data as T | undefined;
}

/** Every cached payload under `prefix`, for looking something up by hand. */
export function peekAll<T>(prefix: string): T[] {
  const found: T[] = [];
  for (const [key, entry] of cache) {
    if (key.startsWith(prefix)) found.push(entry.data as T);
  }
  return found;
}

function load<T>(path: string): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;

  const request = api<T>(path)
    .then((result) => {
      cache.set(path, { data: result, fetchedAt: Date.now() });
      inflight.delete(path);
      return result;
    })
    .catch((error: unknown) => {
      inflight.delete(path);
      throw error;
    });

  inflight.set(path, request);
  return request;
}

interface QueryState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  /** True while revalidating data that was served from cache. */
  refreshing: boolean;
  reload: () => void;
}

interface QueryOptions {
  /** How long a cached entry is served without a network request, in ms. */
  staleMs?: number;
  enabled?: boolean;
}

export function useQuery<T>(path: string | null, options: QueryOptions = {}): QueryState<T> {
  const { staleMs = 15_000, enabled = true } = options;
  const active = enabled && path !== null;

  // Held in a ref so that a changing freshness window - which happens when the
  // session resolves and admin data becomes shorter lived - never by itself
  // re-runs the effect and re-requests data already in hand.
  const staleRef = useRef(staleMs);
  staleRef.current = staleMs;

  const cached = active ? cache.get(path) : undefined;
  const [data, setData] = useState<T | undefined>(cached?.data as T | undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(active && cached === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!active || path === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const entry = cache.get(path);

    if (entry) {
      setData(entry.data as T);
      setError(null);
      setLoading(false);
      // Fresh enough: serve from memory and make no request at all.
      if (Date.now() - entry.fetchedAt < staleRef.current) return;
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    load<T>(path)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof ApiError
            ? cause
            : new ApiError(0, 'error', 'Something went wrong. Please try again.')
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, active, reloadToken]);

  // Keep in step with optimistic rewrites of this path's cache entry.
  useEffect(() => {
    if (!active || path === null) return;

    const listener = () => {
      const entry = cache.get(path);
      if (entry) setData(entry.data as T);
    };

    let set = readers.get(path);
    if (!set) {
      set = new Set();
      readers.set(path, set);
    }
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) readers.delete(path);
    };
  }, [path, active]);

  const reload = useCallback(() => {
    // Dropping the cached entry is what makes the effect fetch again.
    if (path) cache.delete(path);
    setReloadToken((value) => value + 1);
  }, [path]);

  return { data, error, loading, refreshing, reload };
}
