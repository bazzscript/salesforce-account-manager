/** Compact number formatting for limits, e.g. 14980 -> "14,980". */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/**
 * Human-readable "last synced" label. Falls back to a clock time once the
 * value is more than an hour old, which is more useful than "3 days ago".
 */
export function formatSyncTime(date: Date | null): string {
  if (!date) return 'Not synced yet';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Initials for the account avatar, e.g. "Acme Logistics" -> "AL". */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word));

  if (words.length === 0) return '—';

  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return `${first}${second}`.toUpperCase();
}

/**
 * Stable hue per industry so the same industry always gets the same dot
 * colour. Keeps the list scannable without hard-coding a legend.
 */
export function industryHue(industry: string | null): number {
  if (!industry) return 210;
  let hash = 0;
  for (let index = 0; index < industry.length; index += 1) {
    hash = (hash * 31 + industry.charCodeAt(index)) % 360;
  }
  return hash;
}
