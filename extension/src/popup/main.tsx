import { render } from "preact";
import { usePrivatefoxState, sendToBackground } from "../ui/state";
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

function App() {
  const state = usePrivatefoxState();
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

  return (
    <main class="popup">
      <h1>Privatefox Lock</h1>

      <div class="status">
        <span class={state.locked ? "dot locked" : "dot unlocked"} />
        <div>
          <strong>{state.locked ? "Locked" : "Unlocked"}</strong>
          <p class="hint">Protection is active on this browser.</p>
        </div>
      </div>

      <ul class="facts">
        <li>
          <span>Auto-lock</span>
          <span>After {state.idleTimeoutMinutes} min idle</span>
        </li>
        <li>
          <span>Private browsing</span>
          <span>{state.blockPrivateBrowsing ? "Blocked" : "Allowed"}</span>
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
    </main>
  );
}

render(<App />, document.getElementById("app")!);
