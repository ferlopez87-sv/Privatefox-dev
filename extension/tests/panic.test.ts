import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activatePanicMode,
  completeSetup,
  grantSettingsPass,
  hasActivePanic,
  maybeCloseIncognitoWindow,
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
    const state = await getState();

    vi.useFakeTimers();
    vi.setSystemTime((state.panicUntil ?? 0) + 1);
    await maybeCloseIncognitoWindow({ id: 13, incognito: true });
    vi.useRealTimers();

    expect(fake._removedWindows).toEqual([]);
  });
});
