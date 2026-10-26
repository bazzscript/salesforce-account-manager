import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harness, limits } from './harness.js';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/limits', () => {
  it('returns the normalised limits snapshot', async () => {
    const { app, limitsService } = harness();

    const response = await request(app).get('/api/limits').expect(200);

    expect(response.body).toEqual(limits);
    expect(limitsService.get).toHaveBeenCalledOnce();
  });
});

describe('GET /api/health', () => {
  it('reports the mode and API version', async () => {
    const { app } = harness();

    const response = await request(app).get('/api/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      mode: 'mock',
      salesforceApiVersion: '62.0',
    });
    expect(typeof response.body.uptimeSeconds).toBe('number');
  });
});

describe('API plumbing', () => {
  it('rejects malformed JSON with a JSON error envelope', async () => {
    const { app } = harness();

    const response = await request(app)
      .post('/api/accounts')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);

    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('answers unknown API routes with JSON, not the SPA', async () => {
    const { app } = harness();

    const response = await request(app).get('/api/nope').expect(404);

    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('allows configured CORS origins and blocks unknown ones', async () => {
    const { app } = harness();

    const allowed = await request(app)
      .options('/api/accounts')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const blocked = await request(app)
      .options('/api/accounts')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');

    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
