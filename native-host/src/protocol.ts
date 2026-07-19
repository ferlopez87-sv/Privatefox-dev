/**
 * Firefox native messaging wire protocol: each message is a 32-bit
 * little-endian byte length followed by that many bytes of UTF-8 JSON.
 * Shapes mirror extension/src/shared/protocol.ts (NativeCommand/NativeResult).
 */

export type NativeCommand =
  | { command: "install-policy"; xpiPath?: string }
  | {
      command: "send-recovery-email";
      to: string;
      code: string;
      expiresMinutes: number;
    };

export interface NativeResult {
  ok: boolean;
  error?: string;
  detail?: string;
}

/** Native messaging caps messages from host to browser at 1 MiB. */
export const MAX_OUTGOING_BYTES = 1024 * 1024;

export function encodeMessage(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  if (payload.length > MAX_OUTGOING_BYTES) {
    throw new Error(`Message too large: ${payload.length} bytes`);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/**
 * Incremental decoder: feed arbitrary chunks, get complete messages out.
 * Handles messages split across chunks and multiple messages per chunk.
 */
export class MessageDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];
    for (;;) {
      if (this.buffer.length < 4) break;
      const length = this.buffer.readUInt32LE(0);
      if (this.buffer.length < 4 + length) break;
      const payload = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      messages.push(JSON.parse(payload.toString("utf8")));
    }
    return messages;
  }
}
