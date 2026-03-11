import { getUpdateState } from "@/lib/updater";
import { describe, expect, it, vi } from "vitest";

// Mock the updater plugin
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

describe("getUpdateState", () => {
  it("returns idle state initially", () => {
    const { state, error } = getUpdateState();
    expect(state).toBe("idle");
    expect(error).toBeNull();
  });
});
