import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { allowedCorsOrigins, env } from './config/env.js';
import { createSalesforceAccountService } from './salesforce/accountService.js';
import { salesforceRuntimeInfo } from './salesforce/client.js';
import { createSalesforceLimitsService } from './salesforce/limitsService.js';
import { createMockServices } from './salesforce/mockServices.js';
import type { AppServices } from './types/services.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDistPath = path.resolve(serverRoot, '..', 'client', 'dist');

const hasClientBuild = existsSync(path.join(clientDistPath, 'index.html'));

if (env.SERVE_CLIENT && !hasClientBuild) {
  console.warn(
    `[startup] SERVE_CLIENT=true but no Vue build was found at ${clientDistPath}. ` +
      'Run "npm run build" first. Continuing without static files.',
  );
}

const mode: 'live' | 'mock' = env.SF_MOCK ? 'mock' : 'live';

const services: AppServices =
  mode === 'mock'
    ? createMockServices()
    : {
        accounts: createSalesforceAccountService(),
        limits: createSalesforceLimitsService(),
      };

const app = createApp({
  services,
  corsOrigins: allowedCorsOrigins,
  apiVersion: env.SF_API_VERSION,
  mode,
  clientDistPath: env.SERVE_CLIENT && hasClientBuild ? clientDistPath : undefined,
  enableRequestLogging: true,
});

const server = app.listen(env.PORT, () => {
  console.log('\n  Salesforce Account Manager');
  console.log(`  → http://localhost:${env.PORT}`);
  console.log(`  → mode: ${mode} · API v${env.SF_API_VERSION} · ${env.SF_LOGIN_URL}`);
  console.log(`  → OAuth client: ${salesforceRuntimeInfo.clientIdSuffix}`);

  if (mode === 'mock') {
    console.log('  → SF_MOCK=true: serving in-memory demo data, no org contacted.\n');
  } else {
    console.log('  → OAuth 2.0 client credentials; secrets stay on this server.\n');
  }
});

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `[startup] Port ${env.PORT} is already in use. Stop the other process or set PORT in server/.env.`,
    );
  } else {
    console.error('[startup] HTTP server failed:', error);
  }
  process.exit(1);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`\n[shutdown] ${signal} received — closing HTTP server…`);

  server.close((error) => {
    if (error) {
      console.error('[shutdown] Failed to close cleanly:', error);
      process.exit(1);
    }
    process.exit(0);
  });

  // Never hang forever on a slow keep-alive connection.
  setTimeout(() => {
    console.error('[shutdown] Forced exit after 10 seconds.');
    process.exit(1);
  }, 10_000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled promise rejection:', reason);
});
