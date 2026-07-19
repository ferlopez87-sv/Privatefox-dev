/**
 * Bundles the host and installer to single-file CJS executables in dist/.
 * nodemailer stays external-free: esbuild bundles it in, so the output
 * only needs a system `node` to run. (Phase 5: Node SEA packaging.)
 */
import { build } from "esbuild";
import { chmodSync } from "node:fs";

const shared = {
  bundle: true,
  platform: "node" as const,
  target: "node20",
  format: "cjs" as const,
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info" as const,
};

await build({
  ...shared,
  entryPoints: ["src/index.ts"],
  outfile: "dist/privatefox-host.cjs",
});
chmodSync("dist/privatefox-host.cjs", 0o755);

// ESM output: install.ts locates its templates via import.meta.url.
await build({
  ...shared,
  format: "esm",
  entryPoints: ["scripts/install.ts"],
  outfile: "dist/install.mjs",
});
chmodSync("dist/install.mjs", 0o755);
