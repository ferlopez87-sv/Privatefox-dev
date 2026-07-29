import type { HashedSecret } from "./crypto";
import {
  DEFAULT_BLOCK_ABOUT_ADDONS,
  DEFAULT_BLOCK_PRIVATE_BROWSING,
  DEFAULT_GRANT_PRIVATE_BROWSING_ACCESS,
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  DEFAULT_WELCOME_MESSAGE,
  STORAGE_SCHEMA_VERSION,
} from "./constants";

/**
 * Single source of truth for extension state, persisted in
 * browser.storage.local. The background event page is non-persistent, so
 * nothing here may live only in memory.
 */
export interface PrivatefoxState {
  schemaVersion: number;
  /** False until the setup wizard has stored a password + recovery code. */
  setupComplete: boolean;
  locked: boolean;
  welcomeMessage: string;
  idleTimeoutMinutes: number;
  /**
   * User intent to block private/incognito windows. Enforced only by the
   * policies.json layer (native host); the extension alone cannot block it.
   */
  blockPrivateBrowsing: boolean;
  /**
   * Block about:addons outright via the BlockAboutAddons policy. When false,
   * the page stays reachable but the extension's password gate guards it.
   */
  blockAboutAddons: boolean;
  /**
   * Force-grant this extension private-window access via the enterprise
   * policy so usage stats also cover private windows. Only relevant if
   * blockPrivateBrowsing is off. Enforced only once the native host has
   * (re)written policies.json and Firefox has restarted.
   */
  grantPrivateBrowsingAccess: boolean;
  /**
   * Expiry (ms since epoch) of the pass granted by the settings password.
   * One pass covers every protected surface (Firefox preferences,
   * about:addons, this extension's options). Null when no pass is active,
   * and cleared on every lock.
   */
  settingsPassUntil: number | null;
  /** Unlocks the browser. Typed often, so it lives in muscle memory. */
  passwordHash: HashedSecret | null;
  /**
   * Second, separate password for the protected surfaces (Firefox
   * preferences, about:addons, this extension's options). Deliberately not
   * the browsing password: those surfaces are where the protections
   * themselves can be turned off, so they should take a secret you have to
   * go and fetch rather than one you type all day.
   *
   * Null means "not configured yet" and the browsing password is accepted
   * as a fallback — otherwise there would be no way into the options page
   * to set this password in the first place.
   */
  settingsPasswordHash: HashedSecret | null;
  recoveryHash: HashedSecret | null;
  /** Address the native host sends recovery emails to (empty = not configured). */
  recoveryEmail: string;
  /** Active one-time email code, hashed, with expiry (ms since epoch). */
  emailCode: { hash: HashedSecret; expiresAt: number } | null;
}

export const DEFAULT_STATE: PrivatefoxState = {
  schemaVersion: STORAGE_SCHEMA_VERSION,
  setupComplete: false,
  locked: false,
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
  idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES,
  blockPrivateBrowsing: DEFAULT_BLOCK_PRIVATE_BROWSING,
  blockAboutAddons: DEFAULT_BLOCK_ABOUT_ADDONS,
  grantPrivateBrowsingAccess: DEFAULT_GRANT_PRIVATE_BROWSING_ACCESS,
  settingsPassUntil: null,
  passwordHash: null,
  settingsPasswordHash: null,
  recoveryHash: null,
  recoveryEmail: "",
  emailCode: null,
};

const STATE_KEY = "privatefoxState";

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function area(): StorageArea {
  return browser.storage.local as unknown as StorageArea;
}

export async function getState(): Promise<PrivatefoxState> {
  const result = await area().get(STATE_KEY);
  const stored = result[STATE_KEY] as Partial<PrivatefoxState> | undefined;
  // Merge over defaults so newly added fields get sane values without an
  // explicit migration for every schema addition.
  return { ...DEFAULT_STATE, ...stored, schemaVersion: STORAGE_SCHEMA_VERSION };
}

export async function setState(
  patch: Partial<PrivatefoxState>,
): Promise<PrivatefoxState> {
  const current = await getState();
  const next = { ...current, ...patch };
  await area().set({ [STATE_KEY]: next });
  return next;
}

export { STATE_KEY };
