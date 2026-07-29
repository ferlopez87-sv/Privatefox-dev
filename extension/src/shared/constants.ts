export const NATIVE_HOST_NAME = "com.privatefox.host";

export const DEFAULT_WELCOME_MESSAGE =
  "This browser is locked. Enter your password to continue.";

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 10;

/**
 * Whether private/incognito windows should be blocked. A WebExtension cannot
 * enforce this itself — it is applied by the policies.json layer (native host,
 * Phase 3). This is only the stored user intent the policy is built from.
 */
export const DEFAULT_BLOCK_PRIVATE_BROWSING = true;

/** Minimum idle detection interval supported by browser.idle (seconds). */
export const MIN_IDLE_DETECTION_SECONDS = 15;

/** PBKDF2 parameters. Bump PBKDF2_ITERATIONS only with a storage migration. */
export const PBKDF2_ITERATIONS = 210_000;
export const PBKDF2_HASH = "SHA-256";
export const SALT_BYTES = 16;
export const DERIVED_KEY_BITS = 256;

/** One-time email recovery codes expire after this many minutes. */
export const EMAIL_CODE_TTL_MINUTES = 15;

/**
 * How long protected surfaces stay open after entering the settings
 * password. One pass covers all of them (Firefox preferences, about:addons,
 * and this extension's options) — it authorizes a visit, not a standing
 * grant, and is revoked on every lock.
 */
export const SETTINGS_PASS_TTL_MINUTES = 5;

/** The extension page used as the lock screen surface. */
export const LOCK_PAGE_PATH = "src/newtab/index.html";

/**
 * Whether about:addons is blocked outright by the enterprise policy
 * (BlockAboutAddons). When true the page is unreachable and the extension's
 * password gate never runs; when false the gate is what protects it.
 */
export const DEFAULT_BLOCK_ABOUT_ADDONS = true;

/**
 * Pages the nav-guard keeps behind the settings password. about:addons is
 * the one that matters (it can disable the extension) and about:preferences
 * is where Firefox itself is configured; the others are cheap
 * defense-in-depth. Content scripts cannot run on about: pages, so this is
 * enforced by watching tab URL updates.
 */
export const GATED_PAGES = [
  "about:addons",
  "about:preferences",
  "about:debugging",
  "about:profiles",
] as const;

export const STORAGE_SCHEMA_VERSION = 1;

/**
 * Force-grant this extension access to private/incognito windows via the
 * ExtensionSettings.private_browsing enterprise policy, so usage stats also
 * cover private windows without the user manually toggling "Run in Private
 * Windows" in about:addons. Only meaningful when blockPrivateBrowsing is
 * off — if private windows are blocked entirely there is nothing to grant
 * access to. Enforced only once the native host has (re)written
 * policies.json and Firefox has restarted, same caveat as the other two
 * enterprise-policy-backed toggles.
 */
export const DEFAULT_GRANT_PRIVATE_BROWSING_ACCESS = true;
