import { describe, expect, it } from "vitest";
import {
  MessageDecoder,
  encodeMessage,
  MAX_OUTGOING_BYTES,
} from "../src/protocol";

describe("native messaging framing", () => {
  it("round-trips a message", () => {
    const decoder = new MessageDecoder();
    const messages = decoder.push(encodeMessage({ ok: true, detail: "hí ✓" }));
    expect(messages).toEqual([{ ok: true, detail: "hí ✓" }]);
  });

  it("handles a message split across arbitrary chunk boundaries", () => {
    const decoder = new MessageDecoder();
    const encoded = encodeMessage({ command: "install-policy" });
    for (let i = 0; i < encoded.length - 1; i++) {
      expect(decoder.push(encoded.subarray(i, i + 1))).toEqual([]);
    }
    expect(decoder.push(encoded.subarray(encoded.length - 1))).toEqual([
      { command: "install-policy" },
    ]);
  });

  it("handles multiple messages in one chunk", () => {
    const decoder = new MessageDecoder();
    const chunk = Buffer.concat([
      encodeMessage({ n: 1 }),
      encodeMessage({ n: 2 }),
      encodeMessage({ n: 3 }),
    ]);
    expect(decoder.push(chunk)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it("uses little-endian length prefixes", () => {
    const encoded = encodeMessage({});
    expect(encoded.readUInt32LE(0)).toBe(2); // "{}"
    expect(encoded.subarray(4).toString()).toBe("{}");
  });

  it("refuses oversized outgoing messages", () => {
    const big = "x".repeat(MAX_OUTGOING_BYTES + 1);
    expect(() => encodeMessage({ big })).toThrow(/too large/i);
  });
});
