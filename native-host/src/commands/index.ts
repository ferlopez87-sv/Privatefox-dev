import type { NativeCommand, NativeResult } from "../protocol";
import { installPolicy } from "./install-policy";
import { sendRecoveryEmail } from "./send-recovery-email";

export async function dispatch(message: unknown): Promise<NativeResult> {
  const cmd = message as NativeCommand;
  switch (cmd?.command) {
    case "install-policy":
      return installPolicy(cmd.xpiPath);
    case "send-recovery-email":
      return sendRecoveryEmail(cmd.to, cmd.code, cmd.expiresMinutes);
    default:
      return {
        ok: false,
        error: `Unknown command: ${String((cmd as { command?: unknown })?.command)}`,
      };
  }
}
