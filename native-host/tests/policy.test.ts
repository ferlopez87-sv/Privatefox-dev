import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPolicies,
  EXTENSION_ID,
} from "../src/policy/policies-template";
import {
  findFirefoxApps,
  firefoxBinary,
  policiesDir,
  writePolicyFile,
  writePolicyFiles,
} from "../src/policy/write-policy-file";

/** Two fake .app bundles in a temp dir, standing in for two Firefox channels. */
function fakeApps(...names: string[]): string[] {
  const root = mkdtempSync(join(tmpdir(), "pf-apps-"));
  return names.map((name) => {
    const app = join(root, name);
    mkdirSync(app, { recursive: true });
    return app;
  });
}

function extSettings(policies: { policies: Record<string, unknown> }) {
  return (
    policies.policies["ExtensionSettings"] as Record<
      string,
      Record<string, unknown>
    >
  )[EXTENSION_ID]!;
}

describe("policies template", () => {
  it("force-installs the extension and grants private-window access by default", () => {
    const policies = buildPolicies("/Users/me/Library/pf.xpi") as {
      policies: Record<string, unknown>;
    };
    expect(policies.policies["BlockAboutAddons"]).toBe(true);
    const ext = extSettings(policies);
    expect(ext["installation_mode"]).toBe("force_installed");
    expect(ext["install_url"]).toBe("file:///Users/me/Library/pf.xpi");
    expect(ext["updates_disabled"]).toBe(true);
    // Required for the extension to see (and dynamically close) private
    // windows at all.
    expect(ext["private_browsing"]).toBe(true);
  });

  it("omits DisablePrivateBrowsing by default", () => {
    // Private browsing is now blocked dynamically by the extension
    // (windows.onCreated + settings pass), not hard-blocked by the policy,
    // so the toggle no longer needs a Firefox restart to take effect.
    const def = buildPolicies("/Users/me/pf.xpi") as {
      policies: Record<string, unknown>;
    };
    const off = buildPolicies("/Users/me/pf.xpi", {
      disablePrivateBrowsing: false,
    }) as { policies: Record<string, unknown> };
    expect("DisablePrivateBrowsing" in def.policies).toBe(false);
    expect("DisablePrivateBrowsing" in off.policies).toBe(false);
    // The other enforcement policies are unaffected.
    expect(def.policies["BlockAboutAddons"]).toBe(true);
    expect(def.policies["ExtensionSettings"]).toBeDefined();
  });

  it("still supports the hard block when explicitly requested", () => {
    const on = buildPolicies("/Users/me/pf.xpi", {
      disablePrivateBrowsing: true,
    }) as { policies: Record<string, unknown> };
    expect(on.policies["DisablePrivateBrowsing"]).toBe(true);
    // Nothing to grant access to when private windows don't exist.
    expect("private_browsing" in extSettings(on)).toBe(false);
  });

  it("omits private_browsing when access is explicitly declined", () => {
    const policies = buildPolicies("/Users/me/pf.xpi", {
      grantPrivateBrowsingAccess: false,
    }) as { policies: Record<string, unknown> };
    expect("private_browsing" in extSettings(policies)).toBe(false);
  });

  it("omits BlockAboutAddons when blockAboutAddons is false", () => {
    const policies = buildPolicies("/Users/me/pf.xpi", {
      blockAboutAddons: false,
    }) as { policies: Record<string, unknown> };
    // The extension's password gate protects about:addons instead.
    expect("BlockAboutAddons" in policies.policies).toBe(false);
    // Force-install is unaffected.
    expect(policies.policies["ExtensionSettings"]).toBeDefined();
  });

  it("rejects relative xpi paths", () => {
    expect(() => buildPolicies("relative/pf.xpi")).toThrow(/absolute/);
  });
});

describe("write-policy-file", () => {
  it("writes into <app>/Contents/Resources/distribution/policies.json", () => {
    const fakeApp = join(mkdtempSync(join(tmpdir(), "pf-")), "Firefox.app");
    mkdirSync(fakeApp, { recursive: true });

    const { path } = writePolicyFile("/tmp/pf.xpi", fakeApp);
    expect(path).toBe(join(policiesDir(fakeApp), "policies.json"));
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    expect(parsed.policies.BlockAboutAddons).toBe(true);
  });

  it("fails clearly when Firefox is missing", () => {
    expect(() => writePolicyFile("/tmp/pf.xpi", "/nonexistent/Firefox.app"))
      .toThrow(/not found/);
  });
});

describe("finding Firefox installs", () => {
  afterEach(() => {
    delete process.env["PRIVATEFOX_FIREFOX_APP"];
  });

  it("returns only the candidates that actually exist", () => {
    const [real] = fakeApps("Firefox Developer Edition.app");
    const found = findFirefoxApps([
      "/nonexistent/Firefox.app",
      real!,
      "/nonexistent/Firefox Nightly.app",
    ]);
    // The release-channel path missing is exactly the case that used to
    // disable enforcement entirely for Developer Edition users.
    expect(found).toEqual([real]);
  });

  it("returns nothing when no candidate exists", () => {
    expect(findFirefoxApps(["/nonexistent/Firefox.app"])).toEqual([]);
  });

  it("lets PRIVATEFOX_FIREFOX_APP override detection", () => {
    const [listed, unlisted] = fakeApps("Firefox.app", "Custom Firefox.app");
    process.env["PRIVATEFOX_FIREFOX_APP"] = unlisted!;
    expect(findFirefoxApps([listed!])).toEqual([unlisted]);
  });

  it("ignores an override pointing at nothing", () => {
    const [listed] = fakeApps("Firefox.app");
    process.env["PRIVATEFOX_FIREFOX_APP"] = "/nonexistent/Firefox.app";
    expect(findFirefoxApps([listed!])).toEqual([]);
  });

  it("derives the binary the LaunchAgent watches", () => {
    expect(firefoxBinary("/Applications/Firefox Developer Edition.app")).toBe(
      "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox",
    );
  });
});

describe("writing to every detected install", () => {
  it("writes one policies.json per Firefox install", () => {
    const apps = fakeApps("Firefox.app", "Firefox Developer Edition.app");
    const { written, failed } = writePolicyFiles("/tmp/pf.xpi", apps);
    expect(failed).toEqual([]);
    expect(written).toEqual(apps.map((a) => join(policiesDir(a), "policies.json")));
    for (const path of written) {
      expect(JSON.parse(readFileSync(path, "utf8")).policies.BlockAboutAddons)
        .toBe(true);
    }
  });

  it("keeps a partial success visible instead of failing the whole run", () => {
    const [real] = fakeApps("Firefox.app");
    const { written, failed } = writePolicyFiles("/tmp/pf.xpi", [
      real!,
      "/nonexistent/Firefox Nightly.app",
    ]);
    expect(written).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.app).toBe("/nonexistent/Firefox Nightly.app");
  });
});
