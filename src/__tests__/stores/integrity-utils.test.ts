import { describe, expect, it } from "vitest";
import { ensureHistoryArray, extractErrorMessage, lastScanAt } from "@/stores/knowledge/integrity-utils";

describe("integrity-utils", () => {
  describe("extractErrorMessage", () => {
    it("extracts message from Error instance", () => {
      expect(extractErrorMessage(new Error("boom"))).toBe("boom");
    });

    it("converts string to string", () => {
      expect(extractErrorMessage("plain string")).toBe("plain string");
    });

    it("converts number to string", () => {
      expect(extractErrorMessage(42)).toBe("42");
    });

    it("converts null to string", () => {
      expect(extractErrorMessage(null)).toBe("null");
    });

    it("converts undefined to string", () => {
      expect(extractErrorMessage(undefined)).toBe("undefined");
    });
  });

  describe("lastScanAt", () => {
    it("returns scannedAt of the first entry", () => {
      const history = [
        { id: 2, scannedAt: "2026-03-14T10:00:00Z", total: 5, healthy: 5, missing: 0, moved: 0, notes: null },
        { id: 1, scannedAt: "2026-03-13T10:00:00Z", total: 5, healthy: 4, missing: 1, moved: 0, notes: null },
      ];
      expect(lastScanAt(history)).toBe("2026-03-14T10:00:00Z");
    });

    it("returns null for empty array", () => {
      expect(lastScanAt([])).toBeNull();
    });
  });

  describe("ensureHistoryArray", () => {
    it("passes through a valid array", () => {
      const arr = [{ id: 1, scannedAt: "t", total: 1, healthy: 1, missing: 0, moved: 0, notes: null }];
      expect(ensureHistoryArray(arr)).toBe(arr);
    });

    it("returns empty array for null", () => {
      expect(ensureHistoryArray(null)).toEqual([]);
    });

    it("returns empty array for undefined", () => {
      expect(ensureHistoryArray(undefined)).toEqual([]);
    });

    it("returns empty array for non-array object", () => {
      expect(ensureHistoryArray({ foo: 1 })).toEqual([]);
    });
  });
});
