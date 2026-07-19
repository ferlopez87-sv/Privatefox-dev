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
- **Manual lock**: toolbar action button and buttons in newtab/options all
  send `lock-now`.
- **Lock before setup is a no-op** — otherwise a fresh install with no
  password would soft-brick the browser.

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
Effective only after full restart; wiped by every Firefox update (the
`com.privatefox.policyguard` LaunchAgent re-installs it, with a grace
delay so Gatekeeper's post-update validation isn't disturbed).

The `.xpi` must be AMO-signed (unlisted channel) — Release Firefox
enforces signatures even for force-installed extensions.

## Native messaging protocol

Standard Firefox framing: 4-byte little-endian length + UTF-8 JSON, capped
at 1 MiB host→browser. `extension/src/shared/protocol.ts` and
`native-host/src/protocol.ts` carry mirrored TypeScript shapes
(`NativeCommand` / `NativeResult`) — change them together.
