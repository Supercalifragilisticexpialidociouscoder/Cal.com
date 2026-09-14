/**
 * Every failure the API reports goes through AppError so the client always
 * receives a human sentence, never "500 Internal Server Error" (spec 41).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'We could not find what you were looking for.') =>
  new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

export const tooManyRequests = (message: string) =>
  new AppError(429, 'too_many_requests', message);

export const payloadTooLarge = (message: string) =>
  new AppError(413, 'payload_too_large', message);
