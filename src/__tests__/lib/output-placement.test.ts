import { resolveOutputPlacement } from "@/lib/output-placement";
import { describe, expect, it } from "vitest";

describe("resolveOutputPlacement", () => {
  describe("auto-detection (no override)", () => {
    it("returns replace_selection when there is a selection", () => {
      expect(resolveOutputPlacement(null, true)).toBe("replace_selection");
    });

    it("returns insert_at_cursor when there is no selection", () => {
      expect(resolveOutputPlacement(null, false)).toBe("insert_at_cursor");
    });
  });

  describe("explicit override", () => {
    it("respects replace_selection when selection exists", () => {
      expect(resolveOutputPlacement("replace_selection", true)).toBe("replace_selection");
    });

    it("falls back replace_selection to insert_at_cursor when no selection", () => {
      expect(resolveOutputPlacement("replace_selection", false)).toBe("insert_at_cursor");
    });

    it("respects insert_at_cursor regardless of selection", () => {
      expect(resolveOutputPlacement("insert_at_cursor", true)).toBe("insert_at_cursor");
      expect(resolveOutputPlacement("insert_at_cursor", false)).toBe("insert_at_cursor");
    });

    it("respects append_to_end regardless of selection", () => {
      expect(resolveOutputPlacement("append_to_end", true)).toBe("append_to_end");
      expect(resolveOutputPlacement("append_to_end", false)).toBe("append_to_end");
    });
  });
});
