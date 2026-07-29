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
   * Re-sends the current protection preferences (blockPrivateBrowsing,
   * blockAboutAddons, grantPrivateBrowsingAccess) to the native host so it
   * rewrites policies.json to match — otherwise these toggles only ever
   * take effect from the one-time CLI installer's hardcoded defaults.
   */
  | { kind: "apply-policy" }
  | {
      kind: "set-password";
      currentPassword: string | null;
      newPassword: string;
    }
  | { kind: "complete-setup"; password: string };

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
