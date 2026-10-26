import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/errors/httpError.js';
import { ACCOUNT_ID, CREATED_ID, account, harness } from './harness.js';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/accounts', () => {
  it('returns the account list and forbids caching', async () => {
    const { app, accounts } = harness();

    const response = await request(app).get('/api/accounts').expect(200);

    expect(response.body).toEqual([account]);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(accounts.list).toHaveBeenCalledOnce();
  });

  it('turns a Salesforce API-limit failure into a clear 429', async () => {
    const { app } = harness({
      list: vi.fn(async () => {
        throw Object.assign(new Error('TotalRequests Limit exceeded.'), {
          errorCode: 'REQUEST_LIMIT_EXCEEDED',
        });
      }),
    });

    const response = await request(app).get('/api/accounts').expect(429);

    expect(response.body.error.code).toBe('SALESFORCE_LIMIT_EXCEEDED');
    expect(response.body.error.message).toContain('daily Salesforce API limit');
  });
});

describe('POST /api/accounts', () => {
  it('creates an account, trims values and returns Location', async () => {
    const { app, accounts } = harness();

    const response = await request(app)
      .post('/api/accounts')
      .send({ name: '  New Co  ', industry: '   ' })
      .expect(201);

    expect(response.body).toEqual({ id: CREATED_ID, name: 'New Co', industry: null });
    expect(response.headers.location).toBe(`/api/accounts/${CREATED_ID}`);
    expect(vi.mocked(accounts.create).mock.calls[0]).toEqual([
      { name: 'New Co', industry: null },
    ]);
  });

  it('rejects a missing name with field-level details', async () => {
    const { app, accounts } = harness();

    const response = await request(app).post('/api/accounts').send({}).expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual([
      { field: 'name', message: 'Name is required.' },
    ]);
    expect(accounts.create).not.toHaveBeenCalled();
  });

  it('rejects unknown fields instead of silently ignoring them', async () => {
    const { app, accounts } = harness();

    const response = await request(app)
      .post('/api/accounts')
      .send({ name: 'New Co', OwnerId: '005000000000001AAA' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(accounts.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/accounts/:id', () => {
  it('updates one field and returns the full account', async () => {
    const { app, accounts } = harness();

    const response = await request(app)
      .patch(`/api/accounts/${ACCOUNT_ID}`)
      .send({ industry: 'Energy' })
      .expect(200);

    expect(response.body).toEqual({ ...account, industry: 'Energy' });
    expect(vi.mocked(accounts.update).mock.calls[0]).toEqual([
      ACCOUNT_ID,
      { industry: 'Energy' },
    ]);
  });

  it('allows clearing the industry with null', async () => {
    const { app, accounts } = harness();

    const response = await request(app)
      .patch(`/api/accounts/${ACCOUNT_ID}`)
      .send({ industry: null })
      .expect(200);

    expect(response.body.industry).toBeNull();
    expect(vi.mocked(accounts.update).mock.calls[0]?.[1]).toEqual({ industry: null });
  });

  it('rejects an empty patch', async () => {
    const { app, accounts } = harness();

    const response = await request(app)
      .patch(`/api/accounts/${ACCOUNT_ID}`)
      .send({})
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Provide at least one field to update.');
    expect(accounts.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid id before calling Salesforce', async () => {
    const { app, accounts } = harness();

    const response = await request(app)
      .patch('/api/accounts/not-an-id')
      .send({ name: 'Hacked' })
      .expect(400);

    expect(response.body.error.code).toBe('INVALID_ACCOUNT_ID');
    expect(accounts.update).not.toHaveBeenCalled();
  });

  it('maps a missing account to 404', async () => {
    const { app } = harness({
      update: vi.fn(async () => {
        throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'That account no longer exists.');
      }),
    });

    const response = await request(app)
      .patch(`/api/accounts/${ACCOUNT_ID}`)
      .send({ name: 'Ghost' })
      .expect(404);

    expect(response.body.error.code).toBe('ACCOUNT_NOT_FOUND');
  });
});

describe('DELETE /api/accounts/:id', () => {
  it('deletes an account and returns 204', async () => {
    const { app, accounts } = harness();

    const response = await request(app).delete(`/api/accounts/${ACCOUNT_ID}`).expect(204);

    expect(response.text).toBe('');
    expect(accounts.remove).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  it('returns 400 for an invalid id', async () => {
    const { app, accounts } = harness();

    const response = await request(app).delete('/api/accounts/abc').expect(400);

    expect(response.body.error.code).toBe('INVALID_ACCOUNT_ID');
    expect(accounts.remove).not.toHaveBeenCalled();
  });
});
