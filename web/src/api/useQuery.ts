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

  const reload = useCallback(() => {
    // Dropping the cached entry is what makes the effect fetch again.
    if (path) cache.delete(path);
    setReloadToken((value) => value + 1);
  }, [path]);

  return { data, error, loading, refreshing, reload };
}
