import { Router } from 'express';
import type { LimitsService } from '../types/services.js';

export function createLimitsRouter(limits: LimitsService): Router {
  const router = Router();

  // GET /api/limits — remaining daily API calls plus storage headroom.
  router.get('/', async (_req, res) => {
    const snapshot = await limits.get();
    res.json(snapshot);
  });

  return router;
}
