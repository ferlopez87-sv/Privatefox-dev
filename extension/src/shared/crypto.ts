import {
  DERIVED_KEY_BITS,
  PBKDF2_HASH,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
} from "./constants";

export interface HashedSecret {
  saltB64: string;
  hashB64: string;
  iterations: number;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveBits(
  secret: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    DERIVED_KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Hash a secret (password or recovery code) with a fresh random salt. */
export async function hashSecret(secret: string): Promise<HashedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(secret, salt, PBKDF2_ITERATIONS);
  return {
    saltB64: toBase64(salt),
    hashB64: toBase64(hash),
    iterations: PBKDF2_ITERATIONS,
  };
}

/** Constant-time comparison of two equal-length byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Verify a candidate secret against a stored hash. */
export async function verifySecret(
  candidate: string,
  stored: HashedSecret,
): Promise<boolean> {
  const salt = fromBase64(stored.saltB64);
  const expected = fromBase64(stored.hashB64);
  const actual = await deriveBits(candidate, salt, stored.iterations);
  return timingSafeEqual(actual, expected);
}
