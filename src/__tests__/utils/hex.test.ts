import { describe, expect, it } from "vitest";
import { fromHex, hexToString, stringToHex, toHex } from "../../utils/hex";

describe("hex utilities", () => {
  describe("toHex", () => {
    it("encodes empty bytes", () => {
      expect(toHex(new Uint8Array([]))).toBe("");
    });

    it("encodes single byte", () => {
      expect(toHex(new Uint8Array([0xff]))).toBe("ff");
    });

    it("encodes multiple bytes", () => {
      expect(toHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe("deadbeef");
    });

    it("pads single-digit hex values with zero", () => {
      expect(toHex(new Uint8Array([0x00, 0x01, 0x0a]))).toBe("00010a");
    });
  });

  describe("fromHex", () => {
    it("decodes empty string", () => {
      expect(fromHex("")).toEqual(new Uint8Array([]));
    });

    it("decodes hex string", () => {
      expect(fromHex("deadbeef")).toEqual(
        new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      );
    });

    it("handles uppercase hex", () => {
      expect(fromHex("DEADBEEF")).toEqual(
        new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      );
    });

    it("throws on odd-length string", () => {
      expect(() => fromHex("abc")).toThrow("odd length");
    });

    it("throws on invalid hex characters", () => {
      expect(() => fromHex("zz")).toThrow("Invalid hex character");
    });
  });

  describe("roundtrip", () => {
    it("toHex → fromHex preserves bytes", () => {
      const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
      expect(fromHex(toHex(original))).toEqual(original);
    });

    it("fromHex → toHex preserves string (lowercase)", () => {
      expect(toHex(fromHex("cafebabe"))).toBe("cafebabe");
    });
  });

  describe("string helpers", () => {
    it("stringToHex encodes UTF-8", () => {
      expect(stringToHex("hello")).toBe("68656c6c6f");
    });

    it("hexToString decodes UTF-8", () => {
      expect(hexToString("68656c6c6f")).toBe("hello");
    });

    it("roundtrips arbitrary strings", () => {
      const str = "QMDB rocks 🔐";
      expect(hexToString(stringToHex(str))).toBe(str);
    });
  });
});
