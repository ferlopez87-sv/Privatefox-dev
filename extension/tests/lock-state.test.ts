import { describe, expect, it, vi } from "vitest";
import {
  clearSettingsPassword,
  completeSetup,
  grantSettingsPass,
  hasValidSettingsPass,
  issueEmailCode,
  lock,
  resetSettingsPasswordWithRecoveryCode,
  revokeSettingsPass,
  setPassword,
  setSettingsPassword,
  unlockWithEmailCode,
  unlockWithPassword,
  unlockWithRecoveryCode,
} from "../src/background/lock-state";
import { getState } from "../src/shared/storage";

describe("lock state machine", () => {
  it("lock is a no-op before setup (prevents unrecoverable lockout)", async () => {
    await lock();
    expect((await getState()).locked).toBe(false);
  });

  it("completes setup unlocked, then locks and unlocks with the password", async () => {
    const code = await completeSetup("hunter22");
    expect(code).toMatch(/-/);
    let state = await getState();
    expect(state.setupComplete).toBe(true);
    expect(state.locked).toBe(false);
    expect(state.passwordHash).not.toBeNull();

    await lock();
    expect((await getState()).locked).toBe(true);

    expect(await unlockWithPassword("wrong")).toBe(false);
    expect((await getState()).locked).toBe(true);

    expect(await unlockWithPassword("hunter22")).toBe(true);
    expect((await getState()).locked).toBe(false);
  });

  it("recovery unlock clears the password and rotates the code", async () => {
    const code = await completeSetup("hunter22");
    await lock();

    expect(await unlockWithRecoveryCode("WRONG-CODES-WRONG-CODES-WRONG")).toBe(
      null,
    );

    const newCode = await unlockWithRecoveryCode(code);
    expect(newCode).not.toBeNull();
    expect(newCode).not.toBe(code);

    const state = await getState();
    expect(state.locked).toBe(false);
    expect(state.passwordHash).toBeNull();

    // Old code is dead; new code works (accepting sloppy input).
    await lock();
    expect(await unlockWithRecoveryCode(code)).toBeNull();
    expect(
      await unlockWithRecoveryCode(newCode!.toLowerCase()),
    ).not.toBeNull();
  });

  it("after recovery, a new password can be set without the old one", async () => {
    const code = await completeSetup("original");
    await unlockWithRecoveryCode(code);

    const res = await setPassword(null, "brand-new");
    expect(res.ok).toBe(true);
    await lock();
    expect(await unlockWithPassword("brand-new")).toBe(true);
  });

  it("password change requires the current password", async () => {
    await completeSetup("original");
    expect(await setPassword(null, "sneaky")).toEqual({
      ok: false,
      error: "Current password is incorrect.",
    });
    expect((await setPassword("wrong", "sneaky")).ok).toBe(false);
    expect((await setPassword("original", "updated")).ok).toBe(true);
    expect(await unlockWithPassword("original")).toBe(false);
    expect(await unlockWithPassword("updated")).toBe(true);
  });

  it("rejects short passwords", async () => {
    await completeSetup("original");
    expect((await setPassword("original", "abc")).ok).toBe(false);
  });

  it("settings pass requires the password and expires", async () => {
    await completeSetup("hunter22");
    expect(await hasValidSettingsPass()).toBe(false);

    expect(await grantSettingsPass("wrong")).toBe(false);
    expect(await hasValidSettingsPass()).toBe(false);

    expect(await grantSettingsPass("hunter22")).toBe(true);
    expect(await hasValidSettingsPass()).toBe(true);

    // Expires after its TTL (5 minutes).
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect(await hasValidSettingsPass()).toBe(false);
    vi.useRealTimers();
  });

  it("locking revokes an outstanding settings pass", async () => {
    await completeSetup("hunter22");
    expect(await grantSettingsPass("hunter22")).toBe(true);
    expect(await hasValidSettingsPass()).toBe(true);

    await lock();
    expect(await hasValidSettingsPass()).toBe(false);
    expect((await getState()).settingsPassUntil).toBeNull();
  });

  it("revokes the settings pass on demand", async () => {
    await completeSetup("hunter22");
    await grantSettingsPass("hunter22");
    await revokeSettingsPass();
    expect(await hasValidSettingsPass()).toBe(false);
  });

  it("grants no settings pass when recovery cleared the passwords", async () => {
    const code = await completeSetup("hunter22");
    await lock();
    await unlockWithRecoveryCode(code);
    // passwordHash is null until a new password is set — nothing to verify.
    expect(await grantSettingsPass("hunter22")).toBe(false);
    expect(await hasValidSettingsPass()).toBe(false);
  });

  it("preferences pass requires the password, expires, and dies on lock", async () => {
    await completeSetup("hunter22");
    expect(await hasValidSettingsPass()).toBe(false);

    expect(await grantSettingsPass("wrong")).toBe(false);
    expect(await hasValidSettingsPass()).toBe(false);

    expect(await grantSettingsPass("hunter22")).toBe(true);
    expect(await hasValidSettingsPass()).toBe(true);

    await lock();
    expect(await hasValidSettingsPass()).toBe(false);

    // And it expires on its own after the TTL.
    await unlockWithPassword("hunter22");
    await grantSettingsPass("hunter22");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect(await hasValidSettingsPass()).toBe(false);
    vi.useRealTimers();
  });

  it("falls back to the browser password until a settings password exists", async () => {
    await completeSetup("browsing-pw");
    // Otherwise there would be no way into the options page to set one.
    expect(await grantSettingsPass("browsing-pw")).toBe(true);
  });

  it("stops accepting the browser password once a settings password is set", async () => {
    await completeSetup("browsing-pw");
    expect(
      (await setSettingsPassword("browsing-pw", "settings-pw")).ok,
    ).toBe(true);

    // The separation is the whole point of the second password.
    expect(await grantSettingsPass("browsing-pw")).toBe(false);
    expect(await grantSettingsPass("settings-pw")).toBe(true);

    // ...and the browser still unlocks with the browsing password only.
    await lock();
    expect(await unlockWithPassword("settings-pw")).toBe(false);
    expect(await unlockWithPassword("browsing-pw")).toBe(true);
  });

  it("claiming the settings password requires the browser password", async () => {
    await completeSetup("browsing-pw");
    expect(await setSettingsPassword("wrong", "settings-pw")).toEqual({
      ok: false,
      error: "Browser password is incorrect.",
    });
    expect((await setSettingsPassword("browsing-pw", "abc")).ok).toBe(false);
  });

  it("changing the settings password requires the current one", async () => {
    await completeSetup("browsing-pw");
    await setSettingsPassword("browsing-pw", "settings-pw");

    // The browser password no longer authorizes a change.
    expect((await setSettingsPassword("browsing-pw", "sneaky")).ok).toBe(false);
    expect((await setSettingsPassword("settings-pw", "updated-pw")).ok).toBe(
      true,
    );
    expect(await grantSettingsPass("updated-pw")).toBe(true);
  });

  it("removing the settings password restores the fallback", async () => {
    await completeSetup("browsing-pw");
    await setSettingsPassword("browsing-pw", "settings-pw");

    expect((await clearSettingsPassword("wrong")).ok).toBe(false);
    expect((await clearSettingsPassword("settings-pw")).ok).toBe(true);
    expect(await grantSettingsPass("browsing-pw")).toBe(true);
  });

  it("resets a forgotten settings password with the recovery code, leaving browsing untouched", async () => {
    const code = await completeSetup("browsing-pw");
    await setSettingsPassword("browsing-pw", "settings-pw");
    // The bug this fixes: once a settings password exists, there was no
    // way back in if you forgot it short of the full-account recovery flow.
    expect(await grantSettingsPass("browsing-pw")).toBe(false);

    expect(
      await resetSettingsPasswordWithRecoveryCode("WRONG-CODES-WRONG-CODES-WRONG"),
    ).toBeNull();

    const newCode = await resetSettingsPasswordWithRecoveryCode(code);
    expect(newCode).not.toBeNull();
    expect(newCode).not.toBe(code);

    const state = await getState();
    expect(state.settingsPasswordHash).toBeNull();
    expect(state.settingsPassUntil).toBeNull();
    // Browsing password and lock state are untouched — this is not a
    // full-account recovery.
    expect(state.passwordHash).not.toBeNull();
    expect(state.locked).toBe(false);
    expect(await unlockWithPassword("browsing-pw")).toBe(true);
    // The fallback to the browsing password works again for settings too.
    expect(await grantSettingsPass("browsing-pw")).toBe(true);

    // The old recovery code is dead; the rotated one works.
    expect(await resetSettingsPasswordWithRecoveryCode(code)).toBeNull();
    expect(
      await resetSettingsPasswordWithRecoveryCode(newCode!.toLowerCase()),
    ).not.toBeNull();
  });

  it("recovery clears BOTH passwords (the way back if you forget either)", async () => {
    const code = await completeSetup("browsing-pw");
    await setSettingsPassword("browsing-pw", "settings-pw");
    await lock();

    await unlockWithRecoveryCode(code);

    const state = await getState();
    expect(state.passwordHash).toBeNull();
    expect(state.settingsPasswordHash).toBeNull();
  });

  it("email-code recovery also clears both passwords", async () => {
    await completeSetup("browsing-pw");
    await setSettingsPassword("browsing-pw", "settings-pw");
    await lock();

    const code = await issueEmailCode();
    expect(await unlockWithEmailCode(code)).toBe(true);

    const state = await getState();
    expect(state.passwordHash).toBeNull();
    expect(state.settingsPasswordHash).toBeNull();
  });

  it("email codes are one-time and expire", async () => {
    await completeSetup("original");
    await lock();

    const code = await issueEmailCode();
    expect(await unlockWithEmailCode("00000000")).toBe(false);
    expect(await unlockWithEmailCode(code)).toBe(true);
    expect((await getState()).locked).toBe(false);
    // Password is cleared, forcing a reset.
    expect((await getState()).passwordHash).toBeNull();

    // Consumed: same code cannot unlock twice.
    await setPassword(null, "again-ok");
    await lock();
    expect(await unlockWithEmailCode(code)).toBe(false);

    // Expired codes fail.
    const second = await issueEmailCode();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60_000);
    expect(await unlockWithEmailCode(second)).toBe(false);
    vi.useRealTimers();
  });
});
