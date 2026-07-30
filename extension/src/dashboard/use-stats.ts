import { useEffect, useState } from "preact/hooks";
import {
  getStats,
  aggregateDomainTotals,
  STATS_KEY,
  type PrivatefoxStats,
  type DomainStat,
} from "../shared/stats-storage";

export function useStats(): {
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
