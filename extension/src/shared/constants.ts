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
 * How long access to about:addons stays granted after entering the password.
 * Short by design: the grant is for one visit, not a persistent exemption.
 */
export const ADDONS_PASS_TTL_MINUTES = 5;

/**
 * Whether about:addons is blocked outright by the enterprise policy
 * (BlockAboutAddons). When true the page is unreachable and the extension's
 * password gate never runs; when false the gate is what protects it.
 */
export const DEFAULT_BLOCK_ABOUT_ADDONS = true;

/**
 * Pages the nav-guard keeps behind the password gate. about:addons is the
 * one that matters (it can disable the extension); the others are cheap
 * defense-in-depth. Content scripts cannot run on about: pages, so this is
 * enforced by watching tab URL updates.
 */
export const GATED_PAGES = [
  "about:addons",
  "about:debugging",
  "about:profiles",
] as const;

export const STORAGE_SCHEMA_VERSION = 1;
