# Changelog

Versions of the Privatefox Lock extension. Every change that reaches the
user ships a new version (see the Versioning section in CLAUDE.md); the
number here matches `extension/package.json`, the built `.xpi`, and what
Firefox shows on the add-on card.

The native host versions independently — it installs separately and only
moves when the host itself changes.

## 1.7.0

### Added

- **Panic mode.** A "Panic" button in the toolbar popup (and an activation
  button in Options) blocks the protected surfaces — Firefox preferences,
  `about:addons`, and Privatefox options — for 10 minutes so that **no
  password can open them, not even the correct one**. The settings-password
  gate is replaced by a panic page with no password field at all, and any
  pass already granted is revoked at activation.
  - Triggers: popup "Panic mode" button, Options → Panic mode → "Activate
    panic mode now".
  - Private windows opened during the window are closed immediately. Honest
    limitation: this only works when the extension has private-window access
    granted (native host + `grantPrivateBrowsingAccess` + Firefox restart);
    without it, private windows are outside what a WebExtension can see, and
    the panic screen says so rather than claiming a hard block.
  - Ends on a wall-clock deadline (10 minutes), like the settings-pass TTL —
    no timer, and the UI re-renders when it passes.
  - Defense-in-depth: `grantSettingsPass` itself refuses a correct password
    during panic, so bypassing the UI redirect via direct runtime messages
    doesn't work either.
- Version bump from 1.6.0 → 1.7.0 (new user-visible capability).

## 1.6.0

### Added

- **Local usage statistics dashboard.** A new dashboard page tracks browser
  opens, unlocks, and time spent per domain while unlocked — entirely local,
  never sent anywhere. Accessed from the popup toolbar card and from Options.
  - Opens, unlocks, and per-domain dwell time recorded in per-day buckets.
  - 30-day retention, auto-pruned. Lifetime open/unlock counters never
    pruned.
  - Domain-only granularity (no path/query/URL), with `www.` stripped.
  - Private-window tracking supported behind the native host's
    `grantPrivateBrowsingAccess` policy toggle.
  - Dashboard is gated by the same settings-password mechanism as Options.
- **SettingsGate extracted to a shared component** (`src/ui/settings-gate.tsx`)
  so both Options and the new Dashboard can reuse it.
- **Apply policy now** button in Options → Protection that tells the native
  host to rewrite `policies.json` from the current preferences immediately
  (fixes the long-standing gap where `blockPrivateBrowsing`,
  `blockAboutAddons`, and `grantPrivateBrowsingAccess` toggles had no
  active call site connecting them to the native host).
- **`grantPrivateBrowsingAccess`** preference and policy option: grants the
  extension private-window access via the enterprise policy key
  `ExtensionSettings.<id>.private_browsing` so dwell-time statistics also
  cover private windows.

### Changed

- `recordOpen()` is now called on every `runtime.onStartup` alongside
  `lock()`.
- `recordUnlockStat()` is called on every successful unlock (password,
  recovery code, email code).
- Version bump from 1.5.0 → 1.6.0 (new user-visible capability).

## 1.5.0

### Fixed

- **No way to reset a forgotten settings password.** Once a settings
  password was set, the browser password stopped working on that prompt (by
  design), but there was no "forgot password" path there at all — the only
  way back in was the full-account recovery flow on the lock screen, which
  also wipes the browser password. Options → Password required now has a
  **Forgot settings password?** link that accepts the recovery code and
  clears only the settings password, leaving the browser password and lock
  state untouched. Like every other use of the recovery code, it rotates —
  the new one is shown once.

### Added

- **Configurable redirect after the settings-password gate.** Options →
  Protection has a new "After entering the settings password, go to" field.
  Set, it sends you there instead of the page you actually requested
  (`about:addons`, `about:preferences`, ...) after a correct password; left
  blank, behavior is unchanged. Applies to every password-gated page.

## 1.4.1

### Fixed

- **`about:addons` still was not gated.** The `tabs` permission added in
  1.4.0 was necessary but not sufficient: the listener only read
  `changeInfo.url`, which reports a URL *change*. Both the Add-ons menu item
  and Cmd+Shift+A open a **new tab already pointing at** `about:addons`, so
  no change is ever reported and the guard saw nothing. It now also reads
  the tab object's own URL and listens on `tabs.onCreated`. Covered by tests
  that reproduce all three routes to the page.

## 1.4.0

### Fixed

- **`about:addons` was not gated at all in 1.3.0.** `tabs.onUpdated` only
  reports `changeInfo.url` when the extension holds the `tabs` permission or
  a host permission matching the URL — and `<all_urls>` does not match
  `about:` URLs (nothing can). The guard received no URL, returned early,
  and the gate silently did nothing. The `tabs` permission is now requested,
  with a regression test asserting it.

### Added

- **A separate settings password.** The browser password now only unlocks
  browsing. Firefox preferences, `about:addons` and this extension's options
  are guarded by a second password, on the reasoning that the browsing
  password is typed constantly and stops being a real decision, while these
  surfaces are where the protections themselves get turned off.
  - Set or change it in Options → Settings password. Claiming it the first
    time requires the browser password; changing it afterwards requires the
    current settings password.
  - Until one is set, the browser password is accepted as a fallback —
    otherwise there would be no way into the options page to configure it.
  - One 5-minute pass covers all protected surfaces and is revoked on lock.
  - Forgetting it is recoverable: the recovery code and emailed codes now
    clear **both** passwords and force a reset.
- `about:preferences` is now gated alongside `about:addons`.

## 1.3.0

### Fixed

- **Locking now actually shows the lock screen.** Flipping the lock only
  drew the overlay on ordinary web pages, because the content script cannot
  run on extension pages, `about:` pages, or the window Firefox opens at
  startup. The lock was in effect with nothing on screen. Any focused tab
  that cannot host the overlay is now navigated to the lock page.
  - This is why **Lock the browser now** in preferences looked broken: it
    locked correctly, but the preferences tab it was clicked from could not
    display anything.
  - This is also why **no lock screen appeared at Firefox startup**:
    `about:home` is not the new-tab override, so nothing was shown.
- Locking while already locked now re-asserts the lock screen instead of
  short-circuiting.

### Added

- **The preferences page requires the password.** Preferences are where the
  protections are configured, so opening them now asks for the password and
  grants a 5-minute pass, revoked as soon as the browser locks. A **Close
  preferences** button ends the pass immediately.

## 1.2.0

- Gate `about:addons` behind the password. Navigating there (and to
  `about:debugging` / `about:profiles`) now opens a password prompt instead
  of silently bouncing away; a correct password grants a 5-minute pass that
  is revoked on every lock.
- New **Block about:addons entirely** preference (Options → Protection,
  default on). On, the enterprise policy blocks the page outright; off, the
  password gate protects it. `BlockAboutAddons` in `policies.json` follows
  this preference.

## 1.1.0

- Toolbar icon opens a status card instead of locking instantly: shows lock
  state, auto-lock timeout, private-browsing setting and recovery status,
  with **Lock now** and **Preferences** buttons. Manual locking moved to that
  button (a popup suppresses `action.onClicked`).
- New **Block private / incognito windows** preference (Options →
  Protection, default on), which `DisablePrivateBrowsing` in `policies.json`
  now follows.

## 1.0.0

Initial implementation, Phases 1–4:

- Password lock on startup, after an idle timeout, and on demand, with the
  lock screen on the new-tab override and a content-script overlay on
  already-open tabs.
- PBKDF2 (210k iterations, per-hash salt) for the password and recovery
  code; only hashes are stored.
- Recovery via one-time rotating recovery code or an emailed one-time code,
  both of which clear the password and force a reset.
- Options page (welcome message, idle timeout, recovery email, password
  change) and first-run setup wizard.
- Native messaging host: `install-policy` (writes `policies.json` into the
  Firefox app bundle, plus a LaunchAgent that re-installs it after Firefox
  auto-updates) and `send-recovery-email` (Mail.app via AppleScript, SMTP
  fallback).
