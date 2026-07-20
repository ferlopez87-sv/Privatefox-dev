/**
 * Background event page entry. Firefox MV3 runs this as a NON-PERSISTENT
 * event page (background.scripts + type module — not a service worker).
 * Every listener must be registered synchronously at top level so Firefox
 * can re-wake the page for events after suspension; state is re-derived
 * from storage on every wake, never held only in memory.
 */
import { registerRouter } from "./router";
import { registerIdleListener, applyIdleTimeout } from "./idle-monitor";
import { registerNavGuard } from "./nav-guard";
import { lock } from "./lock-state";
import { getState } from "../shared/storage";

registerRouter();
registerIdleListener();
registerNavGuard();

// Lock on every browser startup.
browser.runtime.onStartup.addListener(() => {
  void lock();
});

// The toolbar button opens a status popup (action.default_popup); with a
// popup set, action.onClicked never fires, so manual locking is driven from
// the popup's "Lock now" button via the "lock-now" runtime message instead.

// First install: open the setup wizard so a password gets created.
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "install") return;
  void getState().then((state) => {
    if (state.setupComplete) return;
    void browser.tabs.create({
      url: browser.runtime.getURL("src/setup/index.html"),
    });
  });
});

// The options page writes idleTimeoutMinutes straight to storage; pick the
// change up here since setDetectionInterval only works from the background.
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  void applyIdleTimeout();
});

// Re-apply the idle detection interval on every background wake (the
// interval is process state, not persisted by Firefox).
void applyIdleTimeout();
