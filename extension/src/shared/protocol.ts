/**
 * Message types shared between extension surfaces (runtime messaging) and
 * mirrored by the native host (native messaging). The native host imports
 * the Native* types from its own copy — keep the shapes in sync with
 * native-host/src/protocol.ts.
 */

// ---- Extension-internal runtime messages (content/newtab/options -> background)

export type RuntimeRequest =
  | { kind: "get-lock-state" }
  | { kind: "unlock-attempt"; password: string }
  | { kind: "recovery-attempt"; code: string }
  | { kind: "email-code-attempt"; code: string }
  | { kind: "request-email-code" }
  | { kind: "lock-now" }
  /**
   * Settings password: unlocks the protected surfaces (Firefox preferences,
   * about:addons, this extension's options) with one shared pass.
   */
  | { kind: "settings-access-attempt"; password: string }
  | { kind: "revoke-settings-pass" }
  | {
      kind: "set-settings-password";
      currentSecret: string;
      newPassword: string;
    }
  | { kind: "clear-settings-password"; currentSettingsPassword: string }
  /**
   * Forgot-settings-password path: proves identity with the recovery code
   * (the same one-time code used for full account recovery) and clears
   * ONLY settingsPasswordHash — the browsing password and lock state are
   * left untouched, since this is for someone who is already unlocked and
   * just locked out of preferences. Rotates the recovery code like every
   * other use of it.
   */
  | { kind: "reset-settings-password-with-recovery-code"; code: string }
  /**
   * Second half of that flow: opens preferences right after the reset,
   * proving identity with the NEW recovery code the reset just returned.
   *
   * Split in two on purpose. The reset cannot grant the pass itself: doing
   * so flips the options page straight to the settings, unmounting the
   * screen that shows the new one-time recovery code before the user has
   * read it. So the code is displayed first, and this is sent when they
   * press "Continue to preferences". Verifies but does NOT rotate — the
   * code was already rotated by the reset moments earlier.
   */
  | { kind: "claim-settings-pass-with-recovery-code"; code: string }
  | {
      kind: "set-password";
      currentPassword: string | null;
      newPassword: string;
    }
  | { kind: "complete-setup"; password: string }
  /**
   * Ask the native host to re-write policies.json from the current state.
   * The extension itself calls this when the user clicks "Apply policy now"
   * in Options, but it is also exposed as a public RuntimeRequest so a
   * fresh session can trigger it from anywhere during setup.
   */
  | { kind: "apply-policy" }
  /**
   * Emergency "panic button": for a hardcoded window no password — not even
   * a correct one — can open any protected surface (about:addons,
   * about:preferences, options). Any private window opened while active is
   * closed immediately. See lock-state's activatePanicMode.
   */
  | { kind: "activate-panic-mode" };

export type RuntimeResponse =
  | { ok: true; locked: boolean }
  | { ok: true; recoveryCode: string }
  | { ok: true; detail?: string }
  | { ok: false; error: string };

// ---- Native messaging commands (background -> native host)

export type NativeCommand =
  | {
      command: "install-policy";
      xpiPath?: string;
      disablePrivateBrowsing?: boolean;
      blockAboutAddons?: boolean;
      grantPrivateBrowsingAccess?: boolean;
    }
  | {
      command: "send-recovery-email";
      to: string;
      code: string;
      expiresMinutes: number;
    };

export interface NativeResult {
  ok: boolean;
  error?: string;
  detail?: string;
}
