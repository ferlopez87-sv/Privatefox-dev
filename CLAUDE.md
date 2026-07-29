# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Privatefox is a **macOS-only Firefox extension that locks the user out of their own browser behind a password** — a self-control/focus tool for a single person on their own machine (not parental control, not a multi-user/enterprise product). The distinguishing constraint: a WebExtension alone cannot block Private Browsing, cannot block `about:addons`, and cannot prevent its own removal. Firefox Enterprise Policies (`policies.json`) are therefore not an optional hardening layer here — they are the actual enforcement mechanism for those three requirements. The extension's own scripts only ever provide defense-in-depth on top of that.

**Repository status: Phases 1–4 implemented** (core lock, options/idle/recovery, native host + policy installer, email recovery). Remaining: Phase 5 (Node SEA packaging, release polish) and real-Mac manual QA of the policy/native-host layer. Keep this file in sync as work lands.

## Read these two files before starting non-trivial work

- **`context.md`** — current project state, in-flight/uncommitted work, and anything a fresh session needs to resume without re-deriving it from git history or a conversation log. Read this first; update it whenever a session ends with something unfinished, and trim stale entries once that work lands (its content moves into this file, `CHANGELOG.md`, or the code itself).
- **`feedback.md`** — a running log of mistakes and what they taught, not a changelog. Skim before touching an area it covers; add an entry whenever something ships broken and the user is the one who catches it, so the same class of bug doesn't repeat.

Reading these first is cheaper than re-exploring the codebase from scratch every session — that's the point of keeping them current.

## Required development workflow

Every task in this repo — from a single-file fix to a full phase — follows five gates. A task is not done until all five are satisfied:

1. **Plan**: State the approach before touching files. For anything touching more than one file/module, or with more than one reasonable approach, use plan mode or otherwise get explicit direction before implementing.
2. **Execute**: Implement per the architecture and conventions below. Don't unilaterally introduce new architecture (swapping the Vite plugin, changing the crypto scheme, adding a server component, changing the enforcement model) without flagging it first.
3. **Version**: Bump the extension version — see below. Every change that reaches the user is a new version, no exceptions.
4. **Test**: Run the applicable checks before calling anything done — `vitest` for logic in `shared/`, `web-ext lint`, and for anything touching lock-state/overlay/policy behavior, manual verification via `web-ext run`. Changes to policy/native-host behavior additionally require an actual restart against a real Firefox profile — this cannot be automated (see Risks).
5. **Confirm final product**: State plainly what was verified and how. "Tests pass" is not sufficient on its own for a UI or behavioral change — say what you actually observed happen. State the new version number.

## Versioning: every change ships a new version

**Never hand the user a build that carries the same version as a previous one.** The user installs `.xpi`/`.zip` files manually and has no other way to tell two builds apart — a version that doesn't move makes it impossible to know whether a fix actually landed, and Firefox will not treat the package as an upgrade.

`extension/package.json` is the single source of truth: `src/manifest.ts` reads `pkg.version`, so bumping that one field updates the manifest, the built `.xpi`, and what Firefox displays. Bump it **in the same commit as the change**, never as a follow-up.

Semver, judged by what the user sees:

- **Patch** (`1.2.0` → `1.2.1`) — bug fix, copy/style tweak, refactor with no behavior change, dependency bump.
- **Minor** (`1.2.1` → `1.3.0`) — new user-visible capability (a new surface, a new preference, a new lock trigger).
- **Major** (`1.3.0` → `2.0.0`) — a breaking change to stored state or the enforcement model: a storage shape that needs migration (bump `STORAGE_SCHEMA_VERSION` too), a changed native-messaging contract, or removing a protection users relied on.

Record the change in `CHANGELOG.md` under the new version in the same commit. The native host (`native-host/package.json`) versions independently — bump it only when the host itself changes, since it ships and installs separately.

## Commands

From the repo root: `npm install` (workspaces), `npm test` (vitest in both packages), `npm run build` (both packages), `npm run lint` (web-ext lint on the built extension).

Per package:

- `extension/`: `npm run build` (vite → `dist/`), `npm test` (vitest; single file: `npx vitest run tests/lock-state.test.ts`), `npm run typecheck`, `npm run lint` (requires a prior build — lints `dist/`), `npm run start` (`web-ext run`, needs a real Firefox), `npm run package` (`.xpi` into `web-ext-artifacts/`).
- `native-host/`: `npm run build` (esbuild → `dist/privatefox-host.cjs` + `dist/install.mjs`), `npm test`, `npm run typecheck`, `npm run install-host` (macOS-only setup CLI; run after build).

## Repository layout

npm-workspaces monorepo, two independently buildable packages plus shared root config:

```
Privatefox-dev/
├── package.json                 # npm workspaces: ["extension","native-host"]
├── tsconfig.base.json
├── docs/
│   ├── ARCHITECTURE.md
│   ├── THREAT-MODEL.md          # documents the Risks section below
│   └── SETUP.md                 # end-user: build → sign → install-host → restart Firefox
│
├── extension/                   # the WebExtension (Vite + TypeScript)
│   ├── src/
│   │   ├── manifest.ts          # source-of-truth manifest object, consumed by the vite plugin
│   │   ├── background/          # index.ts, lock-state.ts, surface-lock.ts, idle-monitor.ts, nav-guard.ts, native-bridge.ts, router.ts
│   │   ├── content/              # overlay.ts (content script entry), overlay-ui.ts (closed ShadowRoot UI)
│   │   ├── newtab/               # chrome_url_overrides.newtab target — the lock/welcome screen
│   │   ├── popup/                # action.default_popup — toolbar status card + Lock now / Preferences
│   │   ├── gate/                 # password gate nav-guard redirects to for about:addons
│   │   ├── options/              # password-gated (settingsPassUntil); welcome message, password, idle timeout, recovery, protection toggles
│   │   ├── setup/                 # first-run onboarding: force password creation + one-time recovery code display
│   │   ├── shared/                # crypto.ts, storage.ts, recovery-code.ts, protocol.ts, constants.ts
│   │   └── ui/                    # Preact components shared by lock/options/setup screens
│   └── tests/                     # Vitest: crypto.ts, lock-state.ts, recovery-code.ts, storage.ts
│
└── native-host/                  # companion native-messaging app (Node/TypeScript)
    ├── src/
    │   ├── index.ts               # stdio native-messaging loop entry
    │   ├── protocol.ts            # 4-byte LE length-prefixed JSON framing
    │   ├── commands/               # install-policy.ts, send-recovery-email.ts, dispatch table
    │   ├── mail/                   # apple-mail.ts (osascript/Mail.app), smtp.ts (nodemailer fallback)
    │   ├── config.ts               # ~/Library/Application Support/Privatefox/host-config.json (0600)
    │   └── policy/                 # policies-template.ts, write-policy-file.ts
    ├── manifests/com.privatefox.host.json   # native-messaging host manifest template
    ├── launchd/com.privatefox.policyguard.plist  # LaunchAgent: re-installs policies.json after Firefox auto-update
    └── scripts/                    # install.ts (CLI setup), build.ts (esbuild bundle)
```

## Architecture

**manifest.json (MV3, Firefox-only).** Background is declared as `background.scripts` + `"type": "module"` — **not** `background.service_worker`. Firefox does not yet run true service-worker background execution for extensions; declaring only `service_worker` would silently no-op. The background page is non-persistent (Firefox can suspend/unload it), so all lock state lives in `browser.storage.local` and is re-derived on every wake — never assume in-memory continuity across events.

Permissions: `storage`, `idle`, `tabs`, `webNavigation`, `nativeMessaging`. `host_permissions: ["<all_urls>"]` covers content-script matching and tab URL visibility **for web pages only** — it does *not* match `about:` URLs, and no host permission can. The `tabs` permission is therefore load-bearing: without it `tabs.onUpdated` omits `changeInfo.url` for `about:addons`/`about:preferences`, the nav-guard never sees the navigation, and the password gate silently does nothing. Do not "clean up" this permission. `chrome_url_overrides.newtab` is the lock screen surface for new tabs; a content script at `document_start` on `<all_urls>` (top frame only) overlays the lock UI on already-open tabs. Cross-surface reactivity (content overlay, newtab, options all reacting to a lock/unlock) goes through `storage.onChanged`, not runtime message-passing — this also makes overlay re-assertion on navigation automatic, since each freshly-loaded page's content script just reads current state at `document_start`.

**Enforcement boundary.** Content scripts cannot run on `about:addons`, `about:preferences`, or `about:debugging` — there is no technical workaround from inside the extension. This is exactly why `policies.json` (Firefox Enterprise Policies) is the real enforcement layer:
- `ExtensionSettings.<extension-id>.installation_mode: "force_installed"` (with an `install_url`) — prevents user removal/disabling.
- `DisablePrivateBrowsing: true` — removes Private Browsing entirely at the browser-chrome level. Conditional on the `blockPrivateBrowsing` preference.
- `BlockAboutAddons: true` — removes access to `about:addons` outright. Conditional on the `blockAboutAddons` preference (default on).

Both conditional policies ride along on the `install-policy` native command; `buildPolicies` omits the key when the preference is off. Force-install is unconditional.

**Making the lock visible.** Persisting `locked: true` only draws the overlay where the content script runs (http/https/file). It cannot run on extension pages, `about:` pages, or the startup window (`about:home` is not the newtab override), so `lock()` ends by calling `surfaceLockScreen()` (`background/surface-lock.ts`), which navigates each *focused* tab that cannot host the overlay to the lock page. Runs unconditionally, so locking while already locked re-asserts a visible lock screen. **Never "fix" a missing lock screen by only writing storage** — that was the original bug.

**Two passwords, deliberately.** `passwordHash` unlocks browsing; `settingsPasswordHash` guards the protected surfaces (Firefox preferences, `about:addons`, this extension's options). They are separate because the browsing password is typed all day and stops being a real decision, while those surfaces are where the protections get turned off — a *commitment device*, not extra cryptographic strength. Rules: while `settingsPasswordHash` is null the browsing password is accepted as a fallback (otherwise the options page needed to set it would be unreachable); once set, the browsing password is rejected there. Claiming it the first time takes the browsing password, changing it takes the current settings password. **Both recovery paths clear both hashes** — that is the only way back if the settings password is the one forgotten.

**Preferences password gate.** `src/options/` renders a password prompt unless `settingsPassUntil` is in the future (5 min, revoked on `lock()`). One pass covers every protected surface. Gating happens inside the page (it is extension-owned), not via `nav-guard`.

**`about:addons` password gate.** `nav-guard.ts` watches `tabs.onUpdated` for the pages in `GATED_PAGES` and redirects to `src/gate/` — a password prompt that, on success, stores a short-lived `addonsPassUntil` (5 min) and forwards the tab to the requested page. This is what protects `about:addons` when `blockAboutAddons` is off, and it is the only protection before Phase 3 is installed; with the policy on, the page is unreachable and the gate never runs. The pass is revoked on every `lock()`, and the gate's `target` query param is validated against `GATED_PAGES` (untrusted input — never forward to an arbitrary URL). Still defense-in-depth: `about:config` and the remote debugging protocol can bypass it.

**Signing requirement.** Even a force-installed, unlisted extension must be signed by AMO on Release-channel Firefox (`xpinstall.signatures.required` cannot be disabled outside Nightly/Developer Edition/ESR). Use `web-ext sign` for unlisted self-distribution, and point `install_url` in `policies.json` at that signed local `.xpi`. Set `updates_disabled: true` since there's no real update channel behind this install.

**Native messaging host.** Node/TypeScript, stdio JSON framing (4-byte LE length prefix), manifest registered at `~/Library/Application Support/Mozilla/NativeMessagingHosts/com.privatefox.host.json`. Two commands:
- `install-policy` — writes/refreshes `policies.json` into `Firefox.app/Contents/Resources/distribution/`, registers the LaunchAgent.
- `send-recovery-email` — AppleScript/Mail.app by default (zero stored credentials, uses the user's already-authenticated Mail.app account), SMTP via `nodemailer` as an opt-in fallback.

Mail/SMTP configuration lives only in `~/Library/Application Support/Privatefox/host-config.json` (mode `0600`) — **never** in the extension bundle or `browser.storage`. The extension only ever asks the host to perform an action; it never holds credentials.

**Password/recovery crypto.** PBKDF2 via `SubtleCrypto`, salted, for both the login password and the one-time recovery code. Only hashes are stored in `browser.storage.local` — plaintext is never persisted or transmitted anywhere, including to the native host.

**Idle/lock triggers.** `browser.idle` (configurable detection interval) plus `runtime.onStartup` both flip a single `LOCKED`/`UNLOCKED` value in storage; every surface reacts via `storage.onChanged` rather than being pushed a message.

## Build tooling / commands

- **Vite plugin:** `@samrum/vite-plugin-web-extension` — has labeled Firefox-MV3 support and is lighter-weight than migrating to WXT (the maintenance path the alternative plugin's author now steers new projects toward).
- **`web-ext run --target firefox-desktop`** — live-reload manual QA; this is how Phase 1 gets tested before any policy is installed.
- **`web-ext lint`** — run in CI.
- **`web-ext sign` / `web-ext build`** — AMO unlisted signing and final `.xpi` packaging (see Signing requirement above).
- **Vitest** — `extension/src/shared/*` (crypto, lock-state, recovery-code, storage) and `native-host/src/{protocol,policy}` (framing, policy-template generation). No automated e2e: policy/private-browsing/force-install behavior can only be verified against a real Firefox profile with `policies.json` in place and a restart.
- **Preact** — shared UI layer for the lock screen, options page, and setup wizard.

The interactive `web-ext run` QA and everything policy/native-host related can only be verified on a real Mac with Firefox — CI and container sessions cover vitest, typecheck, build, and `web-ext lint` only.

## Phased build order

Each phase is independently demoable before the next one starts. Current status: **Phases 1–4 code-complete with unit tests; Phase 3–4 macOS-side behavior still needs manual QA on a real Mac; Phase 5 not started.**

1. **Phase 1 — Core lock/unlock, no policy hardening.** Newtab-overridden lock screen, content-script overlay, PBKDF2 hash/verify, lock state in storage driven by `runtime.onStartup` plus a manual trigger from the toolbar popup's "Lock now" button (the toolbar icon opens a status popup — `action.default_popup` — so `action.onClicked` never fires; manual lock is a `lock-now` runtime message). No idle detection, no native host, no policies. Fully testable via `web-ext run` alone.
2. **Phase 2 — Options page + idle detection.** Password change flow, welcome-message editor (no password required to edit the message), configurable idle timeout, recovery-code generation, `nav-guard.ts` defense-in-depth redirects. Still zero OS-level dependencies.
3. **Phase 3 — Native messaging host + policies.json installer.** `install-policy` command, AMO unlisted signing, LaunchAgent for post-update policy re-install. This is the phase where removal-prevention, Private Browsing blocking, and `about:addons` blocking actually take effect — requires a full Firefox restart to verify.
4. **Phase 4 — Email recovery.** `send-recovery-email` command (Mail.app path first, SMTP fallback second), `host-config.json` handling, options-page and setup-wizard UI for triggering it.
5. **Phase 5 — Polish/packaging.** Optional Node SEA packaging for the native host, signed `.xpi` versioning/release process in `docs/SETUP.md`, CI (`lint` + `vitest`).

## Known risks/caveats

- **macOS wipes `distribution/policies.json` on every Firefox auto-update** (Firefox replaces the whole `.app` bundle; the folder isn't persistent). Mitigated by a LaunchAgent that waits for one natural post-update Firefox launch+quit cycle before re-copying — copying too early can trip Gatekeeper's code-signing validation. There is an inherent window after every Firefox update, before the LaunchAgent re-copies, where enforcement is off; this can be minimized but not fully eliminated.
- **`about:debugging` and `about:config` are explicitly out of scope for blocking.** A determined user could still disable the extension via the Remote Debugging Protocol or by flipping `xpinstall.*`/`extensions.*` prefs directly. Blocking these would need additional policies and is left as optional future hardening, not built now.
- **`policies.json` changes require a full Firefox restart to take effect** — for the initial install and for every re-install after an auto-update wipes it. Never script an automatic force-quit/relaunch of Firefox; this is always a deliberate, visible step for the user.
- **`Firefox.app` write permissions** are required to copy into `Contents/Resources/distribution/`; treat this as a possible permission-prompt/failure point in setup docs rather than assuming it's silent.
