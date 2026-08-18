import { join } from "node:path";
import { existsSync } from "node:fs";
import type { NativeResult } from "../protocol";
import { APP_SUPPORT_DIR } from "../config";
import {
  FIREFOX_APP_CANDIDATES,
  findFirefoxApps,
  writePolicyFiles,
} from "../policy/write-policy-file";
import type { PolicyOptions } from "../policy/policies-template";

const DEFAULT_XPI = join(APP_SUPPORT_DIR, "privatefox-lock.xpi");

export function installPolicy(
  xpiPath?: string,
  options: PolicyOptions = {},
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
  const apps = findFirefoxApps();
  if (apps.length === 0) {
    return {
      ok: false,
      error:
        `No Firefox install found. Looked in: ` +
        `${FIREFOX_APP_CANDIDATES.join(", ")}. Set PRIVATEFOX_FIREFOX_APP ` +
        `to the absolute path of the .app bundle if yours is elsewhere.`,
    };
  }
  const { written, failed } = writePolicyFiles(xpi, apps, options);
  if (written.length === 0) {
    return {
      ok: false,
      error: failed.map((f) => `${f.app}: ${f.error}`).join("; "),
    };
  }
  // A partial write still counts as ok — the policies that landed are real —
  // but the failures ride along in the detail so they are not silently lost.
  const detail =
    `Wrote ${written.join(", ")}. Restart Firefox for policies to take ` +
    `effect.` +
    (failed.length > 0
      ? ` Could not write: ${failed.map((f) => `${f.app} (${f.error})`).join(", ")}.`
      : "");
  return { ok: true, detail };
}
