import { useState } from "preact/hooks";
import { sendToBackground } from "./state";

type Mode = "password" | "recovery" | "email";

/**
 * Unlock form used by the new-tab lock screen: password unlock, recovery
 * code entry, and the email-a-code flow. On recovery success the new
 * recovery code is displayed once and a password reset is required.
 */
export function LockForm(props: { recoveryEmailConfigured: boolean }) {
  const [mode, setMode] = useState<Mode>("password");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "password") {
        const res = await sendToBackground({
          kind: "unlock-attempt",
          password: value,
        });
        if (!res.ok) setError(res.error);
      } else if (mode === "recovery") {
        const res = await sendToBackground({
          kind: "recovery-attempt",
          code: value,
        });
        if (!res.ok) setError(res.error);
        else if ("recoveryCode" in res) setNewRecoveryCode(res.recoveryCode);
      } else {
        const res = await sendToBackground({
          kind: "email-code-attempt",
          code: value,
        });
        if (!res.ok) setError(res.error);
      }
    } finally {
      setValue("");
      setBusy(false);
    }
  };

  const requestEmailCode = async () => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await sendToBackground({ kind: "request-email-code" });
      if (res.ok) {
        setMode("email");
        setInfo("Code sent. Check your inbox — it expires in 15 minutes.");
      } else {
        setError(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  if (newRecoveryCode) {
    return (
      <div>
        <p>
          Unlocked. Your password was cleared — set a new one now from the
          extension options page. Your <strong>new recovery code</strong> is
          shown below <strong>one time only</strong>; store it somewhere safe
          (e.g. a password manager).
        </p>
        <div class="code">{newRecoveryCode}</div>
        <button onClick={() => browser.runtime.openOptionsPage()}>
          Open options to set a new password
        </button>
      </div>
    );
  }

  const placeholder =
    mode === "password"
      ? "Password"
      : mode === "recovery"
        ? "Recovery code"
        : "Emailed code";

  return (
    <div>
      <form class="row" onSubmit={submit}>
        <input
          type={mode === "password" ? "password" : "text"}
          placeholder={placeholder}
          value={value}
          autocomplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autofocus
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        />
        <button type="submit" disabled={busy}>
          Unlock
        </button>
      </form>
      <div class="error">{error}</div>
      {info && <div class="success">{info}</div>}
      <p>
        {mode !== "password" && (
          <span
            class="link"
            onClick={() => {
              setMode("password");
              setError("");
              setInfo("");
            }}
          >
            Use password
          </span>
        )}{" "}
        {mode !== "recovery" && (
          <span
            class="link"
            onClick={() => {
              setMode("recovery");
              setError("");
              setInfo("");
            }}
          >
            Use recovery code
          </span>
        )}{" "}
        {props.recoveryEmailConfigured && mode !== "email" && (
          <span class="link" onClick={() => void requestEmailCode()}>
            Email me a one-time code
          </span>
        )}
      </p>
    </div>
  );
}
