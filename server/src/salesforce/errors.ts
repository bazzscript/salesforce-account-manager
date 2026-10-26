import { HttpError } from '../errors/httpError.js';

/**
 * jsforce throws plain objects for API failures, arrays of objects for bulk
 * results, and Node.js `code` errors for network failures. This module turns
 * all of that into a small, consistent set of HttpErrors that the browser can
 * display.
 */

interface SalesforceErrorShape {
  errorCode?: string;
  message?: string;
  error?: string;
  error_description?: string;
  name?: string;
  code?: string;
  statusCode?: number;
}

function flatten(error: unknown, depth = 0): SalesforceErrorShape[] {
  if (depth > 4 || error === null || error === undefined) return [];
  if (Array.isArray(error)) return error.flatMap((entry) => flatten(entry, depth + 1));
  if (typeof error === 'string') return [{ message: error }];
  if (error instanceof Error) return [error as Error & SalesforceErrorShape];
  if (typeof error === 'object') return [error as SalesforceErrorShape];
  return [];
}

const SESSION_CODES = new Set(['INVALID_SESSION_ID', 'INVALID_AUTH_HEADER']);

export function isSalesforceSessionError(error: unknown): boolean {
  return flatten(error).some((part) => {
    const code = part.errorCode ?? part.name ?? '';
    return SESSION_CODES.has(code);
  });
}

const AUTH_CODES = new Set([
  'invalid_client_id',
  'invalid_client',
  'invalid_client_secret',
  'invalid_grant',
  'unauthorized_client',
  'invalid_request',
]);

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const QUERY_CODES = new Set([
  'INVALID_FIELD',
  'MALFORMED_QUERY',
  'INVALID_QUERY_FILTER_OPERATOR',
  'INVALID_TYPE',
  'INVALID_SOAP_HEADER',
]);

const VALIDATION_CODES = new Set([
  'REQUIRED_FIELD_MISSING',
  'STRING_TOO_LONG',
  'INVALID_EMAIL_ADDRESS',
  'FIELD_CUSTOM_VALIDATION_EXCEPTION',
  'INVALID_INPUT',
]);

const UNAVAILABLE_CODES = new Set([
  'SERVER_UNAVAILABLE',
  'UNABLE_TO_LOCK_ROW',
  'UNKNOWN_EXCEPTION',
  'SERVICE_UNAVAILABLE',
]);

export function toSalesforceHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  const parts = flatten(error);
  const primary = parts[0] ?? {};
  const salesforceCode = primary.errorCode ?? primary.error;
  const namedCode = primary.name && primary.name !== 'Error' ? primary.name : undefined;
  const code = salesforceCode ?? primary.code ?? namedCode ?? '';
  // Only surface messages that came from Salesforce. A plain Node.js Error may
  // contain internal details, so it is replaced with a generic 500 message.
  const rawMessage =
    salesforceCode || primary.statusCode ? (primary.message ?? primary.error_description ?? '') : '';

  if (NETWORK_CODES.has(code)) {
    return new HttpError(
      503,
      'SALESFORCE_UNREACHABLE',
      'Could not reach Salesforce. Check the server’s network connection and SF_LOGIN_URL, then try again.',
    );
  }

  if (AUTH_CODES.has(code)) {
    return new HttpError(
      502,
      'SALESFORCE_AUTH_FAILED',
      'Salesforce rejected the server credentials. Check SF_CLIENT_ID, SF_CLIENT_SECRET and the External Client App’s Client Credentials Flow settings.',
    );
  }

  if (SESSION_CODES.has(code)) {
    return new HttpError(
      401,
      'SALESFORCE_SESSION_EXPIRED',
      'Salesforce did not accept the server session. Please try again in a moment.',
    );
  }

  switch (code) {
    case 'REQUEST_LIMIT_EXCEEDED':
      return new HttpError(
        429,
        'SALESFORCE_LIMIT_EXCEEDED',
        'The org’s daily Salesforce API limit has been reached. Try again after the limit resets.',
      );
    case 'NOT_FOUND':
    case 'ENTITY_IS_DELETED':
      return new HttpError(
        404,
        'ACCOUNT_NOT_FOUND',
        'That account no longer exists in Salesforce. Refresh the list and try again.',
      );
    case 'MALFORMED_ID':
    case 'INVALID_ID_FIELD':
      return new HttpError(400, 'INVALID_ACCOUNT_ID', 'The account id is not a valid Salesforce id.');
    case 'DUPLICATE_VALUE':
      return new HttpError(
        409,
        'DUPLICATE_ACCOUNT',
        rawMessage || 'Salesforce rejected the account as a duplicate.',
      );
    default:
      break;
  }

  if (QUERY_CODES.has(code)) {
    return new HttpError(
      400,
      'SALESFORCE_BAD_QUERY',
      rawMessage
        ? `Salesforce rejected the query: ${rawMessage}`
        : 'Salesforce rejected the query. Check the configured API version.',
    );
  }

  if (VALIDATION_CODES.has(code)) {
    return new HttpError(
      422,
      'SALESFORCE_VALIDATION_FAILED',
      rawMessage || 'Salesforce validation rules rejected this account.',
    );
  }

  if (UNAVAILABLE_CODES.has(code)) {
    return new HttpError(
      503,
      'SALESFORCE_UNAVAILABLE',
      'Salesforce is temporarily unavailable. Please retry shortly.',
    );
  }

  if (primary.statusCode === 401) {
    return new HttpError(
      502,
      'SALESFORCE_AUTH_FAILED',
      'Salesforce rejected the server credentials. Check the External Client App settings.',
    );
  }

  if (rawMessage) {
    // Salesforce messages are written for humans and are safe to surface,
    // but never echo error_description from OAuth failures.
    return new HttpError(502, 'SALESFORCE_ERROR', `Salesforce could not complete the request: ${rawMessage}`);
  }

  return new HttpError(
    500,
    'INTERNAL_ERROR',
    'Something went wrong while handling the request.',
  );
}
