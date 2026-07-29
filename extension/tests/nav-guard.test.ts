import { describe, expect, it } from "vitest";
import { getManifest } from "../src/manifest";
import { isGatedUrl } from "../src/background/nav-guard";
import { GATED_PAGES } from "../src/shared/constants";

describe("nav-guard manifest requirements", () => {
  /**
   * Regression test for 1.3.0, where about:addons was not gated at all.
   *
   * tabs.onUpdated only reports changeInfo.url when the extension holds the
   * "tabs" permission or a host permission matching that URL — and
   * <all_urls> does not match about: URLs. Without "tabs" the guard receives
   * url === undefined for about:addons, returns early, and the gate is dead.
   */
  it("requests the tabs permission (about: URLs are invisible without it)", () => {
    const permissions = getManifest().permissions ?? [];
    expect(permissions).toContain("tabs");
  });

  it("still requests <all_urls> for web-page tab URLs and content scripts", () => {
    expect(getManifest().host_permissions).toContain("<all_urls>");
  });
});

describe("isGatedUrl", () => {
  it("matches every gated page, including query/fragment forms", () => {
    for (const page of GATED_PAGES) {
      expect(isGatedUrl(page)).toBe(true);
    }
    // about:preferences carries fragments for its panes.
    expect(isGatedUrl("about:preferences#privacy")).toBe(true);
    expect(isGatedUrl("about:addons")).toBe(true);
  });

  it("leaves ordinary pages alone", () => {
    expect(isGatedUrl("https://example.com")).toBe(false);
    expect(isGatedUrl("about:blank")).toBe(false);
    expect(isGatedUrl("about:newtab")).toBe(false);
  });
});
