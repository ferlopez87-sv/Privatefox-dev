import type { RuntimeRequest, RuntimeResponse } from "../shared/protocol";
import { getState, setState } from "../shared/storage";
import { EMAIL_CODE_TTL_MINUTES } from "../shared/constants";
import {
  completeSetup,
  issueEmailCode,
  lock,
  setPassword,
  unlockWithEmailCode,
  unlockWithPassword,
  unlockWithRecoveryCode,
} from "./lock-state";
import { callNativeHost } from "./native-bridge";
import { applyIdleTimeout } from "./idle-monitor";

async function handle(request: RuntimeRequest): Promise<RuntimeResponse> {
  switch (request.kind) {
    case "get-lock-state": {
      const state = await getState();
      return { ok: true, locked: state.setupComplete && state.locked };
    }
    case "unlock-attempt": {
      const ok = await unlockWithPassword(request.password);
      if (!ok) return { ok: false, error: "Incorrect password." };
      return { ok: true, locked: false };
    }
    case "recovery-attempt": {
      const newCode = await unlockWithRecoveryCode(request.code);
      if (newCode === null) {
        return { ok: false, error: "Invalid recovery code." };
      }
      return { ok: true, recoveryCode: newCode };
    }
    case "email-code-attempt": {
      const ok = await unlockWithEmailCode(request.code);
      if (!ok) return { ok: false, error: "Invalid or expired code." };
      return { ok: true, locked: false };
    }
    case "request-email-code": {
      const state = await getState();
      if (!state.recoveryEmail) {
        return { ok: false, error: "No recovery email is configured." };
      }
      const code = await issueEmailCode();
      const result = await callNativeHost({
        command: "send-recovery-email",
        to: state.recoveryEmail,
        code,
        expiresMinutes: EMAIL_CODE_TTL_MINUTES,
      });
      if (!result.ok) {
        // Do not leave a live emailed code around if sending failed.
        await setState({ emailCode: null });
        return { ok: false, error: result.error ?? "Email send failed." };
      }
      return { ok: true, locked: (await getState()).locked };
    }
    case "lock-now": {
      await lock();
      return { ok: true, locked: (await getState()).locked };
    }
    case "set-password": {
      const result = await setPassword(
        request.currentPassword,
        request.newPassword,
      );
      if (!result.ok) return result;
      return { ok: true, locked: (await getState()).locked };
    }
    case "complete-setup": {
      const state = await getState();
      if (state.setupComplete) {
        return { ok: false, error: "Setup has already been completed." };
      }
      if (request.password.length < 4) {
        return { ok: false, error: "Password must be at least 4 characters." };
      }
      const recoveryCode = await completeSetup(request.password);
      await applyIdleTimeout();
      return { ok: true, recoveryCode };
    }
  }
}

export function registerRouter(): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    // Returning a promise keeps the channel open for the async response.
    return handle(message as RuntimeRequest);
  });
}
