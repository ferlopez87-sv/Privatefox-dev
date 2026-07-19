import { useEffect, useState } from "preact/hooks";
import {
  DEFAULT_STATE,
  STATE_KEY,
  type PrivatefoxState,
} from "../shared/storage";
import type { RuntimeRequest, RuntimeResponse } from "../shared/protocol";

export function sendToBackground(
  request: RuntimeRequest,
): Promise<RuntimeResponse> {
  return browser.runtime.sendMessage(request) as Promise<RuntimeResponse>;
}

/** Live view of extension state for extension pages (newtab/options/setup). */
export function usePrivatefoxState(): PrivatefoxState | null {
  const [state, setState] = useState<PrivatefoxState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const result = await browser.storage.local.get(STATE_KEY);
      const stored = result[STATE_KEY] as Partial<PrivatefoxState> | undefined;
      if (!cancelled) setState({ ...DEFAULT_STATE, ...stored });
    };
    void read();

    const listener = (
      changes: Record<string, browser.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[STATE_KEY]) return;
      void read();
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  return state;
}
