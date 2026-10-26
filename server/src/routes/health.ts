import { Router } from 'express';

export interface HealthMeta {
  mode: 'live' | 'mock';
  apiVersion: string;
}

export function createHealthRouter(meta: HealthMeta): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      mode: meta.mode,
      salesforceApiVersion: meta.apiVersion,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
