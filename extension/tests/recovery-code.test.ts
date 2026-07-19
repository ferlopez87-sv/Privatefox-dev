import { describe, expect, it } from "vitest";
import {
  generateEmailCode,
  generateRecoveryCode,
  normalizeRecoveryCode,
} from "../src/shared/recovery-code";

describe("recovery codes", () => {
  it("generates 5 groups of 5 unambiguous characters", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[2-9A-HJKMNP-TW-Z]{5}(-[2-9A-HJKMNP-TW-Z]{5}){4}$/);
    // No ambiguous characters ever.
    expect(code).not.toMatch(/[01OILU]/);
  });

  it("generates distinct codes", () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => generateRecoveryCode()),
    );
    expect(seen.size).toBe(50);
  });

  it("normalizes case, whitespace and hyphens", () => {
    const code = generateRecoveryCode();
    const sloppy = code.toLowerCase().replaceAll("-", " ") + " ";
    expect(normalizeRecoveryCode(sloppy)).toBe(code);
    expect(normalizeRecoveryCode(code)).toBe(code);
  });

  it("email codes are 8 digits", () => {
    expect(generateEmailCode()).toMatch(/^\d{8}$/);
  });
});
