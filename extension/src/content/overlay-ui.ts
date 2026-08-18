import type { RuntimeRequest, RuntimeResponse } from "../shared/protocol";
import { followRedirect } from "../shared/url";

/**
 * Lock overlay rendered inside a closed ShadowRoot attached to a host
 * element on documentElement, so page CSS/JS cannot restyle or reach it.
 * Plain DOM (no framework) keeps the content-script bundle minimal.
 */

const HOST_ID = "privatefox-lock-host";

function send(request: RuntimeRequest): Promise<RuntimeResponse> {
  return browser.runtime.sendMessage(request) as Promise<RuntimeResponse>;
}

const CSS = `
  :host { all: initial; }
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647;
    background: #ffffff; color: #36454f;
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, "Segoe UI", "Helvetica Neue", sans-serif;
  }
  .panel { max-width: 26rem; width: 90%; text-align: center; }
  h1 { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 0.75rem; }
  p.message { font-size: 1rem; color: #708090; margin: 0 0 1.5rem; white-space: pre-wrap; }
  form { display: flex; gap: 0.5rem; justify-content: center; }
  input {
    flex: 1; padding: 0.6rem 0.8rem; font-size: 1rem;
    border-radius: 4px; border: 1px solid #d3d3d3;
    background: #ffffff; color: #36454f;
  }
  input:focus { outline: 2px solid #708090; border-color: transparent; }
  button {
    padding: 0.6rem 1.2rem; font-size: 1rem; border-radius: 4px;
    border: 1px solid #36454f; background: #36454f; color: #ffffff;
    font-weight: 600; cursor: pointer;
  }
  .error { color: #b33a3a; min-height: 1.25rem; margin-top: 0.75rem; font-size: 0.9rem; }
  .alt { margin-top: 1.25rem; font-size: 0.85rem; }
  .alt a { color: #36454f; cursor: pointer; text-decoration: underline; }
`;

export class LockOverlay {
  private host: HTMLElement | null = null;
  /**
   * Kept on the instance rather than captured in the submit handler so a
   * change to the preference reaches an overlay that is already on screen —
   * show() is a no-op once the host exists, but it still refreshes this.
   */
  private postUnlockRedirectUrl = "";

  isShown(): boolean {
    return this.host !== null;
  }

  show(welcomeMessage: string, postUnlockRedirectUrl = ""): void {
    this.postUnlockRedirectUrl = postUnlockRedirectUrl;
    if (this.host) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = CSS;

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";

    const panel = document.createElement("div");
    panel.className = "panel";

    const title = document.createElement("h1");
    title.textContent = "Privatefox is locked";

    const message = document.createElement("p");
    message.className = "message";
    message.textContent = welcomeMessage;

    const form = document.createElement("form");
    const input = document.createElement("input");
    input.type = "password";
    input.placeholder = "Password";
    input.autocomplete = "off";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Unlock";
    form.append(input, submit);

    const error = document.createElement("div");
    error.className = "error";

    const alt = document.createElement("div");
    alt.className = "alt";
    const recoveryLink = document.createElement("a");
    recoveryLink.textContent = "Forgot password? Open a new tab for recovery options.";
    alt.append(recoveryLink);

    let mode: "unlock-attempt" | "recovery-attempt" = "unlock-attempt";
    recoveryLink.addEventListener("click", () => {
      mode = mode === "unlock-attempt" ? "recovery-attempt" : "unlock-attempt";
      input.type = mode === "unlock-attempt" ? "password" : "text";
      input.placeholder =
        mode === "unlock-attempt" ? "Password" : "Recovery code";
      recoveryLink.textContent =
        mode === "unlock-attempt"
          ? "Forgot password? Open a new tab for recovery options."
          : "Back to password unlock.";
      error.textContent = "";
      input.value = "";
      input.focus();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value;
      if (!value) return;
      void send(
        mode === "unlock-attempt"
          ? { kind: "unlock-attempt", password: value }
          : { kind: "recovery-attempt", code: value },
      ).then((response) => {
        if (response.ok) {
          if ("recoveryCode" in response) {
            // Recovery path: password was cleared; the new-tab lock screen
            // handles new-code display + forced reset. Keep it simple here.
            alert(
              "Unlocked via recovery. Your NEW recovery code is:\n\n" +
                response.recoveryCode +
                "\n\nSave it now — it will not be shown again. " +
                "Set a new password from the extension options page.",
            );
          } else if (followRedirect(this.postUnlockRedirectUrl, false)) {
            // Password unlock with a start page configured: navigate this
            // tab there. assign(), not replace(), so Back still returns to
            // the page the browser locked on top of. The overlay goes away
            // with the navigation; nothing left to hide.
            return;
          }
          // Hiding happens via the storage.onChanged listener; hide
          // directly too in case this tab's script raced the change.
          this.hide();
        } else {
          error.textContent = response.error;
          input.value = "";
          input.focus();
        }
      });
    });

    panel.append(title, message, form, error, alt);
    backdrop.append(panel);
    shadow.append(style, backdrop);

    document.documentElement.appendChild(host);
    this.host = host;
    input.focus();
  }

  hide(): void {
    this.host?.remove();
    this.host = null;
  }
}
