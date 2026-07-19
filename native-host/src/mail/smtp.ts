import type { HostConfig } from "../config";

/**
 * SMTP fallback for users without a configured Mail.app account.
 * Credentials come from host-config.json (0600) — never from the extension.
 * nodemailer is imported lazily so the apple-mail path never loads it.
 */
export async function sendViaSmtp(
  config: NonNullable<HostConfig["smtp"]>,
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
  await transport.sendMail({ from: config.from, to, subject, text: body });
}
