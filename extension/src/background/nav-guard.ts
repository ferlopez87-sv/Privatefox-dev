import { getState } from "../shared/storage";

/**
 * Defense-in-depth only: the authoritative blocks are the enterprise
 * policies (BlockAboutAddons, DisablePrivateBrowsing). Content scripts
 * cannot run on about: pages, and webNavigation does not fire for them,
 * so this watches tab URL updates and steers away from escape hatches.
 */
const BLOCKED_PREFIXES = [
  "about:addons",
  "about:debugging",
  "about:profiles",
];

export function registerNavGuard(): void {
  browser.tabs.onUpdated.addListener(
    (tabId, changeInfo) => {
      const url = changeInfo.url;
      if (!url) return;
      if (!BLOCKED_PREFIXES.some((p) => url.startsWith(p))) return;
      void getState().then((state) => {
        if (!state.setupComplete) return;
        // Redirect to the (extension-owned) new tab page, which shows the
        // lock screen when locked and the welcome message when not.
        void browser.tabs.update(tabId, { url: "about:newtab" });
      });
    },
    // Firefox supports filtering; keep unfiltered for compatibility since
    // "url" filter on onUpdated requires FF 61+ shape — cheap check anyway.
  );
}
