import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../errors/httpError.js';
import { toSalesforceHttpError } from '../salesforce/errors.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorBody = {
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `No API route matches ${req.method} ${req.originalUrl}.`,
    },
  };
  res.status(404).json(body);
};

function normalise(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  // express.json() throws a SyntaxError with a `body` property for bad JSON.
  if (error instanceof SyntaxError && 'body' in error) {
    return new HttpError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'entity.too.large'
  ) {
    return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large (32 KB maximum).');
  }

  const mapped = toSalesforceHttpError(error);

  // Unexpected errors keep their generic message; details stay in the server
  // log so internal information never reaches the browser.
  if (mapped.status >= 500 && mapped.code === 'INTERNAL_ERROR') {
    return new HttpError(
      500,
      'INTERNAL_ERROR',
      'Something went wrong while handling the request.',
    );
  }

  return mapped;
}

export function createErrorHandler(): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const httpError = normalise(error);

    if (httpError.status >= 500) {
      // Full detail stays server-side: stack traces and Salesforce payloads
      // can contain org metadata that the browser must not receive.
      console.error(`[error] ${req.method} ${req.originalUrl}`, error);
    }

    const body: ErrorBody = {
      error: {
        code: httpError.code,
        message: httpError.message,
        ...(httpError.details === undefined ? {} : { details: httpError.details }),
      },
    };

    res.status(httpError.status).json(body);
  };
}
