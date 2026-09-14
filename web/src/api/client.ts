import type { Conflict } from './types';

/**
 * A failed request, carrying the friendly message the API produced plus any
 * field errors or conflict details the form needs.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get fieldErrors(): Record<string, string> {
    if (this.code !== 'bad_request') return {};
    return isRecord(this.details) ? (this.details as Record<string, string>) : {};
  }

  get conflicts(): Conflict[] {
    if (!isRecord(this.details)) return [];
    const list = (this.details as { conflicts?: unknown }).conflicts;
    return Array.isArray(list) ? (list as Conflict[]) : [];
  }

  get canOverride(): boolean {
    return isRecord(this.details) && (this.details as { can_override?: boolean }).can_override === true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Sent as multipart instead of JSON. */
  formData?: FormData;
}

const OFFLINE_MESSAGE =
  'We could not reach the calendar service. Please check your connection and try again.';

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, formData } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    // Required by the server's CSRF guard on every state changing request.
    'X-Requested-With': 'infin8-calendar',
  };
  if (body !== undefined && !formData) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', OFFLINE_MESSAGE);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = isRecord(payload) ? (payload as { error?: unknown }).error : null;
    if (isRecord(error)) {
      throw new ApiError(
        response.status,
        String(error.code ?? 'error'),
        String(error.message ?? 'Something went wrong. Please try again.'),
        error.details
      );
    }
    throw new ApiError(
      response.status,
      'error',
      response.status >= 500
        ? 'Something went wrong on our side. Please try again in a moment.'
        : 'That request could not be completed.'
    );
  }

  return payload as T;
}

/** Serialises filters into a query string, dropping empty values. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const serialised = search.toString();
  return serialised ? `?${serialised}` : '';
}
