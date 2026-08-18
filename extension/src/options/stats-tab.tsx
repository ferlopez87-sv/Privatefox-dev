import { useEffect, useState } from "preact/hooks";
import {
  getStats,
  aggregateDomainTotals,
  STATS_KEY,
  type PrivatefoxStats,
  type DomainStat,
} from "../shared/stats-storage";

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}

function useStats(): {
  stats: PrivatefoxStats | null;
  domains: DomainStat[];
} {
  const [stats, setStats] = useState<PrivatefoxStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await getStats();
      if (!cancelled) setStats(s);
    };
    void load();

    const listener = (
      changes: Record<string, browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[STATS_KEY]) return;
      void load();
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  const domains = stats ? aggregateDomainTotals(stats) : [];
  return { stats, domains };
}

export function StatsTab() {
  const { stats, domains } = useStats();

  const topDomain = domains[0];
  const maxDomainMs = topDomain ? topDomain.totalMs : 1;
  const domainCount = domains.length;
  const totalOpens = stats?.totalOpens ?? 0;
  const totalUnlocks = stats?.totalUnlocks ?? 0;

  return (
    <section>
      <p class="hint">
        All data stays on this device — it is never sent anywhere.
      </p>

      <div class="facts">
        <div class="fact">
          <strong>{totalOpens}</strong>
          <span>Browser opens</span>
        </div>
        <div class="fact">
          <strong>{totalUnlocks}</strong>
          <span>Unlocks</span>
        </div>
        <div class="fact">
          <strong>{domainCount}</strong>
          <span>Domains tracked</span>
        </div>
      </div>

      <h2>Time per domain (last 30 days)</h2>
      {domains.length === 0 ? (
        <p class="hint">No data yet. Dwell time accrues while unlocked.</p>
      ) : (
        <div class="bar-list">
          {domains.map((d) => (
            <div class="bar-row" key={d.domain}>
              <span class="bar-label" title={d.domain}>
                {d.domain}
              </span>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  style={{ width: `${(d.totalMs / maxDomainMs) * 100}%` }}
                />
              </div>
              <span class="bar-value">{formatDuration(d.totalMs)}</span>
            </div>
          ))}
        </div>
      )}

      <p class="hint" style="margin-top: 1.5rem">
        Private-window tracking takes effect after the native host is
        installed and Firefox restarts — the policy that grants private-window
        access is written automatically by "Apply policy now".
      </p>
    </section>
  );
}
