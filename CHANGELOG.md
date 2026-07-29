# Changelog

Versions of the Privatefox Lock extension. Every change that reaches the
user ships a new version (see the Versioning section in CLAUDE.md); the
number here matches `extension/package.json`, the built `.xpi`, and what
Firefox shows on the add-on card.

The native host versions independently — it installs separately and only
moves when the host itself changes.

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
