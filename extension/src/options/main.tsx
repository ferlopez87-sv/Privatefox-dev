import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { usePrivatefoxState, sendToBackground } from "../ui/state";
import { setState as patchState } from "../shared/storage";
import "../ui/styles.css";

/** Welcome message + idle timeout + recovery email: editable without a password. */
function GeneralSettings(props: {
  welcomeMessage: string;
  idleTimeoutMinutes: number;
  recoveryEmail: string;
}) {
  const [message, setMessage] = useState(props.welcomeMessage);
  const [minutes, setMinutes] = useState(String(props.idleTimeoutMinutes));
  const [email, setEmail] = useState(props.recoveryEmail);
  const [status, setStatus] = useState("");

  // Sync from storage when it changes elsewhere.
  useEffect(() => setMessage(props.welcomeMessage), [props.welcomeMessage]);
  useEffect(
    () => setMinutes(String(props.idleTimeoutMinutes)),
    [props.idleTimeoutMinutes],
  );
  useEffect(() => setEmail(props.recoveryEmail), [props.recoveryEmail]);

  const save = async () => {
    const parsed = Number(minutes);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setStatus("Idle timeout must be at least 1 minute.");
      return;
    }
    await patchState({
      welcomeMessage: message,
      idleTimeoutMinutes: parsed,
      recoveryEmail: email.trim(),
    });
    setStatus("Saved.");
    setTimeout(() => setStatus(""), 2000);
  };

  return (
    <section>
      <h2>General</h2>
      <label>Lock screen message</label>
      <textarea
        rows={3}
        value={message}
        onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
      />
      <label>Lock after inactivity (minutes)</label>
      <input
        type="number"
        min={1}
        value={minutes}
        onInput={(e) => setMinutes((e.target as HTMLInputElement).value)}
      />
      <label>Recovery email</label>
      <input
        type="email"
        value={email}
        placeholder="you@example.com"
        onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
      />
      <p class="hint">
        Email recovery needs the Privatefox native host installed on this Mac.
      </p>
      <div class="success">{status}</div>
      <button onClick={() => void save()}>Save general settings</button>
    </section>
  );
}

/** Password create/change: always goes through the background router. */
function PasswordSettings(props: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const submit = async (event: Event) => {
    event.preventDefault();
    setError("");
    setStatus("");
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    const res = await sendToBackground({
      kind: "set-password",
      currentPassword: props.hasPassword ? current : null,
      newPassword: next,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setStatus("Password updated.");
  };

  return (
    <section>
      <h2>{props.hasPassword ? "Change password" : "Set a new password"}</h2>
      {!props.hasPassword && (
        <p class="hint">
          Your password was cleared by a recovery unlock — set a new one now.
        </p>
      )}
      <form onSubmit={submit}>
        {props.hasPassword && (
          <>
            <label>Current password</label>
            <input
              type="password"
              value={current}
              autocomplete="off"
              onInput={(e) =>
                setCurrent((e.target as HTMLInputElement).value)
              }
            />
          </>
        )}
        <label>New password</label>
        <input
          type="password"
          value={next}
          autocomplete="new-password"
          onInput={(e) => setNext((e.target as HTMLInputElement).value)}
        />
        <label>Confirm new password</label>
        <input
          type="password"
          value={confirm}
          autocomplete="new-password"
          onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
        />
        <div class="error">{error}</div>
        <div class="success">{status}</div>
        <button type="submit">
          {props.hasPassword ? "Change password" : "Set password"}
        </button>
      </form>
    </section>
  );
}

function App() {
  const state = usePrivatefoxState();
  if (!state) return null;

  if (!state.setupComplete) {
    return (
      <main>
        <h1>Privatefox Options</h1>
        <p>
          Run first-time setup before configuring options.{" "}
          <span
            class="link"
            onClick={() =>
              void browser.tabs.create({
                url: browser.runtime.getURL("src/setup/index.html"),
              })
            }
          >
            Open setup
          </span>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Privatefox Options</h1>
      <GeneralSettings
        welcomeMessage={state.welcomeMessage}
        idleTimeoutMinutes={state.idleTimeoutMinutes}
        recoveryEmail={state.recoveryEmail}
      />
      <PasswordSettings hasPassword={state.passwordHash !== null} />
      <section>
        <h2>Lock</h2>
        <button
          class="secondary"
          onClick={() => void sendToBackground({ kind: "lock-now" })}
        >
          Lock the browser now
        </button>
      </section>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
