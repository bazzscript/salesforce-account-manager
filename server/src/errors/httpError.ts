/**
 * An error that is safe to send to the browser.
 *
 * Anything that is not an HttpError is treated as an unexpected failure and
 * replaced with a generic 500 by the error handler, so internal details
 * (stack traces, Salesforce payloads, credentials) can never leak by accident.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
