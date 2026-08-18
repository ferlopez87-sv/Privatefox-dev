import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildPolicies, type PolicyOptions } from "./policies-template";

export const FIREFOX_APP = "/Applications/Firefox.app";

/**
 * Every Firefox install this can enforce against, most-common first.
 *
 * Hardcoding /Applications/Firefox.app silently disabled the whole
 * enforcement layer for anyone on a non-release channel: writePolicyFile
 * threw "Firefox not found", the installer printed one ✘ among five steps
 * and carried on, and policies.json was never written — no force-install,
 * no BlockAboutAddons, no private_browsing key. Detection is what makes the
 * layer real, not a convenience.
 *
 * All detected installs are targeted, not just the first: a second Firefox
 * channel would otherwise be a one-click way around the lock.
 */
export const FIREFOX_APP_CANDIDATES: readonly string[] = [
  "/Applications/Firefox.app",
  "/Applications/Firefox Developer Edition.app",
  "/Applications/Firefox Nightly.app",
  "/Applications/Firefox ESR.app",
  join(homedir(), "Applications", "Firefox.app"),
  join(homedir(), "Applications", "Firefox Developer Edition.app"),
  join(homedir(), "Applications", "Firefox Nightly.app"),
];

/** The main binary, and what the policy-guard LaunchAgent watches. */
export function firefoxBinary(firefoxApp: string): string {
  return join(firefoxApp, "Contents", "MacOS", "firefox");
}

/**
 * Returns every Firefox app bundle present on this Mac.
 * `PRIVATEFOX_FIREFOX_APP` overrides detection entirely (one absolute path),
 * for an install in a location this list cannot guess.
 */
export function findFirefoxApps(
  candidates: readonly string[] = FIREFOX_APP_CANDIDATES,
): string[] {
  const override = process.env["PRIVATEFOX_FIREFOX_APP"];
  if (override) return existsSync(override) ? [override] : [];
  return candidates.filter((app) => existsSync(app));
}

/** The distribution folder is wiped by every Firefox update on macOS. */
export function policiesDir(firefoxApp: string = FIREFOX_APP): string {
  return join(firefoxApp, "Contents", "Resources", "distribution");
}

export interface WritePolicyResult {
  path: string;
}

/**
 * Writes policies.json into one Firefox app bundle. Requires write access to
 * that bundle. Takes effect only after a full Firefox restart — never
 * force-quit Firefox from here.
 */
export function writePolicyFile(
  xpiPath: string,
  firefoxApp: string = FIREFOX_APP,
  options: PolicyOptions = {},
): WritePolicyResult {
  if (!existsSync(firefoxApp)) {
    throw new Error(`Firefox not found at ${firefoxApp}`);
  }
  const dir = policiesDir(firefoxApp);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "policies.json");
  writeFileSync(
    path,
    JSON.stringify(buildPolicies(xpiPath, options), null, 2) + "\n",
  );
  return { path };
}

export interface WritePolicyFilesResult {
  written: string[];
  failed: { app: string; error: string }[];
}

/**
 * Writes policies.json into every detected Firefox install. Reports each
 * bundle separately so a partial failure (one app writable, another owned by
 * root) stays visible instead of collapsing into a single ok/error.
 */
export function writePolicyFiles(
  xpiPath: string,
  apps: string[] = findFirefoxApps(),
  options: PolicyOptions = {},
): WritePolicyFilesResult {
  const written: string[] = [];
  const failed: { app: string; error: string }[] = [];
  for (const app of apps) {
    try {
      written.push(writePolicyFile(xpiPath, app, options).path);
    } catch (err) {
      failed.push({
        app,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { written, failed };
}
