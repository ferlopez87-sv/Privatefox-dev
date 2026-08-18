import { render } from "preact";
import { useState } from "preact/hooks";
import { sendToBackground, usePrivatefoxState } from "../ui/state";
import { SETTINGS_PASS_TTL_MINUTES, GATED_PAGES } from "../shared/constants";
import { navigateTab } from "../shared/url";
import "../ui/styles.css";

/**
 * Password gate shown when navigation to about:addons (or a sibling page) is
 * intercepted by nav-guard. Entering the password grants a short-lived pass
 * and forwards the tab to postGateRedirectUrl if the user configured one
 * (Options -> Protection), otherwise to the page that was actually requested.
 */

/**
 * The target arrives in the query string, so it is untrusted input: only
 * forward to pages that are actually on the gated list, never to arbitrary
 * URLs supplied by whoever built the link.
 */
function safeTarget(): string {
  const raw = new URLSearchParams(location.search).get("target") ?? "";
  return GATED_PAGES.some((p) => raw.startsWith(p)) ? raw : "about:addons";
}

function App() {
  const target = safeTarget();
  const state = usePrivatefoxState();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await sendToBackground({
        kind: "settings-access-attempt",
        password,
      });
      if (!res.ok) {
        setError(res.error);
        setPassword("");
        return;
      }
      // Pass granted: nav-guard now lets this navigation through. Go to the
      // configured redirect if the user set one, otherwise the page that
      // was actually requested.
      //
      // Must go through the tabs API: `target` is normally a privileged
      // about: page, and location.replace() cannot navigate an extension
      // page to one — Firefox blocks it silently, leaving the gate on
      // screen looking like it rejected a correct password.
      navigateTab(state?.postGateRedirectUrl || target);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="centered">
      <h1>Password required</h1>
      <p class="message">
        <code>{target}</code> is protected by Privatefox. Enter your{" "}
        <strong>settings password</strong> to continue.
      </p>
      {state?.postGateRedirectUrl && (
        <p class="hint">
          You'll be sent to <code>{state.postGateRedirectUrl}</code> instead
          (configured in Options → Protection).
        </p>
      )}
      <form class="row" onSubmit={submit}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          autocomplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autofocus
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        />
        <button type="submit" disabled={busy}>
          Continue
        </button>
      </form>
      <div class="error">{error}</div>
      <p class="hint">
        Access stays open for {SETTINGS_PASS_TTL_MINUTES} minutes, and ends as
        soon as the browser locks.
      </p>
      <p>
        <span
          class="link"
          onClick={() => void browser.tabs.update({ url: "about:newtab" })}
        >
          Go back
        </span>
      </p>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
