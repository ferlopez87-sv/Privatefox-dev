# Privatefox Lock — macOS setup

End-to-end path from a clone to a hardened Firefox. Phases 1–2 (the lock
itself) work without any of the OS-level steps; do those first and only
harden once you're happy.

## Prerequisites

- macOS with Firefox installed at `/Applications/Firefox.app`
- Node.js 20+ (`node` must be reachable by GUI apps for native messaging;
  if installed via Homebrew, `ln -s $(which node) /usr/local/bin/node` is a
  safe way to make sure — see Known limitations)
- A free Mozilla add-ons account for signing: https://addons.mozilla.org

## 1. Build and try the extension (no hardening)

```sh
npm install
npm run build
cd extension
npm run start        # web-ext run: launches Firefox with the extension
```

First run opens the setup wizard: pick a password, optionally a recovery
email, and save the one-time recovery code somewhere outside this browser.

## 2. Sign the extension (required for policy enforcement)

Release-channel Firefox requires AMO signing even for force-installed
extensions. Create API credentials at
https://addons.mozilla.org/developers/addon/api/key/ then:

```sh
cd extension
npx web-ext sign --source-dir dist --channel unlisted \
  --api-key "user:xxxxxxx" --api-secret "yyyyyyy"
```

Copy the signed `.xpi` from `web-ext-artifacts/` to
`native-host/dist/privatefox-lock.xpi` (or directly to
`~/Library/Application Support/Privatefox/privatefox-lock.xpi`).

## 3. Install the native host + enterprise policies

```sh
cd native-host
npm run build
npm run install-host
```

This (idempotently):
1. copies the host binary to `~/Library/Application Support/Privatefox/bin/`
2. registers the native-messaging manifest for Firefox
3. copies the signed `.xpi` into place
4. writes `policies.json` into `Firefox.app/Contents/Resources/distribution/`
5. loads the `com.privatefox.policyguard` LaunchAgent (re-installs the
   policy after Firefox auto-updates)

Then **quit Firefox completely and reopen it**. Verify:
- `about:policies` lists ExtensionSettings, DisablePrivateBrowsing,
  BlockAboutAddons as active
- the extension appears and cannot be removed
- `about:addons` is blocked; no New Private Window menu item

## 4. Email recovery (optional)

Default transport is Mail.app via AppleScript — zero stored credentials;
just have an account configured in Mail.app. To use SMTP instead, edit
`~/Library/Application Support/Privatefox/host-config.json`:

```json
{
  "mailTransport": "smtp",
  "smtp": {
    "host": "smtp.example.com", "port": 465, "secure": true,
    "user": "you@example.com", "pass": "app-password",
    "from": "you@example.com"
  }
}
```

That file is created mode 0600 and is never readable by the extension.

## After a Firefox update

macOS Firefox updates replace the whole app bundle, wiping `distribution/`.
The LaunchAgent re-installs `policies.json` (after a ~60s Gatekeeper grace
period), but enforcement is off until the next full Firefox restart. If in
doubt: check `about:policies`, or re-run `npm run install-host`.

## Known limitations

- Firefox and launchd spawn the host with a minimal PATH. The host is a
  `#!/usr/bin/env node` script until Phase 5 (single-executable packaging),
  so `node` must be visible to GUI processes — a symlink in
  `/usr/local/bin` covers both.
- `about:config` and `about:debugging` are not blocked (documented
  decision — see docs/THREAT-MODEL.md).
