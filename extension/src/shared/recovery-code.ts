/**
 * Recovery codes: long, human-transcribable, generated once at setup and
 * shown a single time. Only the hash is stored.
 */

// Crockford-style alphabet without ambiguous characters (0/O, 1/I/L, U/V).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
const GROUPS = 5;
const GROUP_LENGTH = 5;

/** e.g. "7XK2M-Q9RTD-3FGHB-WNP58-EAC64" */
export function generateRecoveryCode(): string {
  const chars = crypto.getRandomValues(
    new Uint8Array(GROUPS * GROUP_LENGTH),
  );
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = "";
    for (let i = 0; i < GROUP_LENGTH; i++) {
      const byte = chars[g * GROUP_LENGTH + i] ?? 0;
      group += ALPHABET[byte % ALPHABET.length];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** Short numeric code for the email recovery flow (one-time, short TTL). */
export function generateEmailCode(): string {
  const digits = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(digits, (d) => String(d % 10)).join("");
}

/** Normalize user input: uppercase, strip whitespace/hyphens for comparison tolerance. */
export function normalizeRecoveryCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "");
  const groups: string[] = [];
  for (let i = 0; i < cleaned.length; i += GROUP_LENGTH) {
    groups.push(cleaned.slice(i, i + GROUP_LENGTH));
  }
  return groups.join("-");
}
