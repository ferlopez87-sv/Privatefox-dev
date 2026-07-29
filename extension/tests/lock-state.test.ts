import { describe, expect, it, vi } from "vitest";
import {
  completeSetup,
  grantAddonsPass,
  grantSettingsPass,
  hasValidAddonsPass,
  hasValidSettingsPass,
  issueEmailCode,
  lock,
  revokeAddonsPass,
  setPassword,
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

  it("about:addons pass requires the password and expires", async () => {
    await completeSetup("hunter22");
    expect(await hasValidAddonsPass()).toBe(false);

    expect(await grantAddonsPass("wrong")).toBe(false);
    expect(await hasValidAddonsPass()).toBe(false);

    expect(await grantAddonsPass("hunter22")).toBe(true);
    expect(await hasValidAddonsPass()).toBe(true);

    // Expires after its TTL (5 minutes).
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect(await hasValidAddonsPass()).toBe(false);
    vi.useRealTimers();
  });

  it("locking revokes an outstanding about:addons pass", async () => {
    await completeSetup("hunter22");
    expect(await grantAddonsPass("hunter22")).toBe(true);
    expect(await hasValidAddonsPass()).toBe(true);

    await lock();
    expect(await hasValidAddonsPass()).toBe(false);
    expect((await getState()).addonsPassUntil).toBeNull();
  });

  it("revokes the about:addons pass on demand", async () => {
    await completeSetup("hunter22");
    await grantAddonsPass("hunter22");
    await revokeAddonsPass();
    expect(await hasValidAddonsPass()).toBe(false);
  });

  it("grants no about:addons pass when the password was cleared by recovery", async () => {
    const code = await completeSetup("hunter22");
    await lock();
    await unlockWithRecoveryCode(code);
    // passwordHash is null until a new password is set — nothing to verify.
    expect(await grantAddonsPass("hunter22")).toBe(false);
    expect(await hasValidAddonsPass()).toBe(false);
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
