import { describe, expect, it } from "vitest";
import { hashSecret, verifySecret } from "../src/shared/crypto";

describe("crypto", () => {
  it("verifies the same secret it hashed", async () => {
    const stored = await hashSecret("correct horse battery staple");
    expect(await verifySecret("correct horse battery staple", stored)).toBe(
      true,
    );
  });

  it("rejects a wrong secret", async () => {
    const stored = await hashSecret("right");
    expect(await verifySecret("wrong", stored)).toBe(false);
    expect(await verifySecret("", stored)).toBe(false);
    expect(await verifySecret("right ", stored)).toBe(false);
  });

  it("salts every hash independently", async () => {
    const a = await hashSecret("same");
    const b = await hashSecret("same");
    expect(a.saltB64).not.toBe(b.saltB64);
    expect(a.hashB64).not.toBe(b.hashB64);
    // ...but both still verify.
    expect(await verifySecret("same", a)).toBe(true);
    expect(await verifySecret("same", b)).toBe(true);
  });

  it("records the iteration count used", async () => {
    const stored = await hashSecret("x");
    expect(stored.iterations).toBeGreaterThanOrEqual(100_000);
  });
});
