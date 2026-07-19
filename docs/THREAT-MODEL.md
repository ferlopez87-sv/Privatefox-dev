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
| Opening a private window | `DisablePrivateBrowsing` policy |
| Disabling/removing the extension in about:addons | `BlockAboutAddons` + `ExtensionSettings: force_installed` policies |
| Waiting out the lock | Lock re-asserts on startup and after idle timeout |
| Guessing the password | PBKDF2 (210k iterations, SHA-256, per-hash salt); only hashes stored |
| Reading credentials from the extension | SMTP/mail config lives only in the native host's 0600 file |

## Accepted bypasses (documented decisions, not oversights)

- **`about:config`**: prefs like `extensions.*` can be flipped. Blocking
  needs more policies; adds restriction surface for a self-imposed tool.
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
