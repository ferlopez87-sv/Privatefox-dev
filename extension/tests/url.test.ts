import { afterEach, describe, expect, it, vi } from "vitest";
import { followRedirect, isSafeRedirectUrl, navigateTab } from "../src/shared/url";

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

/** Stands in for an extension page, which does have browser.tabs. */
function stubTabs() {
  const update = vi.fn(() => Promise.resolve());
  vi.stubGlobal("browser", { tabs: { update } });
  return update;
}

/** Stands in for a content script, which does not. */
function stubNoTabs() {
  vi.stubGlobal("browser", { storage: {} });
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

describe("navigateTab", () => {
  /**
   * Regression test for 2.1.2. The settings gate forwarded to about:addons
   * with location.replace(), which Firefox refuses for an extension page
   * navigating to a privileged about: URL. Nothing happened, and a correct
   * password looked like it had been rejected.
   */
  it("uses the tabs API when one is available (about: needs it)", () => {
    const loc = stubLocation();
    const update = stubTabs();

    navigateTab("about:addons");

    expect(update).toHaveBeenCalledWith({ url: "about:addons" });
    expect(loc.replace).not.toHaveBeenCalled();
    expect(loc.assign).not.toHaveBeenCalled();
  });

  it("uses the tabs API for ordinary URLs too", () => {
    const update = stubTabs();
    navigateTab("https://example.com", true);
    expect(update).toHaveBeenCalledWith({ url: "https://example.com" });
  });

  it("falls back to location where there is no tabs API (content script)", () => {
    const loc = stubLocation();
    stubNoTabs();

    navigateTab("https://example.com", true);
    expect(loc.replace).toHaveBeenCalledWith("https://example.com");

    navigateTab("https://example.org", false);
    expect(loc.assign).toHaveBeenCalledWith("https://example.org");
  });
});

describe("followRedirect", () => {
  it("does nothing for an empty or whitespace-only setting", () => {
    const loc = stubLocation();
    stubNoTabs();
    expect(followRedirect("", true)).toBe(false);
    expect(followRedirect("   ", false)).toBe(false);
    expect(loc.assign).not.toHaveBeenCalled();
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it("re-validates at navigation time, not just on save", () => {
    const loc = stubLocation();
    const update = stubTabs();
    // A value written before the scheme check existed must still not run.
    expect(followRedirect("javascript:alert(1)", true)).toBe(false);
    expect(loc.replace).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("forwards through the tabs API on an extension page", () => {
    const update = stubTabs();
    expect(followRedirect("  https://example.com  ", true)).toBe(true);
    // Trimmed before navigating.
    expect(update).toHaveBeenCalledWith({ url: "https://example.com" });
  });

  it("replaces history for the lock screen when falling back to location", () => {
    const loc = stubLocation();
    stubNoTabs();
    expect(followRedirect("  https://example.com  ", true)).toBe(true);
    expect(loc.replace).toHaveBeenCalledWith("https://example.com");
    expect(loc.assign).not.toHaveBeenCalled();
  });

  it("assigns for the overlay, so Back returns to the locked page", () => {
    const loc = stubLocation();
    stubNoTabs();
    expect(followRedirect("https://example.com", false)).toBe(true);
    expect(loc.assign).toHaveBeenCalledWith("https://example.com");
    expect(loc.replace).not.toHaveBeenCalled();
  });
});
