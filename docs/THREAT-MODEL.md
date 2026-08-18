# Threat model

Privatefox is a **self-control tool**: the "attacker" is the tool's own
user in a moment of weakness, not a malicious third party. The goal is
meaningful friction, not cryptographic impossibility — the user owns the
machine and can always ultimately regain control (reinstall Firefox,
delete the app bundle, boot another browser).

## What is enforced, and by which layer

| Bypass attempt | Blocked by |
|---|---|
| Browsing while locked | Content-script overlay + new-tab override |
| Opening a private window | The extension's `windows.onCreated` handler closes it unless a settings pass is valid (requires the `ExtensionSettings.<id>.private_browsing` policy key + one restart, or Firefox never reports the window). The window is visibly created and then closed — the entry point is not removed. The harder `DisablePrivateBrowsing` policy is opt-in via `buildPolicies({disablePrivateBrowsing:true})` |
| Disabling/removing the extension in about:addons | `BlockAboutAddons` + `ExtensionSettings: force_installed` policies; with `BlockAboutAddons` off, the extension's password gate (nav-guard → `src/gate/`, 5-minute pass, revoked on lock) |
| Waiting out the lock | Lock re-asserts on startup and after idle timeout |
| Guessing the password | PBKDF2 (210k iterations, SHA-256, per-hash salt); only hashes stored |
| Reading credentials from the extension | SMTP/mail config lives only in the native host's 0600 file |
| Reading the settings in Options while away | Settings password gate; the usage-stats dashboard (browsing-history-adjacent data) is gated identically, via the shared `SettingsGate` |
| Opening a protected surface mid-panic | Panic mode: nav-guard redirects to `src/panic/` (no password field), and `grantSettingsPass` refuses even a correct password until `panicUntil` passes |

## Panic mode caveats

- **It is a time-box, not a hard wall.** Anything reachable without
  `about:addons`/`about:preferences` (e.g. `about:config`, remote
  debugging) is untouched, matching the accepted-bypasses posture below.
- **Private-window closing is conditional.** `windows.onCreated` can only
  see incognito windows once the extension has private-window access
  (`private_browsing` policy key + restart). Before that, a private window
  opened during panic is simply invisible to the extension — the UI states
  this rather than claiming a hard block.
- **The settings pass is revoked at activation** so a pass taken before
  panicking doesn't survive the trigger.
- **Locking does not end panic, and panic does not lock browsing** — they
  are orthogonal; the panic window runs on its wall-clock deadline
  regardless.

## Accepted bypasses (documented decisions, not oversights)

- **`about:config`**: prefs like `extensions.*` can be flipped. Blocking
  needs more policies; adds restriction surface for a self-imposed tool.
- **The about:addons password gate is not a hard boundary.** It runs on
  `tabs.onUpdated`, so it redirects *after* the page has begun loading, and
  it is bypassable through `about:config` or remote debugging. It is meant
  as friction for the tool's own user — `BlockAboutAddons` (policy) is the
  hard block, and the gate is the usability trade when that is turned off.
- **`about:debugging` / remote debugging protocol**: can unload the
  extension for the session.
- **Firefox update window**: macOS updates wipe
  `distribution/policies.json`; enforcement is off between the update and
  the LaunchAgent re-copy + next restart.
- **Deleting/reinstalling Firefox.app, other browsers, `sudo`**: out of
  scope by definition.

## Recovery-path security

- Recovery code: 25 chars from a 29-char alphabet (~121 bits), shown once,
  stored only as PBKDF2 hash, rotated on every use, and its use clears the
  password (no silent unlock).
- Email codes: 8 digits, single-use, 15-minute expiry, hash-only at rest,
  invalidated if the send fails; using one also clears the password.
- Neither path leaves the machine except the email the user asked for,
  sent through their own mail account.
