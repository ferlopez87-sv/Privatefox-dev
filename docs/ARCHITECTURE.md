# Architecture

Two packages, one enforcement contract: the **extension** implements the
lock experience; the **native host + enterprise policies** make it stick.
CLAUDE.md carries the condensed version of this document plus the
development workflow; this file is the narrative reference.

## Data flow

```
                        browser.storage.local
                        { privatefoxState }  ←──────────────┐
                              ↑ single source of truth      │
   ┌──────────────────────────┼──────────────────────────┐  │
   │ background event page    │                          │  │ storage.onChanged
   │  router.ts ── verifies passwords (PBKDF2),          │  │
   │  lock-state.ts ─ flips locked true/false ───────────┼──┘
   │  idle-monitor.ts ─ browser.idle → lock()            │
   │  nav-guard.ts ─ steers off about:addons (backup)    │
   │  native-bridge.ts ─ sendNativeMessage ──────────────┼──→ privatefox-host
   └─────────────────────────────────────────────────────┘     (stdio JSON)
        ↑ runtime.sendMessage (unlock attempts, setup)            │
   content overlay / newtab / options / setup pages               ├─ install-policy
        └─ react to storage.onChanged directly                    └─ send-recovery-email
```

Key invariants:

- **State lives in storage, not memory.** The background page is a
  non-persistent event page; it re-derives everything on each wake.
- **Password verification happens only in the background router.** UI
  surfaces send `unlock-attempt` etc. and render the response; they never
  read or compare hashes themselves.
- **UI surfaces react to `storage.onChanged`**, not push messages. A page
  loading at `document_start` reads state and self-asserts the overlay, so
  navigation needs no webNavigation bookkeeping.
- **The extension never holds mail credentials.** It asks the host to send;
  the host reads its own 0600 config.
- **Recovery always clears the password** (recovery code and email code
  paths both), forcing a deliberate reset instead of a silent unlock.

## Why each lock trigger works the way it does

- **Startup lock**: `runtime.onStartup` → `lock()`. New-tab override plus
  the content overlay cover both the empty window and restored tabs.
- **Idle lock**: `idle.setDetectionInterval(minutes*60)` re-applied on
  every background wake and on options change (the interval is process
  state Firefox does not persist).
- **Manual lock**: the toolbar icon opens a status popup (`action.default_popup`,
  so `action.onClicked` never fires); its "Lock now" button and the buttons in
  newtab/options all send `lock-now`.
- **Lock before setup is a no-op** — otherwise a fresh install with no
  password would soft-brick the browser.

## Making the lock visible (surface-lock.ts)

Persisting `locked: true` is only half the job. The content script draws the
overlay on http/https/file pages, but it cannot run on extension pages, on
`about:` pages, or on the window Firefox opens at startup (`about:home` is
not the newtab override). On those the lock would be in force with nothing
on screen — the failure that made the preferences "Lock now" button look
dead and left startup showing no lock screen.

So `lock()` ends by calling `surfaceLockScreen()`, which navigates every
*focused* tab that cannot host the overlay to the extension's lock page.
Background tabs are left alone (the user never sees them, and their content
script asserts the overlay when they are next loaded), and a tab already
showing the lock page is not re-navigated. It runs unconditionally, not just
on a false→true transition, so a lock while already locked re-asserts a
visible lock screen.

## The about:addons password gate

Content scripts cannot run on `about:` pages, so `nav-guard.ts` watches
`tabs.onUpdated` and redirects the pages in `GATED_PAGES` (`about:addons`,
`about:debugging`, `about:profiles`) to `src/gate/`. Entering the password
there calls `grantAddonsPass`, which stores `addonsPassUntil = now + 5 min`;
the guard then lets the navigation through until it expires. Properties:

- **Short-lived by design** — the pass authorizes a visit, not a standing
  exemption, and `lock()` clears it unconditionally.
- **Target is validated** — the `?target=` query param is untrusted, so the
  gate only forwards to a URL that is actually in `GATED_PAGES`.
- **Layer ordering** — with `BlockAboutAddons` on, Firefox blocks the page
  before this listener runs and the gate is dead code; with it off, the gate
  is the protection. Before Phase 3, the gate is the *only* protection.
- **Not a hard boundary** — `about:config` and the remote debugging protocol
  still bypass it (see THREAT-MODEL.md).

## Enforcement layer (outside the extension)

`native-host/src/policy/policies-template.ts` generates:

```json
{ "policies": {
    "ExtensionSettings": { "lock@privatefox.local": {
        "installation_mode": "force_installed",
        "install_url": "file://…/privatefox-lock.xpi",
        "updates_disabled": true } },
    "DisablePrivateBrowsing": true,
    "BlockAboutAddons": true } }
```

written to `Firefox.app/Contents/Resources/distribution/policies.json`.
`DisablePrivateBrowsing` and `BlockAboutAddons` are both conditional: the
extension's `blockPrivateBrowsing` / `blockAboutAddons` preferences (Options →
Protection) ride along on the `install-policy` native command, and
`buildPolicies` omits each key when it is off. The force-install is always
present. Turning `blockAboutAddons` off trades the hard block for the
extension's password gate (below). Effective only after full restart;
wiped by every Firefox update (the `com.privatefox.policyguard` LaunchAgent
re-installs it, with a grace delay so Gatekeeper's post-update validation
isn't disturbed).

The `.xpi` must be AMO-signed (unlisted channel) — Release Firefox
enforces signatures even for force-installed extensions.

## Native messaging protocol

Standard Firefox framing: 4-byte little-endian length + UTF-8 JSON, capped
at 1 MiB host→browser. `extension/src/shared/protocol.ts` and
`native-host/src/protocol.ts` carry mirrored TypeScript shapes
(`NativeCommand` / `NativeResult`) — change them together.
