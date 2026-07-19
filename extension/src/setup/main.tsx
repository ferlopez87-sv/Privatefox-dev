import { render } from "preact";
import { useState } from "preact/hooks";
import { usePrivatefoxState, sendToBackground } from "../ui/state";
import { setState as patchState } from "../shared/storage";
import "../ui/styles.css";

function App() {
  const state = usePrivatefoxState();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!state) return null;

  if (recoveryCode) {
    return (
      <main class="centered">
        <h1>Save your recovery code</h1>
        <p>
          This code is shown <strong>one time only</strong>. If you forget
          your password it is the only offline way back in. Store it outside
          this browser — a password manager or a piece of paper.
        </p>
        <div class="code">{recoveryCode}</div>
        <label>
          <input
            type="checkbox"
            style="width:auto; margin-right:0.5rem"
            checked={saved}
            onChange={(e) => setSaved((e.target as HTMLInputElement).checked)}
          />
          I saved my recovery code somewhere safe.
        </label>
        <p>
          <button disabled={!saved} onClick={() => window.close()}>
            Finish setup
          </button>
        </p>
      </main>
    );
  }

  if (state.setupComplete) {
    return (
      <main class="centered">
        <h1>Privatefox Lock</h1>
        <p>Setup is already complete. Manage settings from the options page.</p>
        <p>
          <button onClick={() => void browser.runtime.openOptionsPage()}>
            Open options
          </button>
        </p>
      </main>
    );
  }

  const submit = async (event: Event) => {
    event.preventDefault();
    setError("");
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (email.trim()) {
        await patchState({ recoveryEmail: email.trim() });
      }
      const res = await sendToBackground({
        kind: "complete-setup",
        password,
      });
      if (res.ok && "recoveryCode" in res) {
        setRecoveryCode(res.recoveryCode);
      } else if (!res.ok) {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="centered">
      <h1>Set up Privatefox Lock</h1>
      <p class="message">
        Choose the password that unlocks this browser. After setup, Firefox
        locks on every startup and after inactivity.
      </p>
      <form onSubmit={submit}>
        <label>Password</label>
        <input
          type="password"
          value={password}
          autocomplete="new-password"
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
        />
        <label>Confirm password</label>
        <input
          type="password"
          value={confirm}
          autocomplete="new-password"
          onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
        />
        <label>Recovery email (optional)</label>
        <input
          type="email"
          value={email}
          placeholder="you@example.com"
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        />
        <p class="hint">
          Email recovery requires the Privatefox native host to be installed
          (Phase 3 of setup) and uses your own Mail.app account — nothing is
          sent to any third-party server.
        </p>
        <div class="error">{error}</div>
        <button type="submit" disabled={busy}>
          Create password
        </button>
      </form>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
