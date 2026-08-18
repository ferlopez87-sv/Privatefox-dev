import { afterEach, describe, expect, it, vi } from "vitest";
import { followRedirect, isSafeRedirectUrl } from "../src/shared/url";

/**
 * location is not writable in jsdom-less runs, so stub the two methods the
 * module actually calls and assert on those.
 */
function stubLocation() {
  const assign = vi.fn();
  const replace = vi.fn();
  vi.stubGlobal("location", { assign, replace });
  return { assign, replace };
}

afterEach(() => vi.unstubAllGlobals());

describe("isSafeRedirectUrl", () => {
  it("accepts ordinary destinations", () => {
    expect(isSafeRedirectUrl("https://example.com")).toBe(true);
    expect(isSafeRedirectUrl("about:addons")).toBe(true);
    expect(isSafeRedirectUrl("file:///Users/me/start.html")).toBe(true);
  });

  it("rejects script-bearing schemes regardless of case or padding", () => {
    expect(isSafeRedirectUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirectUrl("  JavaScript:alert(1)")).toBe(false);
    expect(isSafeRedirectUrl("DATA:text/html,<script>")).toBe(false);
  });
});

describe("followRedirect", () => {
  it("does nothing for an empty or whitespace-only setting", () => {
    const loc = stubLocation();
    expect(followRedirect("", true)).toBe(false);
    expect(followRedirect("   ", false)).toBe(false);
    expect(loc.assign).not.toHaveBeenCalled();
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("re-validates at navigation time, not just on save", () => {
    const loc = stubLocation();
    // A value written before the scheme check existed must still not run.
    expect(followRedirect("javascript:alert(1)", true)).toBe(false);
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("replaces history for the lock screen", () => {
    const loc = stubLocation();
    expect(followRedirect("  https://example.com  ", true)).toBe(true);
    // Trimmed, and replace() so Back never returns to a lock screen.
    expect(loc.replace).toHaveBeenCalledWith("https://example.com");
    expect(loc.assign).not.toHaveBeenCalled();
  });

  it("assigns for the overlay, so Back returns to the locked page", () => {
    const loc = stubLocation();
    expect(followRedirect("https://example.com", false)).toBe(true);
    expect(loc.assign).toHaveBeenCalledWith("https://example.com");
    expect(loc.replace).not.toHaveBeenCalled();
  });
});
