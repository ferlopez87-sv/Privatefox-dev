import type { HashedSecret } from "./crypto";
import {
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
  passwordHash: HashedSecret | null;
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
  passwordHash: null,
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
