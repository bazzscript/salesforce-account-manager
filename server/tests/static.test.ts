import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { harness } from './harness.js';

/**
 * These tests use a throwaway directory instead of client/dist so the suite
 * never depends on a prior `npm run build`.
 */
describe('static client hosting', () => {
  let dist: string;

  beforeAll(() => {
    dist = mkdtempSync(path.join(tmpdir(), 'sam-client-'));
    mkdirSync(path.join(dist, 'assets'));
    writeFileSync(
      path.join(dist, 'index.html'),
      '<!doctype html><html><body><div id="app"></div></body></html>',
    );
    writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log("app");');
    writeFileSync(path.join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  it('serves index.html for SPA deep links without caching it', async () => {
    const { app } = harness({}, { clientDistPath: dist });

    const response = await request(app).get('/accounts/123').set('Accept', 'text/html').expect(200);

    expect(response.text).toContain('<div id="app"></div>');
    expect(response.headers['cache-control']).toBe('no-store');

    // HEAD must describe the same resource as GET (uptime checks, prefetchers).
    const head = await request(app).head('/accounts/123').set('Accept', 'text/html').expect(200);
    expect(head.headers['cache-control']).toBe('no-store');
  });

  it('serves hashed assets with an immutable cache header', async () => {
    const { app } = harness({}, { clientDistPath: dist });

    const response = await request(app).get('/assets/index-abc123.js').expect(200);

    expect(response.text).toBe('console.log("app");');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('404s missing assets instead of returning the SPA shell', async () => {
    const { app } = harness({}, { clientDistPath: dist });

    const asset = await request(app)
      .get('/assets/index-stale.js')
      .set('Accept', 'text/html')
      .expect(404);

    expect(asset.text).toBe('Not found');
    expect(asset.headers['content-type']).toContain('text/plain');

    await request(app).get('/favicon.ico').set('Accept', 'text/html').expect(404);
  });
});
