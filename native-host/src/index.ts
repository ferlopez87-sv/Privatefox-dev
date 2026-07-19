/**
 * Native messaging host entry. Two modes:
 *
 *  (default)        Firefox spawned us: speak length-prefixed JSON over
 *                   stdin/stdout. One request -> one response. Never write
 *                   anything else to stdout (it corrupts the framing).
 *
 *  --policy-guard   Invoked by the com.privatefox.policyguard LaunchAgent
 *                   after Firefox's app bundle changed (= auto-update wiped
 *                   Contents/Resources/distribution). Re-installs
 *                   policies.json, then exits.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { MessageDecoder, encodeMessage } from "./protocol";
import { dispatch } from "./commands/index";
import { installPolicy } from "./commands/install-policy";
import { policiesDir } from "./policy/write-policy-file";

function runPolicyGuard(): void {
  const policiesPath = join(policiesDir(), "policies.json");
  if (existsSync(policiesPath)) {
    console.error("policy-guard: policies.json present, nothing to do");
    return;
  }
  // Grace period so Gatekeeper's first-launch validation of the freshly
  // updated bundle isn't tripped by us modifying it immediately.
  setTimeout(() => {
    const result = installPolicy();
    console.error(
      result.ok
        ? `policy-guard: reinstalled — ${result.detail ?? ""}`
        : `policy-guard: FAILED — ${result.error ?? ""}`,
    );
  }, 60_000);
}

function runStdioHost(): void {
  const decoder = new MessageDecoder();
  process.stdin.on("data", (chunk: Buffer) => {
    for (const message of decoder.push(chunk)) {
      void dispatch(message)
        .catch((err: unknown) => ({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }))
        .then((result) => {
          process.stdout.write(encodeMessage(result));
        });
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

if (process.argv.includes("--policy-guard")) {
  runPolicyGuard();
} else {
  runStdioHost();
}
