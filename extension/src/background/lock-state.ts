import { hashSecret, verifySecret } from "../shared/crypto";
import {
  generateEmailCode,
  generateRecoveryCode,
  normalizeRecoveryCode,
} from "../shared/recovery-code";
import { getState, setState } from "../shared/storage";
import { EMAIL_CODE_TTL_MINUTES } from "../shared/constants";

export async function lock(): Promise<void> {
  const state = await getState();
  // Locking before setup would be an unrecoverable lockout (no password
  // exists to unlock with), so the lock is a no-op until setup completes.
  if (!state.setupComplete) return;
  if (!state.locked) await setState({ locked: true });
}

export async function unlockWithPassword(password: string): Promise<boolean> {
  const state = await getState();
  if (!state.passwordHash) return false;
  const ok = await verifySecret(password, state.passwordHash);
  if (ok) await setState({ locked: false });
  return ok;
}

/**
 * Recovery code unlocks AND clears the password so the user is forced to
 * set a new one (the code is one-time by design: a fresh code is issued).
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

/** Like recovery-code unlock: clears the password, forces a reset. */
export async function unlockWithEmailCode(code: string): Promise<boolean> {
  const state = await getState();
  const active = state.emailCode;
  if (!active || Date.now() > active.expiresAt) return false;
  const ok = await verifySecret(code.trim(), active.hash);
  if (!ok) return false;
  await setState({ locked: false, passwordHash: null, emailCode: null });
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
