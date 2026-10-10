import type { Response } from 'express';

/**
 * Cache headers for a response whose body depends on who is asking.
 *
 * Public calendar data is worth caching for a moment (spec 36), but the same
 * URL returns more to a signed-in administrator. Without `Vary: Cookie` a
 * browser - or any shared cache in front of the API - is entitled to replay
 * the anonymous body to an administrator who has just signed in, which shows
 * them a page with the admin half missing.
 */
export function cacheByViewer(res: Response, isViewer: boolean, publicMaxAge = 30): void {
  res.vary('Cookie');
  res.setHeader(
    'Cache-Control',
    isViewer ? 'no-store' : `public, max-age=${publicMaxAge}, stale-while-revalidate=${publicMaxAge * 4}`
  );
}

/** A response that is never cacheable, whoever asked for it. */
export function noStore(res: Response): void {
  res.vary('Cookie');
  res.setHeader('Cache-Control', 'no-store');
}
