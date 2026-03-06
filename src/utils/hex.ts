/**
 * Hex encoding/decoding utilities for keys and values.
 */

const HEX_CHARS = "0123456789abcdef";
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** Encode a Uint8Array to a hex string. */
export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_CHARS[bytes[i] >> 4];
    hex += HEX_CHARS[bytes[i] & 0x0f];
  }
  return hex;
}

/** Decode a hex string to a Uint8Array. Throws on invalid input. */
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`Invalid hex string: odd length (${hex.length})`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const hi = parseInt(hex[i], 16);
    const lo = parseInt(hex[i + 1], 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) {
      throw new Error(`Invalid hex character at position ${i}`);
    }
    bytes[i / 2] = (hi << 4) | lo;
  }
  return bytes;
}

/** Encode a UTF-8 string as hex. */
export function stringToHex(str: string): string {
  return toHex(TEXT_ENCODER.encode(str));
}

/** Decode a hex string to a UTF-8 string. */
export function hexToString(hex: string): string {
  return TEXT_DECODER.decode(fromHex(hex));
}
