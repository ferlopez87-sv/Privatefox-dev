import { render } from "preact";
import { usePrivatefoxState } from "../ui/state";
import { useNow } from "../ui/settings-gate";
import { PANIC_MODE_MINUTES } from "../shared/constants";
import "../ui/styles.css";

function formatUntil(until: number): string {
  const remaining = until - Date.now();
  const totalSec = Math.max(0, Math.ceil(remaining / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function App() {
  const state = usePrivatefoxState();
  const now = useNow(state?.panicUntil ?? null);
  if (!state) return null;

  const panicActive = state.panicUntil !== null && now < state.panicUntil;

  const backToBrowsing = () => {
    void browser.tabs.update({ url: "about:newtab" });
  };

  if (!panicActive) {
    return (
      <main class="centered">
        <h1>Panic mode ended</h1>
        <p class="message">
          The panic window has passed. The protected pages accept the
          settings password again.
        </p>
        <button onClick={backToBrowsing}>Back to browsing</button>
      </main>
    );
  }

  return (
    <main class="centered">
      <h1>Panic mode active</h1>
      <p class="message">
        For the next {PANIC_MODE_MINUTES} minutes, the protected pages
        (Firefox preferences, about:addons, Privatefox options) are blocked
        and <strong>no password will open them</strong> — not even the
        correct one. Private windows opened during this window are closed
        automatically.
      </p>
      <p class="code">Ends in {formatUntil(state.panicUntil!)}</p>
      <p class="hint">
        If a private window opened during panic mode was not closed, the
        extension may not have private-window access granted yet (native
        host + restart).
      </p>
      <button onClick={backToBrowsing}>Back to browsing</button>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
