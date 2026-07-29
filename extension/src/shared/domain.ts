/**
 * Extracts a privacy-safe, domain-only label from a URL for usage stats.
 * Never returns path/query/hash/full URL — only a hostname (with a leading
 * "www." stripped), or null for anything that should not be recorded at all
 * (extension pages, about:, file:, unparsable input).
 */

const UNTRACKABLE_SCHEMES = [
  "about:",
  "moz-extension:",
  "file:",
  "chrome:",
  "data:",
  "javascript:",
];

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

export function extractTrackableDomain(url: string): string | null {
  try {
    if (UNTRACKABLE_SCHEMES.some((scheme) => url.startsWith(scheme))) {
      return null;
    }
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    // IPs/localhost have no meaningful subdomain to strip, and the port is
    // what distinguishes separate local services running on the same host.
    const isIpOrLocalhost =
      IPV4.test(parsed.hostname) || parsed.hostname === "localhost";
    const host = parsed.hostname.replace(/^www\./, "");
    return isIpOrLocalhost && parsed.port ? `${host}:${parsed.port}` : host;
  } catch {
    return null;
  }
}
