import type { RequestHandler } from 'express';

/**
 * Minimal structured request log. In a larger deployment this would be
 * pino-http or OpenTelemetry; here it keeps the dependency tree small while
 * still showing status codes and latency.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const timestamp = new Date().toISOString();
    console.log(
      `${timestamp} ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`,
    );
  });

  next();
};
