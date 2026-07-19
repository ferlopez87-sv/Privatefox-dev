import type { NativeResult } from "../protocol";
import { readConfig } from "../config";
import { sendViaAppleMail } from "../mail/apple-mail";
import { sendViaSmtp } from "../mail/smtp";

export async function sendRecoveryEmail(
  to: string,
  code: string,
  expiresMinutes: number,
): Promise<NativeResult> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: `Invalid recovery address: ${to}` };
  }
  const subject = "Privatefox unlock code";
  const body =
    `Your one-time Privatefox unlock code is:\n\n    ${code}\n\n` +
    `It expires in ${expiresMinutes} minutes and can be used once. ` +
    `Using it unlocks Firefox and clears the current password, so you ` +
    `will be asked to set a new one.\n\n` +
    `If you did not request this, you can ignore this email.`;

  const config = readConfig();
  try {
    if (config.mailTransport === "smtp") {
      if (!config.smtp) {
        return {
          ok: false,
          error: "SMTP transport selected but no SMTP settings configured.",
        };
      }
      await sendViaSmtp(config.smtp, to, subject, body);
    } else {
      await sendViaAppleMail(to, subject, body);
    }
    return { ok: true, detail: `Sent to ${to}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
