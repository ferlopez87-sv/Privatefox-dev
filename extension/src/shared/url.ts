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
 * Navigates the current tab to a configured redirect, if there is one worth
 * following. Returns true when navigation was started, so callers can skip
 * whatever they would otherwise do (hide the overlay, re-render).
 *
 * `replace` controls history: the lock screen replaces itself (nobody wants
 * Back to return to a lock screen), while the overlay assigns, so Back still
 * returns to the page the user was actually on when the browser locked.
 *
 * Re-validates the stored value at navigation time rather than trusting that
 * it was checked on save — the check is one string comparison, and it means
 * a value written before this validation existed can't slip through.
 */
export function followRedirect(url: string, replace: boolean): boolean {
  const trimmed = url.trim();
  if (!trimmed || !isSafeRedirectUrl(trimmed)) return false;
  if (replace) location.replace(trimmed);
  else location.assign(trimmed);
  return true;
}
