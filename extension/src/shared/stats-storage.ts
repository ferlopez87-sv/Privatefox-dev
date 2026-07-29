/**
 * Local-only usage statistics: how many times Firefox opened, how many
 * times the browser was unlocked, and time spent per domain while unlocked.
 * Deliberately a SEPARATE storage key from PrivatefoxState (shared/storage.ts)
 * — that blob is lock/password/protection config, read and written on every
 * settings change, while this one is written on nearly every tab switch.
 * Co-mingling the two would mean rewriting config on every dwell-time flush.
 *
 * Never stores a full URL — only what shared/domain.ts extracts. Per-day
 * buckets keep the shape bounded (~31 keys) and pruning O(days), not
 * O(events); there is no separate compaction pass or alarm, every write
 * opportunistically prunes first.
 */
interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function area(): StorageArea {
  return browser.storage.local as unknown as StorageArea;
}

export interface DomainStat {
  domain: string;
  totalMs: number;
  lastVisitedAt: number;
}

export interface DailyBucket {
  /** "YYYY-MM-DD", UTC. */
  date: string;
  opens: number;
  unlocks: number;
  /** domain -> ms spent that day. */
  domains: Record<string, number>;
}

export interface PrivatefoxStats {
  schemaVersion: number;
  /** Lifetime counters — never pruned, unlike the per-domain time below. */
  totalOpens: number;
  totalUnlocks: number;
  /** Keyed by date string; only the last STATS_RETENTION_DAYS are kept. */
  days: Record<string, DailyBucket>;
}

export const STATS_KEY = "privatefoxStats";
export const STATS_RETENTION_DAYS = 30;

export const DEFAULT_STATS: PrivatefoxStats = {
  schemaVersion: 1,
  totalOpens: 0,
  totalUnlocks: 0,
  days: {},
};

function dateKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function emptyBucket(date: string): DailyBucket {
  return { date, opens: 0, unlocks: 0, domains: {} };
}

/** Drops day buckets older than the retention window. Pure — vitest-testable. */
export function pruneStats(
  stats: PrivatefoxStats,
  now: number,
): PrivatefoxStats {
  const cutoff = dateKey(now - STATS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const days: Record<string, DailyBucket> = {};
  for (const [date, bucket] of Object.entries(stats.days)) {
    if (date >= cutoff) days[date] = bucket;
  }
  return { ...stats, days };
}

/** Sums each domain's time across all retained days, sorted by most time first. */
export function aggregateDomainTotals(stats: PrivatefoxStats): DomainStat[] {
  const totals = new Map<string, DomainStat>();
  for (const bucket of Object.values(stats.days)) {
    for (const [domain, ms] of Object.entries(bucket.domains)) {
      const existing = totals.get(domain);
      if (existing) {
        existing.totalMs += ms;
        existing.lastVisitedAt = Math.max(
          existing.lastVisitedAt,
          Date.parse(bucket.date),
        );
      } else {
        totals.set(domain, {
          domain,
          totalMs: ms,
          lastVisitedAt: Date.parse(bucket.date),
        });
      }
    }
  }
  return [...totals.values()].sort((a, b) => b.totalMs - a.totalMs);
}

export async function getStats(): Promise<PrivatefoxStats> {
  const result = await area().get(STATS_KEY);
  const stored = result[STATS_KEY] as Partial<PrivatefoxStats> | undefined;
  const merged: PrivatefoxStats = {
    ...DEFAULT_STATS,
    ...stored,
    days: { ...DEFAULT_STATS.days, ...stored?.days },
  };
  return pruneStats(merged, Date.now());
}

export async function setStats(
  patch: Partial<PrivatefoxStats>,
): Promise<PrivatefoxStats> {
  const current = await getStats();
  const next = pruneStats({ ...current, ...patch }, Date.now());
  await area().set({ [STATS_KEY]: next });
  return next;
}

export async function recordOpen(): Promise<void> {
  const stats = await getStats();
  const date = dateKey(Date.now());
  const bucket = stats.days[date] ?? emptyBucket(date);
  await setStats({
    totalOpens: stats.totalOpens + 1,
    days: { ...stats.days, [date]: { ...bucket, opens: bucket.opens + 1 } },
  });
}

export async function recordUnlockStat(): Promise<void> {
  const stats = await getStats();
  const date = dateKey(Date.now());
  const bucket = stats.days[date] ?? emptyBucket(date);
  await setStats({
    totalUnlocks: stats.totalUnlocks + 1,
    days: {
      ...stats.days,
      [date]: { ...bucket, unlocks: bucket.unlocks + 1 },
    },
  });
}

export async function recordDwellTime(
  domain: string,
  ms: number,
  at: number,
): Promise<void> {
  if (ms <= 0) return;
  const stats = await getStats();
  const date = dateKey(at);
  const bucket = stats.days[date] ?? emptyBucket(date);
  await setStats({
    days: {
      ...stats.days,
      [date]: {
        ...bucket,
        domains: {
          ...bucket.domains,
          [domain]: (bucket.domains[domain] ?? 0) + ms,
        },
      },
    },
  });
}
