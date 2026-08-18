import { render } from "preact";
import { usePrivatefoxState, sendToBackground } from "../ui/state";
import { useNow } from "../ui/settings-gate";
import "../ui/styles.css";

/**
 * Toolbar-button popup: a compact status card. Clicking the toolbar icon no
 * longer locks instantly (that moved to the "Lock now" button here); it opens
 * this card so the user can see protection status and reach preferences.
 */

function openSetup() {
  void browser.tabs.create({
    url: browser.runtime.getURL("src/setup/index.html"),
  });
  window.close();
}

function openPreferences() {
  void browser.runtime.openOptionsPage();
  window.close();
}

function openStatsTab() {
  void browser.tabs.create({
    url: browser.runtime.getURL("src/options/index.html?tab=stats"),
  });
  window.close();
}

function activatePanic() {
  void sendToBackground({ kind: "activate-panic-mode" });
  window.close();
}

function App() {
  const state = usePrivatefoxState();
  // Both deadlines re-render this card the moment they pass, so an open
  // popup never keeps showing "active" for a window that already expired.
  // Hooks must run before any early return.
  const nowPanic = useNow(state?.panicUntil ?? null);
  const nowPass = useNow(state?.settingsPassUntil ?? null);
  if (!state) return null;

  if (!state.setupComplete) {
    return (
      <main class="popup">
        <h1>Privatefox Lock</h1>
        <p class="message">
          Setup isn’t finished, so nothing is protected yet.
        </p>
        <button onClick={openSetup}>Finish setup</button>
      </main>
    );
  }

  const panicActive = state.panicUntil !== null && nowPanic < state.panicUntil;
  // A valid settings pass lifts the dynamic private-window block, so the
  // card has to say "Allowed for now" rather than flatly "Blocked".
  const settingsPassActive =
    state.settingsPassUntil !== null && nowPass < state.settingsPassUntil;
  const privateBrowsing = !state.blockPrivateBrowsing
    ? "Allowed"
    : settingsPassActive
      ? "Allowed for now"
      : "Blocked";

  return (
    <main class="popup">
      <h1>Privatefox Lock</h1>

      <div class="status">
        <span class={state.locked ? "dot locked" : "dot unlocked"} />
        <div>
          <strong>{state.locked ? "Locked" : "Unlocked"}</strong>
          <p class="hint">
            {panicActive
              ? "Panic mode: no password opens the protected surfaces."
              : settingsPassActive
                ? "Settings unlocked — preferences are reachable right now."
                : "Protection is active on this browser."}
          </p>
        </div>
      </div>

      <ul class="facts">
        <li>
          <span>Auto-lock</span>
          <span>After {state.idleTimeoutMinutes} min idle</span>
        </li>
        <li>
          <span>Private browsing</span>
          <span>{privateBrowsing}</span>
        </li>
        <li>
          <span>about:addons</span>
          <span>{state.blockAboutAddons ? "Blocked" : "Password gate"}</span>
        </li>
        <li>
          <span>Recovery email</span>
          <span>{state.recoveryEmail ? "Configured" : "Not set"}</span>
        </li>
      </ul>

      <div class="row">
        {!state.locked && (
          <button onClick={() => void sendToBackground({ kind: "lock-now" })}>
            Lock now
          </button>
        )}
        <button class="secondary" onClick={openPreferences}>
          Preferences
        </button>
      </div>
      <div class="row">
        <button class="secondary" onClick={openStatsTab}>
          Usage stats
        </button>
      </div>
      <div class="row">
        <button class="panic" onClick={activatePanic}>
          {/* Duration comes from the preference, not a hardcoded 10. */}
          Panic mode ({panicActive ? "active" : `${state.panicModeMinutes} min`})
        </button>
      </div>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
