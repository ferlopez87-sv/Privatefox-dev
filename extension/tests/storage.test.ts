import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, getState, setState } from "../src/shared/storage";

describe("storage", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await getState()).toEqual(DEFAULT_STATE);
  });

  it("round-trips a patch and preserves other fields", async () => {
    await setState({ welcomeMessage: "hola", locked: true });
    const state = await getState();
    expect(state.welcomeMessage).toBe("hola");
    expect(state.locked).toBe(true);
    expect(state.idleTimeoutMinutes).toBe(DEFAULT_STATE.idleTimeoutMinutes);
  });

  it("fills in defaults for fields missing from older stored shapes", async () => {
    // Simulate a stored blob from a version that predates recoveryEmail.
    await setState({});
    const partial = { schemaVersion: 1, locked: true } as never;
    await (browser.storage.local as unknown as {
      set(i: Record<string, unknown>): Promise<void>;
    }).set({ privatefoxState: partial });
    const state = await getState();
    expect(state.locked).toBe(true);
    expect(state.recoveryEmail).toBe("");
    expect(state.emailCode).toBeNull();
  });
});
