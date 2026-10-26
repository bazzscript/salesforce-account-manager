import { Router } from 'express';
import { z } from 'zod';
import type { AccountService } from '../types/services.js';
import { parseAccountId, parseBody } from './parseBody.js';

const name = z
  .string({ error: 'Name is required.' })
  .trim()
  .min(1, { error: 'Name is required.' })
  .max(255, { error: 'Name cannot be longer than 255 characters.' });

const industry = z
  .union([z.string(), z.null()], { error: 'Industry must be text.' })
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  .refine((value) => value == null || value.length <= 255, {
    error: 'Industry cannot be longer than 255 characters.',
  });

const createAccountSchema = z.strictObject({
  name,
  industry,
});

const updateAccountSchema = z
  .strictObject({
    name: name.optional(),
    industry,
  })
  .refine((value) => value.name !== undefined || value.industry !== undefined, {
    error: 'Provide at least one field to update.',
  });

export function createAccountsRouter(accounts: AccountService): Router {
  const router = Router();

  // GET /api/accounts — the 20 most recently modified accounts.
  router.get('/', async (_req, res) => {
    const list = await accounts.list();
    res.json(list);
  });

  // POST /api/accounts
  router.post('/', async (req, res) => {
    const input = parseBody(createAccountSchema, req.body);
    const account = await accounts.create({
      name: input.name,
      industry: input.industry ?? null,
    });

    res.status(201).location(`/api/accounts/${account.id}`).json(account);
  });

  // PATCH /api/accounts/:id
  router.patch('/:id', async (req, res) => {
    const id = parseAccountId(req.params.id);
    const patch = parseBody(updateAccountSchema, req.body);
    const account = await accounts.update(id, patch);
    res.json(account);
  });

  // DELETE /api/accounts/:id
  router.delete('/:id', async (req, res) => {
    const id = parseAccountId(req.params.id);
    await accounts.remove(id);
    res.status(204).end();
  });

  return router;
}
