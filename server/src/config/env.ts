import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * `server/.env` is loaded from a path derived from this file rather than
 * `process.cwd()`, so `npm run dev` works from the repo root, from `server/`,
 * and from inside the Docker image (where env vars are injected instead).
 * Values already present in `process.env` always win — dotenv never overrides.
 */
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(moduleDir, '../..');
loadDotenv({ path: path.join(serverRoot, '.env'), quiet: true });

const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const port = z.preprocess(
  (value) => (value === undefined || value === '' ? undefined : value),
  z.coerce.number().int().positive().max(65_535).default(4000),
);

const booleanFlag = z.preprocess(
  (value) => (value === undefined || value === '' ? undefined : value),
  z
    .enum(['true', 'false'], {
      error: 'Expected "true" or "false".',
    })
    .default('false')
    .transform((value) => value === 'true'),
);

const rawEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: port,

    SF_LOGIN_URL: z.preprocess(
      (value) => (value === undefined || value === '' ? undefined : value),
      z.string().url('SF_LOGIN_URL must be a full URL.').default('https://login.salesforce.com'),
    ),
    SF_CLIENT_ID: optionalString,
    SF_CLIENT_SECRET: optionalString,
    SF_API_VERSION: z.preprocess(
      (value) => (value === undefined || value === '' ? undefined : value),
      z
        .string()
        .regex(/^\d{2,3}\.\d$/, 'SF_API_VERSION must look like 62.0.')
        .default('62.0'),
    ),

    CLIENT_ORIGIN: z.preprocess(
      (value) => (value === undefined || value === '' ? undefined : value),
      z.string().trim().default('http://localhost:5173'),
    ),

    SERVE_CLIENT: booleanFlag,
    SF_MOCK: booleanFlag,
  })
  .superRefine((value, ctx) => {
    if (value.SF_MOCK && value.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['SF_MOCK'],
        message: 'Refusing to run the in-memory demo in production.',
      });
    }

    if (!value.SF_MOCK) {
      const required = [
        ['SF_CLIENT_ID', value.SF_CLIENT_ID],
        ['SF_CLIENT_SECRET', value.SF_CLIENT_SECRET],
      ] as const;

      for (const [key, fieldValue] of required) {
        if (!fieldValue) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required unless SF_MOCK=true.`,
          });
        }
      }
    }
  });

export type AppEnv = z.infer<typeof rawEnvSchema>;

function readEnv(): AppEnv {
  const result = rawEnvSchema.safeParse(process.env);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid server configuration:\n${problems}\n\n` +
        'Copy server/.env.example to server/.env and fill in the Salesforce values, ' +
        'or set SF_MOCK=true to explore the UI with in-memory data.',
    );
  }

  return result.data;
}

export const env: AppEnv = readEnv();

/** Comma-separated origins are supported, e.g. "http://a.test,http://b.test". */
export const allowedCorsOrigins: string[] = env.CLIENT_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
