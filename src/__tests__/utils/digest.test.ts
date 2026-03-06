import { describe, expect, it } from "vitest";
import { digestsEqual, isValidDigest, sha256Hex } from "../../utils/digest";

describe("digest utilities", () => {
  describe("sha256Hex", () => {
    it("produces a 64-char hex string", () => {
      const hash = sha256Hex("hello");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("is deterministic", () => {
      expect(sha256Hex("test")).toBe(sha256Hex("test"));
    });

    it("produces different hashes for different inputs", () => {
      expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
    });

    it("handles empty string", () => {
      const hash = sha256Hex("");
      expect(hash).toHaveLength(64);
    });
  });

  describe("digestsEqual", () => {
    it("returns true for identical digests", () => {
      const d = sha256Hex("test");
      expect(digestsEqual(d, d)).toBe(true);
    });

    it("returns false for different digests", () => {
      expect(digestsEqual(sha256Hex("a"), sha256Hex("b"))).toBe(false);
    });

    it("returns false for different lengths", () => {
      expect(digestsEqual("abc", "abcd")).toBe(false);
    });
  });

  describe("isValidDigest", () => {
    it("accepts valid 64-char hex", () => {
      expect(isValidDigest("a".repeat(64))).toBe(true);
    });

    it("accepts mixed case hex", () => {
      expect(isValidDigest("aAbBcCdDeEfF0011223344556677889900112233".padEnd(64, "0"))).toBe(true);
    });

    it("rejects too short", () => {
      expect(isValidDigest("abc")).toBe(false);
    });

    it("rejects non-hex characters", () => {
      expect(isValidDigest("g".repeat(64))).toBe(false);
    });

    it("rejects too long", () => {
      expect(isValidDigest("a".repeat(65))).toBe(false);
    });
  });
});
