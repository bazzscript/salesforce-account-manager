import { env } from '../config/env.js';
import type { ApiLimit, ApiLimits } from '../types/account.js';
import type { LimitsService } from '../types/services.js';
import { withSalesforceConnection } from './client.js';

interface RawLimit {
  Max?: number;
  Remaining?: number;
}

type RawLimits = Record<string, RawLimit | undefined>;

function toApiLimit(raw: RawLimit | undefined): ApiLimit {
  const max = typeof raw?.Max === 'number' ? raw.Max : 0;
  const remaining = typeof raw?.Remaining === 'number' ? raw.Remaining : 0;

  return {
    max,
    remaining,
    used: Math.max(max - remaining, 0),
  };
}

export function createSalesforceLimitsService(): LimitsService {
  return {
    async get(): Promise<ApiLimits> {
      const limits = await withSalesforceConnection((connection) =>
        connection.request<RawLimits>(`/services/data/v${env.SF_API_VERSION}/limits`),
      );

      return {
        dailyApiRequests: toApiLimit(limits.DailyApiRequests),
        dataStorageMb: toApiLimit(limits.DataStorageMB),
        fileStorageMb: toApiLimit(limits.FileStorageMB),
        fetchedAt: new Date().toISOString(),
      };
    },
  };
}
