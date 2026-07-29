import { LOCK_PAGE_PATH } from "../shared/constants";

/**
 * Makes the lock actually visible.
 *
 * Flipping `locked` in storage is enough for ordinary web pages: their
 * content script is listening on storage.onChanged and draws the overlay.
 * It is NOT enough anywhere the content script cannot run — extension pages
 * (the preferences tab), about: pages, and the window Firefox opens at
 * startup (about:home is not the newtab override). On those surfaces the
 * lock would be silently in effect with nothing on screen, which reads as
 * "the lock button does nothing".
 *
 * So after every lock, any focused tab that cannot host the overlay is
 * navigated to the extension's own lock page.
 */

/** Pages where the content script runs, i.e. the overlay covers them. */
function canHostOverlay(url: string): boolean {
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("file://")
  );
}

export async function surfaceLockScreen(): Promise<void> {
  const lockPage = browser.runtime.getURL(LOCK_PAGE_PATH);
  try {
    // One active tab per window — locking should not rewrite background tabs
    // the user never sees.
    const tabs = await browser.tabs.query({ active: true });
    await Promise.all(
      tabs.map(async (tab) => {
        const url = tab.url ?? "";
        if (tab.id === undefined) return;
        if (canHostOverlay(url)) return; // the overlay has this one
        if (url.startsWith(lockPage)) return; // already showing it
        try {
          await browser.tabs.update(tab.id, { url: lockPage });
        } catch {
          // A tab can disappear mid-flight, or be one Firefox refuses to
          // navigate; the remaining tabs still get the lock screen.
        }
      }),
    );
  } catch {
    // tabs.query can reject while the browser is still starting up; the
    // lock state itself is already persisted, so this is not fatal.
  }
}
