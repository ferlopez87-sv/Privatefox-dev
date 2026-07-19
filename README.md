# Privatefox Lock

A macOS-only Firefox extension that locks you out of your own browser behind
a password — a self-control / focus tool for a single person on their own
machine. It is not parental control and not a multi-user or enterprise
product; the "attacker" it defends against is you, in a moment of weakness.

## Objectives

- **Lock the browser** on every Firefox startup and after a configurable
  idle timeout, until the correct password is entered.
- **Close the obvious escape hatches** a WebExtension alone cannot block:
  Private Browsing windows, the `about:addons` page, and removing/disabling
  the extension itself. These are closed with Firefox Enterprise Policies
  (`policies.json`), not extension code — that policy layer is load-bearing,
  not optional hardening.
- **Provide a real recovery path** if the password is forgotten: a one-time
  recovery code shown at setup, or an emailed one-time code sent through the
  user's own Mail.app/SMTP account. Either path clears the password and
  forces a deliberate reset — never a silent unlock.
- **Never hold credentials in the extension.** Password and recovery-code
  hashes (PBKDF2) live in `browser.storage.local`; mail/SMTP configuration
  lives only in a native host config file on disk, mode `0600`.

See `docs/THREAT-MODEL.md` for exactly what is and isn't defended against,
and `docs/ARCHITECTURE.md` for the full data-flow and design rationale.

## How it's built

npm-workspaces monorepo with two independently buildable packages:

```
extension/     Firefox WebExtension (Manifest V3, Vite + TypeScript + Preact)
native-host/   Companion native-messaging app (Node/TypeScript)
docs/          ARCHITECTURE.md, THREAT-MODEL.md, SETUP.md
```

- **extension/** — the lock experience: background event page (lock state
  machine, idle detection, nav-guard), a content-script overlay for
  already-open tabs, a new-tab-override lock screen, and options/setup
  pages. All state lives in `browser.storage.local` and every surface reacts
  to `storage.onChanged` — the background page is non-persistent and never
  assumes in-memory continuity.
- **native-host/** — the enforcement and recovery-email companion, talking
  to the extension over stdio native messaging. Two jobs: writing
  `policies.json` into the Firefox app bundle (`install-policy`) and sending
  recovery emails via Mail.app or SMTP (`send-recovery-email`).

Development follows a **Plan → Execute → Test → Confirm** workflow for every
change (see `CLAUDE.md` for the full contract used by AI coding agents in
this repo).

**Status:** Phases 1–4 are implemented and unit-tested (core lock,
options/idle/recovery, native host + policy installer, email recovery).
Phase 5 (packaging/release polish) and manual QA of the policy/native-host
layer on a real Mac are still outstanding.

## Requirements

- macOS, with Firefox installed at `/Applications/Firefox.app`
- Node.js 20+
- A free [addons.mozilla.org](https://addons.mozilla.org) account, needed
  only if you want to sign the extension for policy enforcement (see below)

## Usage

### 1. Get the code

All `npm` commands below must be run **from inside the cloned repository**,
not from your home directory — running `npm install` anywhere without a
`package.json` fails with `ENOENT: Could not read package.json`.

```sh
cd ~                                                        # or wherever you keep projects
git clone https://github.com/ferlopez87-sv/Privatefox-dev.git
cd Privatefox-dev                                           # ← important: enter the repo
```

### 2. Try the lock screen (no OS hardening yet)

```sh
# from the Privatefox-dev directory:
npm install
npm run build
cd extension
npm run start        # web-ext run: launches Firefox with the extension loaded
```

To launch Firefox **Developer Edition** specifically instead of the default
Firefox:

```sh
npx web-ext run --source-dir dist --target firefox-desktop \
  --firefox="/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox-bin"
```

On first run you'll get a setup wizard: choose a password, optionally a
recovery email, and save the one-time recovery code somewhere safe outside
the browser. At this stage the lock works, but the extension can still be
disabled from `about:addons` and Private Browsing still works — that's
expected until you complete the hardening steps below.

### 3. Sign the extension (required to enforce policies)

Release-channel Firefox requires AMO signing even for a force-installed,
unlisted extension:

```sh
cd extension
npx web-ext sign --source-dir dist --channel unlisted \
  --api-key "user:xxxxxxx" --api-secret "yyyyyyy"
```

Copy the signed `.xpi` to
`~/Library/Application Support/Privatefox/privatefox-lock.xpi`.

### 4. Install the native host + enterprise policies

```sh
cd native-host
npm run build
npm run install-host
```

This copies the native-messaging host, registers it with Firefox, installs
the signed `.xpi`, writes `policies.json` into the Firefox app bundle, and
loads a LaunchAgent that re-installs the policy after Firefox auto-updates
(macOS wipes it on every update). **Quit Firefox completely and reopen it**
for the policies to take effect — verify at `about:policies`.

### 5. Email recovery (optional)

Defaults to Mail.app via AppleScript (no stored credentials). To use SMTP
instead, edit `~/Library/Application Support/Privatefox/host-config.json`
(created mode `0600`, never readable by the extension) — see
`docs/SETUP.md` for the exact fields.

Full walkthrough, troubleshooting, and known limitations:
[`docs/SETUP.md`](docs/SETUP.md).

## Development commands

From the repo root (npm workspaces):

```sh
npm install         # install both packages
npm test            # vitest, both packages
npm run build       # build both packages
npm run lint        # web-ext lint (extension only; requires a prior build)
```

Per package:

- `extension/`: `npm run build` (Vite → `dist/`), `npm test` (single file:
  `npx vitest run tests/lock-state.test.ts`), `npm run typecheck`,
  `npm run start` (`web-ext run`, needs a real Firefox), `npm run package`
  (`.xpi` into `web-ext-artifacts/`).
- `native-host/`: `npm run build` (esbuild → `dist/`), `npm test`,
  `npm run typecheck`, `npm run install-host` (macOS-only setup CLI, run
  after build).

CI (`.github/workflows/ci.yml`) runs tests, typecheck, build, and
`web-ext lint` on every push/PR — it cannot exercise policy or native-host
behavior, which requires a real Firefox restart on macOS.

## License

MPL-2.0 — see [LICENSE](LICENSE).
