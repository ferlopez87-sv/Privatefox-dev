import { describe, expect, it } from "vitest";
import { makeFakeBrowser, type FakeTab } from "./setup";
import { completeSetup, lock } from "../src/background/lock-state";

const LOCK_PAGE = "moz-extension://test/src/newtab/index.html";

/** Installs a fake browser whose tabs are the ones given. */
function withTabs(tabs: FakeTab[]) {
  const fake = makeFakeBrowser(tabs);
  (globalThis as Record<string, unknown>).browser = fake;
  return fake;
}

describe("surfacing the lock screen on lock", () => {
  it("navigates a focused tab the content script cannot reach", async () => {
    // The preferences page: an extension page, so no content-script overlay.
    const fake = withTabs([
      { id: 1, url: "moz-extension://test/src/options/index.html", active: true },
    ]);
    await completeSetup("hunter22");

    await lock();

    // Without this the lock silently applied with nothing on screen, which
    // is what made the options "Lock now" button look broken.
    expect(fake._navigations).toEqual([{ tabId: 1, url: LOCK_PAGE }]);
  });

  it("navigates the startup page (about:home is not the newtab override)", async () => {
    const fake = withTabs([{ id: 7, url: "about:home", active: true }]);
    await completeSetup("hunter22");

    await lock();

    expect(fake._navigations).toEqual([{ tabId: 7, url: LOCK_PAGE }]);
  });

  it("leaves ordinary web pages to the content-script overlay", async () => {
    const fake = withTabs([
      { id: 1, url: "https://example.com", active: true },
      { id: 2, url: "http://example.org", active: true },
      { id: 3, url: "file:///Users/me/notes.html", active: true },
    ]);
    await completeSetup("hunter22");

    await lock();

    expect(fake._navigations).toEqual([]);
  });

  it("ignores background tabs, only the focused one per window", async () => {
    const fake = withTabs([
      { id: 1, url: "about:home", active: true },
      { id: 2, url: "about:config", active: false },
    ]);
    await completeSetup("hunter22");

    await lock();

    expect(fake._navigations).toEqual([{ tabId: 1, url: LOCK_PAGE }]);
  });

  it("does not re-navigate a tab already showing the lock screen", async () => {
    const fake = withTabs([{ id: 1, url: LOCK_PAGE, active: true }]);
    await completeSetup("hunter22");

    await lock();
    await lock();

    expect(fake._navigations).toEqual([]);
  });

  it("re-asserts the lock screen when locking while already locked", async () => {
    const fake = withTabs([{ id: 1, url: "about:home", active: true }]);
    await completeSetup("hunter22");

    await lock();
    // User navigated away from the lock screen somehow; locking again must
    // put it back rather than short-circuiting on "already locked".
    fake._tabs[0]!.url = "about:home";
    await lock();

    expect(fake._navigations).toHaveLength(2);
  });

  it("does not surface anything before setup completes", async () => {
    const fake = withTabs([{ id: 1, url: "about:home", active: true }]);

    await lock();

    expect(fake._navigations).toEqual([]);
  });
});
