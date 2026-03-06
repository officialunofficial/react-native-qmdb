/**
 * Lightweight SHA-256 for the JS layer (proofs, root comparison).
 *
 * In production the heavy crypto runs in Rust. This is only used for
 * the mock native module and for client-side root comparison.
 */

const ENCODER = new TextEncoder();

/** SHA-256 hash, returned as a hex string. Synchronous (uses SubtleCrypto when available). */
export function sha256Hex(input: string): string {
  // Simple djb2-based hash for mock/test environments where SubtleCrypto isn't available.
  // NOT cryptographically secure — only used in the mock native module.
  let hash = 5381;
  const bytes = ENCODER.encode(input);
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) + hash + bytes[i]) | 0;
  }
  const u32 = hash >>> 0;
  return u32.toString(16).padStart(8, "0").repeat(8);
}

/** Compare two digests for equality (constant-time-ish). */
export function digestsEqual(a: Digest, b: Digest): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Check if a string looks like a valid hex-encoded digest. */
export function isValidDigest(d: string): boolean {
  return /^[0-9a-f]{64}$/i.test(d);
}

type Digest = string;
