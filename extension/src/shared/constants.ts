export const NATIVE_HOST_NAME = "com.privatefox.host";

export const DEFAULT_WELCOME_MESSAGE =
  "This browser is locked. Enter your password to continue.";

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 10;

/** Minimum idle detection interval supported by browser.idle (seconds). */
export const MIN_IDLE_DETECTION_SECONDS = 15;

/** PBKDF2 parameters. Bump PBKDF2_ITERATIONS only with a storage migration. */
export const PBKDF2_ITERATIONS = 210_000;
export const PBKDF2_HASH = "SHA-256";
export const SALT_BYTES = 16;
export const DERIVED_KEY_BITS = 256;

/** One-time email recovery codes expire after this many minutes. */
export const EMAIL_CODE_TTL_MINUTES = 15;

export const STORAGE_SCHEMA_VERSION = 1;
