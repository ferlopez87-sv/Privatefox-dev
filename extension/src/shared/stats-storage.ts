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
 *
 * v1.8.1: stats are now cached in memory and flushed to disk on a debounced
 * timer (FLUSH_DELAY_MS). This eliminates the per-tab-switch read+write
 * cycle that was the main source of background-page CPU/disk usage. The
 * cache is flushed immediately on browser.runtime.onSuspend so no data is
 * lost when Firefox unloads the background page.
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

// ---------------------------------------------------------------------------
// In-memory cache + debounced flush
// ---------------------------------------------------------------------------

/** How long (ms) to wait after the last setStats before flushing to disk. */
const FLUSH_DELAY_MS = 5_000;

/** The in-memory copy of stats; null means "not yet loaded from storage". */
let statsCache: PrivatefoxStats | null = null;

/** Handle for the pending flush timer, so we can cancel/reschedule. */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Whether a flush to disk is currently in progress (avoids overlapping writes). */
let flushInProgress = false;

/**
 * Immediately persists the in-memory cache to browser.storage.local.
 * Safe to call multiple times concurrently — only one write runs at a time;
 * if called while a write is in flight, the next flush will pick up the
 * latest cache value.
 */
export async function flushStatsNow(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!statsCache || flushInProgress) return;
  flushInProgress = true;
  try {
    await area().set({ [STATS_KEY]: statsCache });
  } finally {
    flushInProgress = false;
  }
}

/** Schedules a disk flush after FLUSH_DELAY_MS, resetting any pending timer. */
function scheduleDiskFlush(): void {
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushStatsNow();
  }, FLUSH_DELAY_MS);
}

/**
 * Call once from the background entry point. Hooks into onSuspend so the
 * cache is persisted before Firefox unloads the non-persistent background.
 */
export function registerStatsFlush(): void {
  if (typeof browser !== "undefined" && browser.runtime?.onSuspend) {
    browser.runtime.onSuspend.addListener(() => {
      void flushStatsNow();
    });
  }
}

// ---------------------------------------------------------------------------
// Public API (unchanged signatures, now cache-backed)
// ---------------------------------------------------------------------------

export async function getStats(): Promise<PrivatefoxStats> {
  if (statsCache) return statsCache;
  const result = await area().get(STATS_KEY);
  const stored = result[STATS_KEY] as Partial<PrivatefoxStats> | undefined;
  const merged: PrivatefoxStats = {
    ...DEFAULT_STATS,
    ...stored,
    days: { ...DEFAULT_STATS.days, ...stored?.days },
  };
  statsCache = pruneStats(merged, Date.now());
  return statsCache;
}

export async function setStats(
  patch: Partial<PrivatefoxStats>,
): Promise<PrivatefoxStats> {
  const current = await getStats();
  const next = pruneStats({ ...current, ...patch }, Date.now());
  statsCache = next;
  scheduleDiskFlush();
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

/**
 * Resets the in-memory cache. Exposed for testing only — production code
 * should never call this.
 */
export function _resetStatsCache(): void {
  statsCache = null;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

