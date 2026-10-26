import { Connection, OAuth2 } from 'jsforce';
import { env } from '../config/env.js';
import { isSalesforceSessionError } from './errors.js';

/**
 * A single, lazily-created jsforce connection.
 *
 * Client Credentials Flow issues an access token that lives for the org's
 * session timeout (2 hours by default). We recycle the connection well before
 * that, and also rebuild it once if Salesforce answers INVALID_SESSION_ID.
 */
const CONNECTION_TTL_MS = 90 * 60 * 1000;

let cached: { promise: Promise<Connection>; createdAt: number } | null = null;

function credentials(): { clientId: string; clientSecret: string } {
  if (!env.SF_CLIENT_ID || !env.SF_CLIENT_SECRET) {
    throw new Error(
      'Salesforce credentials are missing. Set SF_CLIENT_ID and SF_CLIENT_SECRET in server/.env.',
    );
  }
  return { clientId: env.SF_CLIENT_ID, clientSecret: env.SF_CLIENT_SECRET };
}

async function openConnection(): Promise<Connection> {
  const { clientId, clientSecret } = credentials();

  // jsforce 3 has no dedicated clientCredentialsFlow() helper, but its OAuth2
  // client posts any grant_type to /services/oauth2/token. This is the OAuth
  // 2.0 Client Credentials grant: no browser, no user, no refresh token.
  const oauth2 = new OAuth2({
    loginUrl: env.SF_LOGIN_URL,
    clientId,
    clientSecret,
  });

  const token = await oauth2.requestToken({ grant_type: 'client_credentials' });

  return new Connection({
    instanceUrl: token.instance_url,
    accessToken: token.access_token,
    version: env.SF_API_VERSION,
  });
}

export function getConnection(): Promise<Connection> {
  const now = Date.now();

  if (cached && now - cached.createdAt > CONNECTION_TTL_MS) {
    cached = null;
  }

  if (!cached) {
    const promise = openConnection().catch((error: unknown) => {
      // Never cache a failed connection: the next request should retry.
      cached = null;
      throw error;
    });
    cached = { promise, createdAt: now };
  }

  return cached.promise;
}

export function resetConnection(): void {
  cached = null;
}

/**
 * Runs an operation, and retries exactly once with a fresh token when the
 * cached session has been invalidated (for example after an admin revokes it).
 */
export async function withSalesforceConnection<T>(
  operation: (connection: Connection) => PromiseLike<T>,
): Promise<T> {
  try {
    return await operation(await getConnection());
  } catch (error) {
    if (!isSalesforceSessionError(error)) throw error;
    resetConnection();
    return operation(await getConnection());
  }
}

/** Used by the startup log without ever printing a secret. */
export const salesforceRuntimeInfo = {
  loginUrl: env.SF_LOGIN_URL,
  apiVersion: env.SF_API_VERSION,
  clientIdSuffix: env.SF_CLIENT_ID ? `…${env.SF_CLIENT_ID.slice(-4)}` : '(not set)',
} as const;
