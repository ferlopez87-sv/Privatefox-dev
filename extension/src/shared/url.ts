/**
 * Redirect-URL handling shared by the two configurable redirects
 * (postUnlockRedirectUrl after a browsing unlock, postGateRedirectUrl after
 * the settings gate). Both values are the user's own input from the options
 * page, not untrusted third-party input — the point here is to stop a
 * pasted `javascript:`/`data:` URL from turning a redirect into script
 * execution, not to defend against an attacker who already controls storage.
 */

/** Rejects only schemes that could do something surprising once landed on. */
export function isSafeRedirectUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return !trimmed.startsWith("javascript:") && !trimmed.startsWith("data:");
}

/**
 * Navigates the current tab to `url`.
 *
 * Prefers the tabs API, because `location.*` **cannot reach privileged
 * `about:` pages from an extension page** — Firefox blocks the navigation
 * and the page simply stays put. That is what broke the settings gate: a
 * correct password forwarded to `about:addons` via location.replace, nothing
 * happened, and the gate appeared to keep asking for the password. The tabs
 * API has no such restriction.
 *
 * Content scripts are not given `browser.tabs`, so they fall back to
 * `location` — which is fine there, since a content script only ever runs on
 * pages that `location` can navigate to anyway.
 *
 * `replace` only affects the fallback: it controls whether Back returns to
 * the page being left (the lock screen replaces itself; the overlay does
 * not, so Back still reaches the page the browser locked on top of).
 */
export function navigateTab(url: string, replace = false): void {
  const tabs = (globalThis as { browser?: { tabs?: { update?: unknown } } })
    .browser?.tabs;
  if (tabs && typeof tabs.update === "function") {
    void (tabs.update as (p: { url: string }) => Promise<unknown>)({ url });
    return;
  }
  if (replace) location.replace(url);
  else location.assign(url);
}

/**
 * Navigates to a configured redirect, if there is one worth following.
 * Returns true when navigation was started, so callers can skip whatever
 * they would otherwise do (hide the overlay, re-render).
 *
 * Re-validates the stored value at navigation time rather than trusting that
 * it was checked on save — the check is one string comparison, and it means
 * a value written before this validation existed can't slip through.
 */
export function followRedirect(url: string, replace: boolean): boolean {
  const trimmed = url.trim();
  if (!trimmed || !isSafeRedirectUrl(trimmed)) return false;
  navigateTab(trimmed, replace);
  return true;
}
