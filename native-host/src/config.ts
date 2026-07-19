import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

/**
 * Host-side configuration, stored OUTSIDE the extension (the extension
 * never sees SMTP credentials). File mode 0600.
 */
export interface HostConfig {
  /** "apple-mail" (default; uses the user's Mail.app account) or "smtp". */
  mailTransport: "apple-mail" | "smtp";
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
}

export const APP_SUPPORT_DIR = join(
  homedir(),
  "Library",
  "Application Support",
  "Privatefox",
);

const CONFIG_PATH = join(APP_SUPPORT_DIR, "host-config.json");

export const DEFAULT_CONFIG: HostConfig = { mailTransport: "apple-mail" };

export function readConfig(): HostConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<HostConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: HostConfig): void {
  mkdirSync(APP_SUPPORT_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
  chmodSync(CONFIG_PATH, 0o600);
}
