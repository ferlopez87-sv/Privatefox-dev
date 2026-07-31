import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { usePrivatefoxState, sendToBackground } from "../ui/state";
import { SettingsGate, useNow } from "../ui/settings-gate";
import { setState as patchState } from "../shared/storage";
import {
  PANIC_MODE_MINUTES,
  SETTINGS_PASS_TTL_MINUTES,
} from "../shared/constants";
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

/**
 * Protection toggles that map to Firefox Enterprise Policies. These cannot be
 * enforced by the extension alone — they take effect only once the Privatefox
 * native host has (re)written policies.json and Firefox has been restarted.
 */
/** Rejects only schemes that could do something surprising once landed on. */
function isSafeRedirectUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return !trimmed.startsWith("javascript:") && !trimmed.startsWith("data:");
}

function ProtectionSettings(props: {
  blockPrivateBrowsing: boolean;
  blockAboutAddons: boolean;
  grantPrivateBrowsingAccess: boolean;
  postGateRedirectUrl: string;
}) {
  const [blocked, setBlocked] = useState(props.blockPrivateBrowsing);
  const [addonsBlocked, setAddonsBlocked] = useState(props.blockAboutAddons);
  const [grantAccess, setGrantAccess] = useState(props.grantPrivateBrowsingAccess);
  const [redirectUrl, setRedirectUrl] = useState(props.postGateRedirectUrl);
  const [redirectError, setRedirectError] = useState("");
  const [policyResult, setPolicyResult] = useState("");
  const [status, setStatus] = useState("");

  useEffect(
    () => setBlocked(props.blockPrivateBrowsing),
    [props.blockPrivateBrowsing],
  );
  useEffect(
    () => setAddonsBlocked(props.blockAboutAddons),
    [props.blockAboutAddons],
  );
  useEffect(
    () => setGrantAccess(props.grantPrivateBrowsingAccess),
    [props.grantPrivateBrowsingAccess],
  );
  useEffect(
    () => setRedirectUrl(props.postGateRedirectUrl),
    [props.postGateRedirectUrl],
  );

  const saved = () => {
    setStatus("Saved.");
    setTimeout(() => setStatus(""), 2000);
  };

  const saveRedirectUrl = async () => {
    const trimmed = redirectUrl.trim();
    if (trimmed && !isSafeRedirectUrl(trimmed)) {
      setRedirectError("That URL scheme isn't allowed.");
      return;
    }
    setRedirectError("");
    await patchState({ postGateRedirectUrl: trimmed });
    saved();
  };

  const applyPolicy = async () => {
    setPolicyResult("");
    const res = await sendToBackground({ kind: "apply-policy" }) as { ok: true; detail?: string } | { ok: false; error: string };
    if (res.ok) {
      setPolicyResult(res.detail ?? "Policy applied. Restart Firefox for it to take effect.");
    } else {
      setPolicyResult(res.error);
    }
    setTimeout(() => setPolicyResult(""), 5000);
  };

  return (
    <section>
      <h2>Protection</h2>
      <label class="toggle">
        <input
          type="checkbox"
          checked={blocked}
          onChange={(e) => {
            const value = (e.target as HTMLInputElement).checked;
            setBlocked(value);
            void patchState({ blockPrivateBrowsing: value }).then(saved);
          }}
        />
        <span>Block private / incognito windows</span>
      </label>
      <p class="hint">
        Enforced by Firefox enterprise policies, not the extension itself.
        Applies after the Privatefox native host is installed and Firefox is
        restarted (see docs/SETUP.md). Until then this only records your
        preference.
      </p>

      <label class="toggle">
        <input
          type="checkbox"
          checked={addonsBlocked}
          onChange={(e) => {
            const value = (e.target as HTMLInputElement).checked;
            setAddonsBlocked(value);
            void patchState({ blockAboutAddons: value }).then(saved);
          }}
        />
        <span>Block about:addons entirely (enterprise policy)</span>
      </label>
      <p class="hint">
        On: about:addons is unreachable once the native host is installed —
        the strongest protection, but you cannot manage add-ons at all. Off:
        the page stays reachable and Privatefox asks for your password before
        opening it ({SETTINGS_PASS_TTL_MINUTES}-minute access, revoked on lock).
        The password gate works today, with or without the native host.
      </p>

      <label class="toggle">
        <input
          type="checkbox"
          checked={grantAccess}
          disabled={blocked}
          onChange={(e) => {
            const value = (e.target as HTMLInputElement).checked;
            setGrantAccess(value);
            void patchState({ grantPrivateBrowsingAccess: value }).then(saved);
          }}
        />
        <span>Grant private-window access for stats</span>
      </label>
      <p class="hint">
        Lets Privatefox track time spent in private windows for usage
        statistics. Only takes effect when private browsing is not blocked,
        the native host is installed, and Firefox is restarted.
      </p>

      <label>After entering the settings password, go to</label>
      <input
        type="text"
        placeholder="Leave blank to open the requested page (e.g. about:addons)"
        value={redirectUrl}
        onInput={(e) => setRedirectUrl((e.target as HTMLInputElement).value)}
      />
      <p class="hint">
        Applies to about:addons and every other password-gated page. Blank
        means go straight to whatever page was requested, as before.
      </p>
      <div class="error">{redirectError}</div>
      <button class="secondary" onClick={() => void saveRedirectUrl()}>
        Save redirect
      </button>

      <div class="row" style="margin-top: 0.75rem">
        <button class="secondary" onClick={() => void applyPolicy()}>
          Apply policy now
        </button>
      </div>
      <div class="success">{policyResult}</div>

      <div class="success">{status}</div>
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
      <h2>
        {props.hasPassword ? "Change browser password" : "Set a new browser password"}
      </h2>
      {!props.hasPassword && (
        <p class="hint">
          Your password was cleared by a recovery unlock — set a new one now.
        </p>
      )}
      <form onSubmit={submit}>
        {props.hasPassword && (
          <>
            <label>Current browser password</label>
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



/**
 * The second password: guards Firefox preferences, about:addons and this
 * page. Separate from the browsing password on purpose — that one is typed
 * all day and stops being a real decision.
 */
function SettingsPasswordSettings(props: { hasSettingsPassword: boolean }) {
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
    if (next === current) {
      setError("Pick a password different from the one you just entered.");
      return;
    }
    const res = await sendToBackground({
      kind: "set-settings-password",
      currentSecret: current,
      newPassword: next,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setStatus("Settings password updated.");
  };

  const clear = async () => {
    setError("");
    setStatus("");
    if (!current) {
      setError("Enter the current settings password to remove it.");
      return;
    }
    const res = await sendToBackground({
      kind: "clear-settings-password",
      currentSettingsPassword: current,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCurrent("");
    setStatus(
      "Settings password removed — the browser password guards these surfaces again.",
    );
  };

  return (
    <section>
      <h2>Settings password</h2>
      {props.hasSettingsPassword ? (
        <p class="hint">
          Firefox preferences, about:addons and this page need this password.
          The browser password does not open them.
        </p>
      ) : (
        <p class="hint">
          Not set — the browser password currently opens Firefox preferences,
          about:addons and this page. Setting a separate one here is the
          point of the feature: keep it somewhere you have to go and fetch,
          so turning the lock off stops being an impulse.
        </p>
      )}
      <form onSubmit={submit}>
        <label>
          {props.hasSettingsPassword
            ? "Current settings password"
            : "Browser password (to confirm it is you)"}
        </label>
        <input
          type="password"
          value={current}
          autocomplete="off"
          onInput={(e) => setCurrent((e.target as HTMLInputElement).value)}
        />
        <label>New settings password</label>
        <input
          type="password"
          value={next}
          autocomplete="new-password"
          onInput={(e) => setNext((e.target as HTMLInputElement).value)}
        />
        <label>Confirm new settings password</label>
        <input
          type="password"
          value={confirm}
          autocomplete="new-password"
          onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
        />
        <div class="error">{error}</div>
        <div class="success">{status}</div>
        <div class="row">
          <button type="submit">
            {props.hasSettingsPassword
              ? "Change settings password"
              : "Set settings password"}
          </button>
          {props.hasSettingsPassword && (
            <button type="button" class="secondary" onClick={() => void clear()}>
              Remove it
            </button>
          )}
        </div>
      </form>
      <p class="hint">
        Forgot it? Use "Forgot settings password?" on that prompt with your
        recovery code — it clears only this password, leaving your browser
        password and lock state untouched. (The recovery code or an emailed
        code from the lock screen still work too, but those reset
        everything, including your browser password.)
      </p>
    </section>
  );
}

function PanicScreen(props: { until: number }) {
  const remaining = Math.max(0, Math.ceil((props.until - Date.now()) / 1000));
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;

  return (
    <main class="centered">
      <h1>Panic mode active</h1>
      <p class="message">
        For the next {min}:{String(sec).padStart(2, "0")} no password will
        open Firefox preferences, about:addons, or these options — not even
        the correct one.
      </p>
      <p>
        <span
          class="link"
          onClick={() =>
            void browser.tabs.create({ url: "about:newtab" })
          }
        >
          Back to browsing
        </span>
      </p>
    </main>
  );
}

function App() {
  const state = usePrivatefoxState();
  // Hooks must run unconditionally, so this sits above the early returns.
  const now = useNow(state?.settingsPassUntil ?? null);
  const panicNow = useNow(state?.panicUntil ?? null);
  if (!state) return null;

  const passValid =
    state.settingsPassUntil !== null && now < state.settingsPassUntil;
  const panicActive =
    state.panicUntil !== null && panicNow < state.panicUntil;

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

  // Panic overrides even a valid pass — the whole point is that no
  // password, correct or not, can reach these surfaces during the window.
  if (panicActive) return <PanicScreen until={state.panicUntil!} />;

  // The pass expires on a wall-clock deadline, so re-check when it passes
  // rather than leaving the settings on screen until something else changes.
  if (!passValid) return <SettingsGate />;

  return (
    <main>
      <h1>Privatefox Options</h1>
      <GeneralSettings
        welcomeMessage={state.welcomeMessage}
        idleTimeoutMinutes={state.idleTimeoutMinutes}
        recoveryEmail={state.recoveryEmail}
      />
      <ProtectionSettings
        blockPrivateBrowsing={state.blockPrivateBrowsing}
        blockAboutAddons={state.blockAboutAddons}
        grantPrivateBrowsingAccess={state.grantPrivateBrowsingAccess}
        postGateRedirectUrl={state.postGateRedirectUrl}
      />
      <PasswordSettings hasPassword={state.passwordHash !== null} />
      <SettingsPasswordSettings
        hasSettingsPassword={state.settingsPasswordHash !== null}
      />
      <section>
        <h2>Lock</h2>
        <div class="row">
          <button
            class="secondary"
            onClick={() => void sendToBackground({ kind: "lock-now" })}
          >
            Lock the browser now
          </button>
          <button
            class="secondary"
            onClick={() =>
              void sendToBackground({ kind: "revoke-settings-pass" })
            }
          >
            Close preferences
          </button>
        </div>
      </section>

      <section>
        <h2>Panic mode</h2>
        <p class="hint">
          Emergency: for {PANIC_MODE_MINUTES} minutes no password can open
          the protected surfaces (not even the correct one), and private
          windows opened during the window are closed automatically.
        </p>
        <div class="row">
          <button
            class="secondary"
            onClick={() =>
              void sendToBackground({ kind: "activate-panic-mode" })
            }
          >
            Activate panic mode now
          </button>
        </div>
      </section>

      <section>
        <h2>Usage statistics</h2>
        <p class="hint">
          Track opens, unlocks, and time spent per domain — entirely local,
          never sent anywhere.{" "}
          <span
            class="link"
            onClick={() =>
              void browser.tabs.create({
                url: browser.runtime.getURL("src/dashboard/index.html"),
              })
            }
          >
            Open dashboard
          </span>
        </p>
      </section>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
