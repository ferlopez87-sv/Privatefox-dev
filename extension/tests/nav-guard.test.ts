import { describe, expect, it, vi } from "vitest";
import { getManifest } from "../src/manifest";
import { isGatedUrl, registerNavGuard } from "../src/background/nav-guard";
import { GATED_PAGES } from "../src/shared/constants";
import {
  activatePanicMode,
  completeSetup,
  grantSettingsPass,
} from "../src/background/lock-state";
import { makeFakeBrowser } from "./setup";

const GATE = "moz-extension://test/src/gate/index.html";
const PANIC = "moz-extension://test/src/panic/index.html";

function install() {
  const fake = makeFakeBrowser([]);
  (globalThis as Record<string, unknown>).browser = fake;
  registerNavGuard();
  return fake;
}

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

describe("gating about:addons", () => {
  it("redirects a tab that navigates to about:addons", async () => {
    const fake = install();
    await completeSetup("browsing-pw");

    await fake._fireUpdated(1, "about:addons");

    expect(fake._navigations[0]?.url).toContain(GATE);
    expect(fake._navigations[0]?.url).toContain("about%3Aaddons");
  });

  /**
   * Regression test for 1.4.0. The Add-ons menu item and Cmd+Shift+A both
   * open a NEW tab already pointing at about:addons, so no URL *change* is
   * ever reported. Reading only changeInfo.url missed the most common route
   * to the page and the gate never fired.
   */
  it("redirects a tab OPENED directly onto about:addons (no url change)", async () => {
    const fake = install();
    await completeSetup("browsing-pw");

    // changeInfo carries no url; only the tab object knows where it points.
    await fake._fireUpdated(2, undefined, "about:addons");

    expect(fake._navigations[0]?.url).toContain(GATE);
  });

  it("redirects a newly created about:addons tab (tabs.onCreated)", async () => {
    const fake = install();
    await completeSetup("browsing-pw");

    await fake._fireCreated({ id: 3, url: "about:addons" });

    expect(fake._navigations[0]?.url).toContain(GATE);
  });

  it("gates about:preferences too", async () => {
    const fake = install();
    await completeSetup("browsing-pw");

    await fake._fireUpdated(4, "about:preferences#privacy");

    expect(fake._navigations[0]?.url).toContain(GATE);
  });

  it("lets it through while a settings pass is valid", async () => {
    const fake = install();
    await completeSetup("browsing-pw");
    await grantSettingsPass("browsing-pw");

    await fake._fireUpdated(5, "about:addons");

    expect(fake._navigations).toEqual([]);
  });

  it("sends a locked browser to the lock screen, not the settings prompt", async () => {
    const fake = install();
    await completeSetup("browsing-pw");
    const { lock } = await import("../src/background/lock-state");
    await lock();
    fake._navigations.length = 0;

    await fake._fireUpdated(6, "about:addons");

    expect(fake._navigations[0]?.url).toContain("src/newtab/index.html");
  });

  it("ignores ordinary navigation entirely", async () => {
    const fake = install();
    await completeSetup("browsing-pw");

    await fake._fireUpdated(7, "https://example.com");

    expect(fake._navigations).toEqual([]);
  });

  it("does nothing before setup completes", async () => {
    const fake = install();

    await fake._fireUpdated(8, "about:addons");

    expect(fake._navigations).toEqual([]);
  });
});

describe("panic mode gating", () => {
  it("redirects to the PANIC page, not the gate, while panic is active", async () => {
    const fake = install();
    await completeSetup("browsing-pw");
    await activatePanicMode();

    await fake._fireUpdated(9, "about:addons");

    expect(fake._navigations[0]?.url).toContain(PANIC);
    expect(fake._navigations[0]?.url).not.toContain(GATE);
  });

  it("redirects newly created gated tabs to the panic page too", async () => {
    const fake = install();
    await completeSetup("browsing-pw");
    await activatePanicMode();

    await fake._fireCreated({ id: 10, url: "about:addons" });

    expect(fake._navigations[0]?.url).toContain(PANIC);
  });

  it("goes back to the password gate once panic has expired", async () => {
    const fake = install();
    await completeSetup("browsing-pw");
    await activatePanicMode();
    // Backdate the deadline directly — fake timers would deadlock the
    // harness's setTimeout-based flush.
    const { setState } = await import("../src/shared/storage");
    await setState({ panicUntil: Date.now() - 1 });

    await fake._fireUpdated(11, "about:addons");

    expect(fake._navigations[0]?.url).toContain(GATE);
    expect(fake._navigations[0]?.url).not.toContain(PANIC);
  });

  it("panic overrides a valid settings pass", async () => {
    const fake = install();
    await completeSetup("browsing-pw");
    await grantSettingsPass("browsing-pw");
    await activatePanicMode();

    await fake._fireUpdated(12, "about:addons");

    expect(fake._navigations[0]?.url).toContain(PANIC);
  });
});
