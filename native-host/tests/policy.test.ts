import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPolicies,
  EXTENSION_ID,
} from "../src/policy/policies-template";
import { writePolicyFile, policiesDir } from "../src/policy/write-policy-file";

describe("policies template", () => {
  it("builds the three enforcement policies", () => {
    const policies = buildPolicies("/Users/me/Library/pf.xpi") as {
      policies: Record<string, unknown>;
    };
    expect(policies.policies["DisablePrivateBrowsing"]).toBe(true);
    expect(policies.policies["BlockAboutAddons"]).toBe(true);
    const ext = (
      policies.policies["ExtensionSettings"] as Record<
        string,
        Record<string, unknown>
      >
    )[EXTENSION_ID]!;
    expect(ext["installation_mode"]).toBe("force_installed");
    expect(ext["install_url"]).toBe("file:///Users/me/Library/pf.xpi");
    expect(ext["updates_disabled"]).toBe(true);
  });

  it("omits DisablePrivateBrowsing when disablePrivateBrowsing is false", () => {
    const policies = buildPolicies("/Users/me/pf.xpi", {
      disablePrivateBrowsing: false,
    }) as { policies: Record<string, unknown> };
    expect("DisablePrivateBrowsing" in policies.policies).toBe(false);
    // The other enforcement policies are unaffected.
    expect(policies.policies["BlockAboutAddons"]).toBe(true);
    expect(policies.policies["ExtensionSettings"]).toBeDefined();
  });

  it("includes DisablePrivateBrowsing by default and when explicitly true", () => {
    const def = buildPolicies("/Users/me/pf.xpi") as {
      policies: Record<string, unknown>;
    };
    const on = buildPolicies("/Users/me/pf.xpi", {
      disablePrivateBrowsing: true,
    }) as { policies: Record<string, unknown> };
    expect(def.policies["DisablePrivateBrowsing"]).toBe(true);
    expect(on.policies["DisablePrivateBrowsing"]).toBe(true);
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
