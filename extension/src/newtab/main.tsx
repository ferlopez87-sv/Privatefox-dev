import { render } from "preact";
import { usePrivatefoxState, sendToBackground } from "../ui/state";
import { LockForm } from "../ui/LockForm";
import "../ui/styles.css";

function App() {
  const state = usePrivatefoxState();
  if (!state) return null;

  if (!state.setupComplete) {
    return (
      <main class="centered">
        <h1>Privatefox Lock</h1>
        <p class="message">
          Setup is not complete yet — no lock is active. Create your password
          to start protecting this browser.
        </p>
        <p>
          <button
            onClick={() =>
              void browser.tabs.update({
                url: browser.runtime.getURL("src/setup/index.html"),
              })
            }
          >
            Run setup
          </button>
        </p>
      </main>
    );
  }

  if (state.locked) {
    return (
      <main class="centered">
        <h1>Privatefox is locked</h1>
        <p class="message">{state.welcomeMessage}</p>
        <LockForm recoveryEmailConfigured={state.recoveryEmail !== ""} />
      </main>
    );
  }

  return (
    <main class="centered">
      <h1>New Tab</h1>
      <p class="message">{state.welcomeMessage}</p>
      <p class="row">
        <button
          class="secondary"
          onClick={() => void sendToBackground({ kind: "lock-now" })}
        >
          Lock now
        </button>
        <button
          class="secondary"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          Options
        </button>
      </p>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
