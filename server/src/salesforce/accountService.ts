import type { SaveResult } from 'jsforce';
import type { Account, AccountPatch, AccountInput } from '../types/account.js';
import type { AccountService } from '../types/services.js';
import { HttpError } from '../errors/httpError.js';
import { withSalesforceConnection } from './client.js';
import { toSalesforceHttpError } from './errors.js';
import { escapeSoqlString } from './soql.js';

const PAGE_SIZE = 20;

/**
 * The query from the brief, plus an ORDER BY so a brand-new account is visible
 * immediately at the top of the list. Only the three fields the UI needs are
 * requested — ask for less, pay for less.
 */
const LIST_ACCOUNTS_SOQL = `
  SELECT Id, Name, Industry
  FROM Account
  ORDER BY LastModifiedDate DESC
  LIMIT ${PAGE_SIZE}
`.trim();

const ACCOUNT_FIELDS = 'Id, Name, Industry';

type SalesforceAccountRecord = {
  Id: string;
  Name: string;
  Industry: string | null;
};

type SavedAccount = Extract<SaveResult, { success: true }>;

function toAccount(record: SalesforceAccountRecord): Account {
  return {
    id: record.Id,
    name: record.Name,
    industry: record.Industry ?? null,
  };
}

/**
 * jsforce throws on hard API failures, but a SaveResult can still describe a
 * rejected record. Reuse the central translator so the response has the same
 * shape as every other Salesforce failure.
 */
function assertSaved(result: SaveResult, action: string): asserts result is SavedAccount {
  if (result.success) return;

  const firstError = result.errors[0];
  throw toSalesforceHttpError({
    errorCode: firstError?.errorCode,
    message: firstError?.message ?? `Salesforce could not ${action} the account.`,
  });
}

async function readAccount(id: string): Promise<Account> {
  const soql = `SELECT ${ACCOUNT_FIELDS} FROM Account WHERE Id = '${escapeSoqlString(id)}' LIMIT 1`;
  const result = await withSalesforceConnection((connection) =>
    connection.query<SalesforceAccountRecord>(soql),
  );

  const record = result.records[0];
  if (!record) {
    throw new HttpError(
      404,
      'ACCOUNT_NOT_FOUND',
      'That account no longer exists in Salesforce. Refresh the list and try again.',
    );
  }

  return toAccount(record);
}

export function createSalesforceAccountService(): AccountService {
  return {
    async list() {
      const result = await withSalesforceConnection((connection) =>
        connection.query<SalesforceAccountRecord>(LIST_ACCOUNTS_SOQL),
      );
      return result.records.map(toAccount);
    },

    async create(input: AccountInput) {
      const payload: { Name: string; Industry?: string } = { Name: input.name };
      if (input.industry !== null) payload.Industry = input.industry;

      const result = await withSalesforceConnection((connection) =>
        connection.sobject('Account').create(payload),
      );
      assertSaved(result, 'create');

      // Building the response from the validated input avoids a second API
      // call, and therefore avoids consuming extra daily API requests.
      return { id: result.id, name: input.name, industry: input.industry };
    },

    async update(id: string, patch: AccountPatch) {
      const payload: { Id: string; Name?: string; Industry?: string | null } = { Id: id };
      if (patch.name !== undefined) payload.Name = patch.name;
      if (patch.industry !== undefined) payload.Industry = patch.industry;

      const result = await withSalesforceConnection((connection) =>
        connection.sobject('Account').update(payload),
      );
      assertSaved(result, 'update');

      // Read-after-write only for updates: the UI needs fields the PATCH did
      // not include. Reading is idempotent, so a session retry is safe here.
      return readAccount(id);
    },

    async remove(id: string) {
      const result = await withSalesforceConnection((connection) =>
        connection.sobject('Account').destroy(id),
      );
      assertSaved(result, 'delete');
    },
  };
}
