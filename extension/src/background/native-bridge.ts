import type { NativeCommand, NativeResult } from "../shared/protocol";
import { NATIVE_HOST_NAME } from "../shared/constants";

/**
 * Thin wrapper over sendNativeMessage. The native host is optional until
 * Phase 3 is installed on the machine — callers must handle { ok: false }.
 */
export async function callNativeHost(
  command: NativeCommand,
): Promise<NativeResult> {
  try {
    const result = (await browser.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      command,
    )) as NativeResult;
    return result ?? { ok: false, error: "Empty response from native host." };
  } catch (err) {
    return {
      ok: false,
      error:
        "Native host unavailable. Run the Privatefox installer to enable " +
        "policy hardening and email recovery. " +
        (err instanceof Error ? err.message : String(err)),
    };
  }
}
