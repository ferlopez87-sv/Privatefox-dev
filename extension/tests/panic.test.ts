import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activatePanicMode,
  claimSettingsPassWithRecoveryCode,
  completeSetup,
  grantSettingsPass,
  hasActivePanic,
  hasValidSettingsPass,
  maybeCloseIncognitoWindow,
  resetSettingsPasswordWithRecoveryCode,
  setSettingsPassword,
} from "../src/background/lock-state";
import { getState, setState } from "../src/shared/storage";
import { makeFakeBrowser } from "./setup";

let fake: ReturnType<typeof makeFakeBrowser>;

beforeEach(() => {
  fake = makeFakeBrowser([]);
  (globalThis as Record<string, unknown>).browser = fake;
});

describe("panic mode state", () => {
  it("is inactive by default", async () => {
    expect(hasActivePanic(await getState())).toBe(false);
  });

  it("activates for a wall-clock window and expires on its own", async () => {
    await completeSetup("browsing-pw");

    await activatePanicMode();

    const state = await getState();
    expect(state.panicUntil).not.toBeNull();
    expect(hasActivePanic(state)).toBe(true);

    // No timer needed: the deadline just passes.
    vi.useFakeTimers();
    vi.setSystemTime((state.panicUntil ?? 0) + 1);
    expect(hasActivePanic(await getState())).toBe(false);
    vi.useRealTimers();
  });

  it("revokes an outstanding settings pass on activation", async () => {
    await completeSetup("browsing-pw");
    await grantSettingsPass("browsing-pw");

    await activatePanicMode();

    const state = await getState();
    expect(state.settingsPassUntil).toBeNull();
    expect(state.panicUntil).not.toBeNull();
  });

  it("honors a custom duration from the options page", async () => {
    await completeSetup("browsing-pw");
    await setState({ panicModeMinutes: 30 });

    await activatePanicMode();

    const state = await getState();
    expect(state.panicUntil).not.toBeNull();
    // 30 minutes of wall-clock from activation, not the 10-minute default.
    const now = Date.now();
    expect(state.panicUntil).toBeGreaterThan(now + 29 * 60_000);
    expect(state.panicUntil).toBeLessThan(now + 31 * 60_000);
  });
});

describe("panic mode blocks the settings password", () => {
  it("rejects a CORRECT password while panic is active", async () => {
    await completeSetup("browsing-pw");
    await activatePanicMode();

    expect(await grantSettingsPass("browsing-pw")).toBe(false);
    expect(await grantSettingsPass("browsing-pw")).toBe(false);
  });

  it("accepts the password again once the window has passed", async () => {
    await completeSetup("browsing-pw");
    await activatePanicMode();
    const state = await getState();

    vi.useFakeTimers();
    vi.setSystemTime((state.panicUntil ?? 0) + 1);
    expect(await grantSettingsPass("browsing-pw")).toBe(true);
    vi.useRealTimers();
  });
});

describe("panic mode closes private windows", () => {
  it("closes an incognito window while panic is active", async () => {
    await completeSetup("browsing-pw");
    await activatePanicMode();

    await maybeCloseIncognitoWindow({ id: 10, incognito: true });

    expect(fake._removedWindows).toEqual([10]);
  });

  it("closes private windows already open at activation time", async () => {
    await completeSetup("browsing-pw");
    fake._windows.push({ id: 7, incognito: true }, { id: 8, incognito: false });

    await activatePanicMode();

    expect(fake._removedWindows).toEqual([7]);
  });

  it("leaves normal windows alone", async () => {
    await completeSetup("browsing-pw");
    await activatePanicMode();

    await maybeCloseIncognitoWindow({ id: 11, incognito: false });
    await maybeCloseIncognitoWindow({ id: 12 });

    expect(fake._removedWindows).toEqual([]);
  });

  it("does nothing once the panic window has passed", async () => {
    await completeSetup("browsing-pw");
    await activatePanicMode();
    // Backdate the deadline rather than faking the clock — fake timers
    // deadlock the harness's real-timer flush (see feedback.md).
    await setState({ panicUntil: Date.now() - 1, blockPrivateBrowsing: false });

    await maybeCloseIncognitoWindow({ id: 13, incognito: true });

    expect(fake._removedWindows).toEqual([]);
  });
});

describe("forgot-settings-password recovery, end to end", () => {
  /**
   * Regression test for 2.1.3. The reset cleared the settings password and
   * showed a new recovery code, but granted no pass — so "Continue to
   * preferences" dropped the user back on the password prompt the recovery
   * had just freed them from, with no way forward from that screen.
   */
  it("opens preferences after the reset, without rotating the code again", async () => {
    const code = await completeSetup("browsing-pw");
    // Claim a settings password, so the browsing-password fallback is gone
    // and recovery is genuinely the only way back in.
    expect(await setSettingsPassword("browsing-pw", "settings-pw")).toEqual({
      ok: true,
    });

    const newCode = await resetSettingsPasswordWithRecoveryCode(code);
    expect(newCode).not.toBeNull();

    // The reset itself must NOT grant a pass: a valid pass swaps the options
    // page to the settings and unmounts the one-time code display.
    expect((await getState()).settingsPassUntil).toBeNull();
    expect((await getState()).settingsPasswordHash).toBeNull();

    const rotated = (await getState()).recoveryHash;

    // What "Continue to preferences" now does.
    expect(await claimSettingsPassWithRecoveryCode(newCode!)).toBe(true);
    expect(await hasValidSettingsPass()).toBe(true);
    // Claiming verifies but does not rotate — the code just shown stays valid.
    expect((await getState()).recoveryHash).toEqual(rotated);
  });

  it("refuses a wrong code", async () => {
    await completeSetup("browsing-pw");
    expect(await claimSettingsPassWithRecoveryCode("WRONG-CODE")).toBe(false);
    expect(await hasValidSettingsPass()).toBe(false);
  });

  it("refuses while panic mode is active, code or not", async () => {
    const code = await completeSetup("browsing-pw");
    const newCode = await resetSettingsPasswordWithRecoveryCode(code);
    await activatePanicMode();

    expect(await claimSettingsPassWithRecoveryCode(newCode!)).toBe(false);
    expect(await hasValidSettingsPass()).toBe(false);
  });
});

describe("dynamic private-window blocking", () => {
  it("closes a private window while blockPrivateBrowsing is on", async () => {
    await completeSetup("browsing-pw");
    await setState({ blockPrivateBrowsing: true });

    await maybeCloseIncognitoWindow({ id: 20, incognito: true });

    expect(fake._removedWindows).toEqual([20]);
  });

  it("leaves it open while a settings pass is valid", async () => {
    await completeSetup("browsing-pw");
    await setState({ blockPrivateBrowsing: true });
    // No settings password set yet, so the browsing password is the fallback.
    expect(await grantSettingsPass("browsing-pw")).toBe(true);

    await maybeCloseIncognitoWindow({ id: 21, incognito: true });

    expect(fake._removedWindows).toEqual([]);
  });

  it("closes it again once the settings pass has expired", async () => {
    await completeSetup("browsing-pw");
    await setState({ blockPrivateBrowsing: true });
    await grantSettingsPass("browsing-pw");
    await setState({ settingsPassUntil: Date.now() - 1 });

    await maybeCloseIncognitoWindow({ id: 22, incognito: true });

    expect(fake._removedWindows).toEqual([22]);
  });

  it("leaves private windows alone when blockPrivateBrowsing is off", async () => {
    await completeSetup("browsing-pw");
    await setState({ blockPrivateBrowsing: false });

    await maybeCloseIncognitoWindow({ id: 23, incognito: true });

    expect(fake._removedWindows).toEqual([]);
  });

  it("closes during panic even with a settings pass and blocking off", async () => {
    await completeSetup("browsing-pw");
    await setState({ blockPrivateBrowsing: false });
    await grantSettingsPass("browsing-pw");
    await activatePanicMode();

    await maybeCloseIncognitoWindow({ id: 24, incognito: true });

    expect(fake._removedWindows).toEqual([24]);
  });
});
