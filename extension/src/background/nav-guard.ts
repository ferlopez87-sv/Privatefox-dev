import { getState } from "../shared/storage";
import { GATED_PAGES, LOCK_PAGE_PATH } from "../shared/constants";
import { hasActivePanic, hasValidSettingsPass } from "./lock-state";

/**
 * Password gate for about:addons (and sibling escape hatches).
 *
 * Content scripts cannot run on about: pages and webNavigation does not fire
 * for them, so the only lever from inside the extension is watching tab URL
 * updates and steering away. Navigation is redirected to an extension-owned
 * gate page that asks for the settings password; entering it grants a
 * short-lived pass (see grantSettingsPass) and the tab is sent to the target.
 *
 * Panic mode overrides the gate: while active, the redirect goes to the
 * panic page instead — a screen with no password field at all, so no
 * password can open the surface. (The locked check runs first: a locked
 * browser shows the lock screen, which already blocks everything; sending a
 * locked user to the panic page would be a lock bypass, since that page
 * links straight back to ordinary browsing.)
 *
 * Two things this must get right, both of which have already broken it once:
 *
 * 1. The `tabs` permission is required. Without it tabs.onUpdated omits
 *    changeInfo.url for about: URLs — <all_urls> does not cover them.
 * 2. A tab opened straight onto about:addons (the Add-ons menu item and
 *    Cmd+Shift+A both do this) never reports a URL *change*: the URL is
 *    there from creation. So reading only changeInfo.url misses the most
 *    common way the page is reached. Both the tab object and onCreated are
 *    consulted as well.
 *
 * This remains defense-in-depth: with the BlockAboutAddons enterprise policy
 * active the page is unreachable before this listener ever runs. The gate is
 * what protects about:addons when that policy is intentionally off.
 */

export function gateUrlFor(target: string): string {
  return `${browser.runtime.getURL("src/gate/index.html")}?target=${encodeURIComponent(target)}`;
}

export function panicUrlFor(): string {
  return browser.runtime.getURL("src/panic/index.html");
}

export function isGatedUrl(url: string): boolean {
  return GATED_PAGES.some((p) => url.startsWith(p));
}

/** Decide what to do about one tab currently pointing at `url`. */
async function guardTab(
  tabId: number | undefined,
  url: string | undefined,
): Promise<void> {
  if (tabId === undefined || !url || !isGatedUrl(url)) return;

  const state = await getState();
  if (!state.setupComplete) return;

  try {
    // While locked, the lock screen is the only thing that should be
    // reachable — no settings prompt layered on top of it.
    if (state.locked) {
      await browser.tabs.update(tabId, {
        url: browser.runtime.getURL(LOCK_PAGE_PATH),
      });
      return;
    }
    // Panic mode: no password is accepted for the protected surfaces, so
    // the gate page (which takes a password) is replaced by the panic page
    // (which takes none and cannot be dismissed early).
    if (hasActivePanic(state)) {
      await browser.tabs.update(tabId, { url: panicUrlFor() });
      return;
    }
    if (await hasValidSettingsPass()) return;
    await browser.tabs.update(tabId, { url: gateUrlFor(url) });
  } catch {
    // The tab can vanish mid-flight; nothing to recover here.
  }
}

export function registerNavGuard(): void {
  // changeInfo.url covers navigation within an existing tab. tab.url covers
  // the case where the tab was opened directly onto the page, where no URL
  // *change* is ever reported.
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    void guardTab(tabId, changeInfo.url ?? tab?.url);
  });

  // A brand-new tab pointing straight at about:addons.
  browser.tabs.onCreated.addListener((tab) => {
    void guardTab(tab.id, tab.url);
  });
}
