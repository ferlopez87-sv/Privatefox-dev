import { useState } from "preact/hooks";
import { useEffect } from "preact/hooks";
import { sendToBackground } from "./state";
import { SETTINGS_PASS_TTL_MINUTES } from "../shared/constants";

/**
 * Returns a timestamp that refreshes when `deadline` passes, so a pass
 * expiring while the page sits open actually closes it instead of leaving
 * the settings on screen until some other state change repaints.
 */
export function useNow(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      setNow(Date.now());
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), remaining + 50);
    return () => clearTimeout(timer);
  }, [deadline]);
  return now;
}

function SettingsPasswordRecovery(props: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await sendToBackground({
        kind: "reset-settings-password-with-recovery-code",
        code,
      });
      if (!res.ok) {
        setError(res.error);
        setCode("");
        return;
      }
      if ("recoveryCode" in res) setNewRecoveryCode(res.recoveryCode);
    } catch (err) {
      // Without this the promise rejected silently, leaving the form exactly
      // as it was — indistinguishable from a rejected code.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Opens preferences using the new code, then dismisses this screen. The
   * pass is claimed here rather than during the reset because a valid pass
   * makes the options page render the settings immediately, which would
   * unmount this screen before the one-time code could be read.
   */
  const continueToPreferences = async () => {
    if (busy || !newRecoveryCode) return;
    setBusy(true);
    setError("");
    try {
      const res = await sendToBackground({
        kind: "claim-settings-pass-with-recovery-code",
        code: newRecoveryCode,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (newRecoveryCode) {
    return (
      <main class="centered">
        <h1>Settings password removed</h1>
        <p class="message">
          Your settings password was cleared — your browser password now
          opens preferences again, where you can set a new one. Your
          recovery code was rotated; the new one is shown{" "}
          <strong>one time only</strong>. Store it somewhere safe.
        </p>
        <div class="code">{newRecoveryCode}</div>
        <button disabled={busy} onClick={() => void continueToPreferences()}>
          Continue to preferences
        </button>
        <div class="error">{error}</div>
      </main>
    );
  }

  return (
    <main class="centered">
      <h1>Reset settings password</h1>
      <p class="message">
        Enter your <strong>recovery code</strong> to clear the settings
        password. This does not touch your browser password or lock state.
      </p>
      <form class="row" onSubmit={submit}>
        <input
          type="text"
          placeholder="Recovery code"
          value={code}
          autocomplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autofocus
          onInput={(e) => setCode((e.target as HTMLInputElement).value)}
        />
        <button type="submit" disabled={busy}>
          Reset
        </button>
      </form>
      <div class="error">{error}</div>
      <p>
        <span class="link" onClick={props.onDone}>
          Back to password entry
        </span>
      </p>
    </main>
  );
}

export function SettingsGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);

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
      if (!res.ok) setError(res.error);
      setPassword("");
    } catch (err) {
      // A rejected sendMessage (background page asleep, listener not yet
      // registered) used to leave the form untouched and silent.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (recovering) {
    return <SettingsPasswordRecovery onDone={() => setRecovering(false)} />;
  }

  return (
    <main class="centered">
      <h1>Password required</h1>
      <p class="message">
        Enter your <strong>settings password</strong> to open Privatefox
        preferences.
      </p>
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
        Preferences stay open for {SETTINGS_PASS_TTL_MINUTES} minutes, and
        close as soon as the browser locks.
      </p>
      <p>
        <span class="link" onClick={() => setRecovering(true)}>
          Forgot settings password?
        </span>
      </p>
    </main>
  );
}
