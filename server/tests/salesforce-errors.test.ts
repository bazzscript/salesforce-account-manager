import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/errors/httpError.js';
import { isSalesforceSessionError, toSalesforceHttpError } from '../src/salesforce/errors.js';

describe('toSalesforceHttpError', () => {
  it('keeps an HttpError exactly as it was', () => {
    const original = new HttpError(418, 'TEAPOT', 'Short and stout.');
    expect(toSalesforceHttpError(original)).toBe(original);
  });

  it('maps a revoked session to a 401 the UI can retry', () => {
    const mapped = toSalesforceHttpError({
      errorCode: 'INVALID_SESSION_ID',
      message: 'Session expired or invalid',
    });

    expect(mapped.status).toBe(401);
    expect(mapped.code).toBe('SALESFORCE_SESSION_EXPIRED');
    expect(mapped.message).not.toContain('Session expired or invalid');
  });

  it('maps an OAuth client error to an actionable 502 without echoing the description', () => {
    const mapped = toSalesforceHttpError({
      error: 'invalid_client_id',
      error_description: 'client identifier invalid',
    });

    expect(mapped.status).toBe(502);
    expect(mapped.code).toBe('SALESFORCE_AUTH_FAILED');
    expect(mapped.message).toContain('SF_CLIENT_ID');
    expect(mapped.message).not.toContain('client identifier invalid');
  });

  it('maps daily API limits to 429', () => {
    const mapped = toSalesforceHttpError({
      errorCode: 'REQUEST_LIMIT_EXCEEDED',
      message: 'TotalRequests Limit exceeded.',
    });

    expect(mapped.status).toBe(429);
    expect(mapped.code).toBe('SALESFORCE_LIMIT_EXCEEDED');
  });

  it('maps a deleted record to 404', () => {
    const mapped = toSalesforceHttpError({
      errorCode: 'ENTITY_IS_DELETED',
      message: 'entity is deleted',
    });

    expect(mapped.status).toBe(404);
    expect(mapped.code).toBe('ACCOUNT_NOT_FOUND');
  });

  it('maps duplicates to 409 and keeps Salesforce’s human-readable message', () => {
    const mapped = toSalesforceHttpError({
      errorCode: 'DUPLICATE_VALUE',
      message: 'An account with this name already exists.',
    });

    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe('DUPLICATE_ACCOUNT');
    expect(mapped.message).toBe('An account with this name already exists.');
  });

  it('uses the first error when jsforce returns an array', () => {
    const mapped = toSalesforceHttpError([
      { errorCode: 'MALFORMED_ID', message: 'bad id' },
      { errorCode: 'UNKNOWN_EXCEPTION', message: 'ignored' },
    ]);

    expect(mapped.code).toBe('INVALID_ACCOUNT_ID');
    expect(mapped.status).toBe(400);
  });

  it('maps network failures to 503, not a stack trace', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const mapped = toSalesforceHttpError(error);

    expect(mapped.status).toBe(503);
    expect(mapped.code).toBe('SALESFORCE_UNREACHABLE');
    expect(mapped.message).toContain('Could not reach Salesforce');
  });

  it('falls back to a safe 500 for unknown errors', () => {
    const mapped = toSalesforceHttpError(new Error('database password is hunter2'));

    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe('INTERNAL_ERROR');
    expect(mapped.message).not.toContain('hunter2');
  });
});

describe('isSalesforceSessionError', () => {
  it('detects session errors in nested arrays', () => {
    expect(isSalesforceSessionError([{ errorCode: 'INVALID_SESSION_ID' }])).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isSalesforceSessionError({ errorCode: 'DUPLICATE_VALUE' })).toBe(false);
    expect(isSalesforceSessionError(null)).toBe(false);
  });
});
