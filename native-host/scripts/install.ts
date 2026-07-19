/**
 * One-time macOS setup CLI (run from a built dist/: `npm run install-host`).
 * Steps, all idempotent:
 *   1. Copy the host binary to ~/Library/Application Support/Privatefox/bin/
 *   2. Register the native-messaging manifest for Firefox
 *   3. Copy the signed .xpi (if present next to this script) into place
 *   4. Write policies.json into Firefox.app  (asks nothing; fails loudly
 *      if the .xpi is missing — signing is a prerequisite, see docs/SETUP.md)
 *   5. Load the policy-guard LaunchAgent
 * Finishes by telling the user to fully restart Firefox.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_SUPPORT_DIR } from "../src/config";
import { installPolicy } from "../src/commands/install-policy";

const here = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(APP_SUPPORT_DIR, "bin");
const HOST_BINARY = join(BIN_DIR, "privatefox-host.cjs");
const XPI_DEST = join(APP_SUPPORT_DIR, "privatefox-lock.xpi");
const NMH_DIR = join(
  homedir(),
  "Library",
  "Application Support",
  "Mozilla",
  "NativeMessagingHosts",
);
const AGENTS_DIR = join(homedir(), "Library", "LaunchAgents");
const AGENT_LABEL = "com.privatefox.policyguard";

function step(name: string, fn: () => string): void {
  try {
    console.log(`✔ ${name}: ${fn()}`);
  } catch (err) {
    console.error(
      `✘ ${name}: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  }
}

if (process.platform !== "darwin") {
  console.error("This installer only supports macOS.");
  process.exit(1);
}

step("Install host binary", () => {
  mkdirSync(BIN_DIR, { recursive: true });
  copyFileSync(join(here, "privatefox-host.cjs"), HOST_BINARY);
  chmodSync(HOST_BINARY, 0o755);
  return HOST_BINARY;
});

step("Register native messaging manifest", () => {
  mkdirSync(NMH_DIR, { recursive: true });
  const template = readFileSync(
    join(here, "..", "manifests", "com.privatefox.host.json"),
    "utf8",
  );
  const manifestPath = join(NMH_DIR, "com.privatefox.host.json");
  writeFileSync(
    manifestPath,
    template.replace("__HOST_BINARY_PATH__", HOST_BINARY),
  );
  return manifestPath;
});

step("Copy signed extension .xpi", () => {
  const candidates = [
    join(here, "privatefox-lock.xpi"),
    join(here, "..", "..", "extension", "web-ext-artifacts", "privatefox-lock.xpi"),
  ];
  const source = candidates.find((p) => existsSync(p));
  if (!source) {
    if (existsSync(XPI_DEST)) return `already present at ${XPI_DEST}`;
    throw new Error(
      `No signed .xpi found (looked in: ${candidates.join(", ")}). ` +
        `Sign the extension first (web-ext sign) — see docs/SETUP.md.`,
    );
  }
  mkdirSync(APP_SUPPORT_DIR, { recursive: true });
  copyFileSync(source, XPI_DEST);
  return `${source} -> ${XPI_DEST}`;
});

step("Write policies.json into Firefox.app", () => {
  const result = installPolicy(XPI_DEST);
  if (!result.ok) throw new Error(result.error);
  return result.detail ?? "done";
});

step("Load policy-guard LaunchAgent", () => {
  mkdirSync(AGENTS_DIR, { recursive: true });
  const template = readFileSync(
    join(here, "..", "launchd", `${AGENT_LABEL}.plist`),
    "utf8",
  );
  const plistPath = join(AGENTS_DIR, `${AGENT_LABEL}.plist`);
  writeFileSync(
    plistPath,
    template.replace("__HOST_BINARY_PATH__", HOST_BINARY),
  );
  // Reload if already loaded; ignore "not loaded" errors on first install.
  try {
    execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
  } catch {
    /* first install */
  }
  execFileSync("launchctl", ["load", plistPath], { stdio: "ignore" });
  return plistPath;
});

console.log(
  "\nDone. Quit Firefox completely and reopen it for the enterprise " +
    "policies (force-install, no private browsing, no about:addons) to " +
    "take effect.",
);
