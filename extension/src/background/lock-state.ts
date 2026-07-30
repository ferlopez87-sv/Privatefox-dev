import { hashSecret, verifySecret } from "../shared/crypto";
import {
  generateEmailCode,
  generateRecoveryCode,
  normalizeRecoveryCode,
} from "../shared/recovery-code";
import { getState, setState } from "../shared/storage";
import {
  EMAIL_CODE_TTL_MINUTES,
  SETTINGS_PASS_TTL_MINUTES,
} from "../shared/constants";
import { surfaceLockScreen } from "./surface-lock";

export async function lock(): Promise<void> {
  const state = await getState();
  // Locking before setup would be an unrecoverable lockout (no password
  // exists to unlock with), so the lock is a no-op until setup completes.
  if (!state.setupComplete) return;
  // Locking always revokes outstanding passes — otherwise a pass taken
  // before locking would survive it.
  await setState({ locked: true, settingsPassUntil: null });
  // Persisting `locked` only draws the overlay on ordinary web pages; this
  // puts the lock screen on surfaces the content script cannot reach.
  // Unconditional (not just on a false -> true transition) so that a lock
  // triggered while already locked still re-asserts a visible lock screen.
  await surfaceLockScreen();
}

/**
 * Verify a candidate against the settings password.
 *
 * Falls back to the browsing password while no settings password is set —
 * without that fallback a fresh install could never reach the options page
 * to configure one. Once set, the browsing password is NOT accepted here:
 * that separation is the whole point, since the browsing password is typed
 * constantly and the settings password guards turning the lock off.
 */
async function verifySettingsSecret(candidate: string): Promise<boolean> {
  const state = await getState();
  const target = state.settingsPasswordHash ?? state.passwordHash;
  if (!target) return false;
  return verifySecret(candidate, target);
}

/**
 * Grant temporary access to the protected surfaces (Firefox preferences,
 * about:addons, this extension's options) after verifying the settings
 * password. One pass covers all of them and is revoked on lock.
 */
export async function grantSettingsPass(password: string): Promise<boolean> {
  if (!(await verifySettingsSecret(password))) return false;
  await setState({
    settingsPassUntil: Date.now() + SETTINGS_PASS_TTL_MINUTES * 60_000,
  });
  return true;
}

/**
 * Set or change the settings password. Changing it requires the current
 * settings password; setting it for the first time requires the browsing
 * password, so an unlocked browser alone is not enough to claim it.
 */
export async function setSettingsPassword(
  currentSecret: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 4) {
    return { ok: false, error: "Password must be at least 4 characters." };
  }
  const state = await getState();
  if (state.settingsPasswordHash) {
    if (!(await verifySecret(currentSecret, state.settingsPasswordHash))) {
      return { ok: false, error: "Current settings password is incorrect." };
    }
  } else {
    if (
      !state.passwordHash ||
      !(await verifySecret(currentSecret, state.passwordHash))
    ) {
      return { ok: false, error: "Browser password is incorrect." };
    }
  }
  await setState({ settingsPasswordHash: await hashSecret(newPassword) });
  return { ok: true };
}

/**
 * Drop the settings password, returning to the fallback where the browsing
 * password guards the protected surfaces. Requires the current one.
 */
export async function clearSettingsPassword(
  currentSettingsPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = await getState();
  if (!state.settingsPasswordHash) return { ok: true };
  if (
    !(await verifySecret(currentSettingsPassword, state.settingsPasswordHash))
  ) {
    return { ok: false, error: "Current settings password is incorrect." };
  }
  await setState({ settingsPasswordHash: null, settingsPassUntil: null });
  return { ok: true };
}

/**
 * Forgot-settings-password path: proves identity with the recovery code and
 * clears ONLY the settings password (not the browsing password or lock
 * state) — for someone who is already unlocked and just locked out of
 * preferences, not someone who forgot how to unlock the browser. Rotates
 * the recovery code like every other use of it, since it's one-time by
 * design. Returns the new recovery code, or null if the code was wrong.
 */
export async function resetSettingsPasswordWithRecoveryCode(
  code: string,
): Promise<string | null> {
  const state = await getState();
  if (!state.recoveryHash) return null;
  const ok = await verifySecret(normalizeRecoveryCode(code), state.recoveryHash);
  if (!ok) return null;
  const newCode = generateRecoveryCode();
  await setState({
    settingsPasswordHash: null,
    settingsPassUntil: null,
    recoveryHash: await hashSecret(newCode),
  });
  return newCode;
}

/** True while a granted preferences pass is still within its TTL. */
export async function hasValidSettingsPass(): Promise<boolean> {
  const { settingsPassUntil } = await getState();
  return settingsPassUntil !== null && Date.now() < settingsPassUntil;
}

export async function revokeSettingsPass(): Promise<void> {
  await setState({ settingsPassUntil: null });
}

export async function unlockWithPassword(password: string): Promise<boolean> {
  const state = await getState();
  if (!state.passwordHash) return false;
  const ok = await verifySecret(password, state.passwordHash);
  if (ok) await setState({ locked: false });
  return ok;
}

/**
 * Recovery code unlocks AND clears both passwords so the user is forced to
 * set new ones (the code is one-time by design: a fresh code is issued).
 * The settings password is cleared too — it is the only way back in if that
 * is the one you forgot, and recovery is already the deliberate escape
 * hatch: one-time, rotated on use, and meant to be stored inconveniently.
 * Returns the new recovery code to display, or null if the code was wrong.
 */
export async function unlockWithRecoveryCode(
  code: string,
): Promise<string | null> {
  const state = await getState();
  if (!state.recoveryHash) return null;
  const ok = await verifySecret(normalizeRecoveryCode(code), state.recoveryHash);
  if (!ok) return null;
  const newCode = generateRecoveryCode();
  await setState({
    locked: false,
    passwordHash: null,
    settingsPasswordHash: null,
    settingsPassUntil: null,
    recoveryHash: await hashSecret(newCode),
  });
  return newCode;
}

/** Issue a short-lived one-time email code; returns the plaintext to email. */
export async function issueEmailCode(): Promise<string> {
  const code = generateEmailCode();
  await setState({
    emailCode: {
      hash: await hashSecret(code),
      expiresAt: Date.now() + EMAIL_CODE_TTL_MINUTES * 60_000,
    },
  });
  return code;
}

/** Like recovery-code unlock: clears both passwords, forces a reset. */
export async function unlockWithEmailCode(code: string): Promise<boolean> {
  const state = await getState();
  const active = state.emailCode;
  if (!active || Date.now() > active.expiresAt) return false;
  const ok = await verifySecret(code.trim(), active.hash);
  if (!ok) return false;
  await setState({
    locked: false,
    passwordHash: null,
    settingsPasswordHash: null,
    settingsPassUntil: null,
    emailCode: null,
  });
  return true;
}

export async function setPassword(
  currentPassword: string | null,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 4) {
    return { ok: false, error: "Password must be at least 4 characters." };
  }
  const state = await getState();
  // A stored hash requires proof of the current password — except right
  // after a recovery unlock, when passwordHash is null and a reset is forced.
  if (state.passwordHash) {
    if (
      currentPassword === null ||
      !(await verifySecret(currentPassword, state.passwordHash))
    ) {
      return { ok: false, error: "Current password is incorrect." };
    }
  }
  await setState({ passwordHash: await hashSecret(newPassword) });
  return { ok: true };
}

/**
 * First-run setup: store the password, generate the recovery code, and
 * return the code for its one-time display.
 */
export async function completeSetup(password: string): Promise<string> {
  const code = generateRecoveryCode();
  await setState({
    setupComplete: true,
    locked: false,
    passwordHash: await hashSecret(password),
    recoveryHash: await hashSecret(code),
  });
  return code;
}
