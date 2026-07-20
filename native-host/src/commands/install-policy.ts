import { join } from "node:path";
import { existsSync } from "node:fs";
import type { NativeResult } from "../protocol";
import { APP_SUPPORT_DIR } from "../config";
import { writePolicyFile } from "../policy/write-policy-file";

const DEFAULT_XPI = join(APP_SUPPORT_DIR, "privatefox-lock.xpi");

export function installPolicy(
  xpiPath?: string,
  disablePrivateBrowsing = true,
): NativeResult {
  const xpi = xpiPath ?? DEFAULT_XPI;
  if (!existsSync(xpi)) {
    return {
      ok: false,
      error:
        `Signed .xpi not found at ${xpi}. Build and sign the extension ` +
        `(web-ext sign), copy it there, then retry.`,
    };
  }
  try {
    const { path } = writePolicyFile(xpi, undefined, { disablePrivateBrowsing });
    return {
      ok: true,
      detail: `Wrote ${path}. Restart Firefox for policies to take effect.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
