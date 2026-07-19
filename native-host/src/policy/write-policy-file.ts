import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPolicies } from "./policies-template";

export const FIREFOX_APP = "/Applications/Firefox.app";

/** The distribution folder is wiped by every Firefox update on macOS. */
export function policiesDir(firefoxApp: string = FIREFOX_APP): string {
  return join(firefoxApp, "Contents", "Resources", "distribution");
}

export interface WritePolicyResult {
  path: string;
}

/**
 * Writes policies.json into the Firefox app bundle. Requires write access
 * to /Applications/Firefox.app. Takes effect only after a full Firefox
 * restart — never force-quit Firefox from here.
 */
export function writePolicyFile(
  xpiPath: string,
  firefoxApp: string = FIREFOX_APP,
): WritePolicyResult {
  if (!existsSync(firefoxApp)) {
    throw new Error(`Firefox not found at ${firefoxApp}`);
  }
  const dir = policiesDir(firefoxApp);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "policies.json");
  writeFileSync(path, JSON.stringify(buildPolicies(xpiPath), null, 2) + "\n");
  return { path };
}
