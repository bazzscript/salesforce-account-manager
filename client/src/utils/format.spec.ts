import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatNumber, formatSyncTime, industryHue, initials } from './format';

describe('formatNumber', () => {
  it('groups thousands according to the current locale', () => {
    expect(formatNumber(14980)).toBe(new Intl.NumberFormat().format(14980));
    expect(formatNumber(0)).toBe('0');
  });

  it('keeps every digit of large values', () => {
    const formatted = formatNumber(1234567);
    expect(formatted.replace(/\D/g, '')).toBe('1234567');
  });
});

describe('formatSyncTime', () => {
  const now = new Date('2026-03-14T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles a null timestamp', () => {
    expect(formatSyncTime(null)).toBe('Not synced yet');
  });

  it('reports "Just now" for very recent syncs', () => {
    expect(formatSyncTime(new Date(now.getTime() - 3_000))).toBe('Just now');
  });

  it('reports seconds and minutes', () => {
    expect(formatSyncTime(new Date(now.getTime() - 25_000))).toBe('25s ago');
    expect(formatSyncTime(new Date(now.getTime() - 5 * 60_000))).toBe('5 min ago');
  });

  it('falls back to a clock time after an hour', () => {
    const old = new Date(now.getTime() - 3 * 60 * 60_000);
    expect(formatSyncTime(old)).toBe(old.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  });
});

describe('initials', () => {
  it('uses the first and last word', () => {
    expect(initials('Acme Logistics')).toBe('AL');
    expect(initials('Global Media Holdings Group')).toBe('GG');
  });

  it('handles single words and surrounding whitespace', () => {
    expect(initials('Salesforce')).toBe('S');
    expect(initials('   Acme   Corp  ')).toBe('AC');
  });

  it('returns a dash when there is nothing usable', () => {
    expect(initials('')).toBe('—');
    expect(initials('   ')).toBe('—');
    expect(initials('--- ***')).toBe('—');
  });
});

describe('industryHue', () => {
  it('defaults to a blue hue without an industry', () => {
    expect(industryHue(null)).toBe(210);
  });

  it('is stable and stays inside the colour wheel', () => {
    expect(industryHue('Technology')).toBe(industryHue('Technology'));

    for (const industry of ['Technology', 'Retail', 'Transportation', 'Energy', 'Finance']) {
      const hue = industryHue(industry);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});
