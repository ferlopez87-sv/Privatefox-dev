import { getState } from "../shared/storage";
import { GATED_PAGES } from "../shared/constants";
import { hasValidAddonsPass } from "./lock-state";

/**
 * Password gate for about:addons (and sibling escape hatches).
 *
 * Content scripts cannot run on about: pages and webNavigation does not fire
 * for them, so the only lever from inside the extension is watching tab URL
 * updates and steering away. Navigation is therefore redirected to an
 * extension-owned gate page that asks for the password; entering it grants a
 * short-lived pass (see grantAddonsPass) and the tab is sent to the target.
 *
 * This remains defense-in-depth: with the BlockAboutAddons enterprise policy
 * active the page is unreachable before this listener ever runs. The gate is
 * what protects about:addons when that policy is intentionally off.
 */
export function gateUrlFor(target: string): string {
  return `${browser.runtime.getURL("src/gate/index.html")}?target=${encodeURIComponent(target)}`;
}

export function isGatedUrl(url: string): boolean {
  return GATED_PAGES.some((p) => url.startsWith(p));
}

export function registerNavGuard(): void {
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const url = changeInfo.url;
    if (!url || !isGatedUrl(url)) return;
    void (async () => {
      const state = await getState();
      if (!state.setupComplete) return;
      // While locked, the lock screen is the only thing that should be
      // reachable — no password prompt for a sub-page on top of it.
      if (state.locked) {
        void browser.tabs.update(tabId, { url: "about:newtab" });
        return;
      }
      if (await hasValidAddonsPass()) return;
      void browser.tabs.update(tabId, { url: gateUrlFor(url) });
    })();
  });
}
