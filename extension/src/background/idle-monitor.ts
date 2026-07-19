import { getState } from "../shared/storage";
import { MIN_IDLE_DETECTION_SECONDS } from "../shared/constants";
import { lock } from "./lock-state";

/**
 * Re-applies the configured idle threshold. Called on background wake and
 * whenever the options page changes idleTimeoutMinutes.
 */
export async function applyIdleTimeout(): Promise<void> {
  const state = await getState();
  const seconds = Math.max(
    MIN_IDLE_DETECTION_SECONDS,
    Math.round(state.idleTimeoutMinutes * 60),
  );
  browser.idle.setDetectionInterval(seconds);
}

/**
 * Listener must be attached at top-level module scope so it survives
 * event-page suspension (Firefox re-wakes the page for registered events).
 */
export function registerIdleListener(): void {
  browser.idle.onStateChanged.addListener((idleState) => {
    // Firefox only ever reports "active" | "idle" (no "locked" state).
    if (idleState === "idle") {
      void lock();
    }
  });
}
