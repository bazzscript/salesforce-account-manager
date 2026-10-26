import { z } from 'zod';
import { HttpError } from '../errors/httpError.js';

export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * Parses a request body with Zod and converts failures into a 400 HttpError.
 * Field-level details let the Vue form render messages next to each input.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    const details: FieldIssue[] = result.error.issues.map((issue) => ({
      field: issue.path.map(String).join('.') || 'body',
      message: issue.message,
    }));

    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      details[0]?.message ?? 'Please check the submitted values.',
      details,
    );
  }

  return result.data;
}

const SALESFORCE_ID = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;

/** Rejects junk before it becomes part of a URL or a SOQL query. */
export function parseAccountId(rawId: string | undefined): string {
  if (!rawId || !SALESFORCE_ID.test(rawId)) {
    throw new HttpError(
      400,
      'INVALID_ACCOUNT_ID',
      'The account id is not a valid Salesforce id.',
    );
  }
  return rawId;
}
