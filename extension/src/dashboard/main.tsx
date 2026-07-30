import { render } from "preact";
import { usePrivatefoxState, sendToBackground } from "../ui/state";
import { SettingsGate, useNow } from "../ui/settings-gate";
import { useStats } from "./use-stats";
import "../ui/styles.css";

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

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function App() {
  const state = usePrivatefoxState();
  const now = useNow(state?.settingsPassUntil ?? null);
  const { stats, domains } = useStats();

  if (!state) return null;

  const passValid =
    state.settingsPassUntil !== null && now < state.settingsPassUntil;

  if (!state.setupComplete) {
    return (
      <main>
        <h1>Usage statistics</h1>
        <p>Complete setup before stats begin tracking.</p>
      </main>
    );
  }

  if (!passValid) return <SettingsGate />;

  const topDomain = domains[0];
  const maxDomainMs = topDomain ? topDomain.totalMs : 1;
  const domainCount = domains.length;
  const totalOpens = stats?.totalOpens ?? 0;
  const totalUnlocks = stats?.totalUnlocks ?? 0;

  return (
    <main class="dashboard">
      <h1>Usage statistics</h1>
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
        installed, grantPrivateBrowsingAccess is on, and Firefox restarts.
      </p>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
