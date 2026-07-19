import { LockOverlay } from "./overlay-ui";
import { DEFAULT_STATE, STATE_KEY, type PrivatefoxState } from "../shared/storage";

/**
 * Runs at document_start in every top frame. Reads lock state directly
 * from storage (no round-trip to the background page) and reacts to
 * changes via storage.onChanged — every navigation therefore re-asserts
 * the overlay automatically, with no webNavigation bookkeeping.
 */

const overlay = new LockOverlay();

function apply(state: PrivatefoxState): void {
  if (state.setupComplete && state.locked) {
    overlay.show(state.welcomeMessage);
  } else {
    overlay.hide();
  }
}

void browser.storage.local
  .get(STATE_KEY)
  .then((result) => {
    const stored = result[STATE_KEY] as Partial<PrivatefoxState> | undefined;
    apply({ ...DEFAULT_STATE, ...stored });
  });

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const change = changes[STATE_KEY];
  if (!change) return;
  const stored = change.newValue as Partial<PrivatefoxState> | undefined;
  apply({ ...DEFAULT_STATE, ...stored });
});
