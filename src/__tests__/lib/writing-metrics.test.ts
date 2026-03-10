import { goalLabel, goalProgress, readingTimeMinutes } from "@/lib/writing-metrics";
import { describe, expect, it } from "vitest";

describe("readingTimeMinutes", () => {
  it("returns 1 for zero words", () => {
    expect(readingTimeMinutes(0)).toBe(1);
  });

  it("returns 1 for small word counts", () => {
    expect(readingTimeMinutes(50)).toBe(1);
    expect(readingTimeMinutes(199)).toBe(1);
  });

  it("rounds up to next minute", () => {
    expect(readingTimeMinutes(201)).toBe(2);
    expect(readingTimeMinutes(400)).toBe(2);
    expect(readingTimeMinutes(401)).toBe(3);
  });

  it("handles large counts", () => {
    expect(readingTimeMinutes(10000)).toBe(50);
  });
});

describe("goalProgress", () => {
  it("returns 0 when target is 0", () => {
    expect(goalProgress(500, 0)).toBe(0);
  });

  it("returns 0 when target is negative", () => {
    expect(goalProgress(500, -100)).toBe(0);
  });

  it("returns correct percentage", () => {
    expect(goalProgress(500, 1000)).toBe(50);
    expect(goalProgress(250, 1000)).toBe(25);
    expect(goalProgress(333, 1000)).toBe(33);
  });

  it("clamps at 100 when over target", () => {
    expect(goalProgress(1500, 1000)).toBe(100);
  });

  it("returns 100 at exact target", () => {
    expect(goalProgress(1000, 1000)).toBe(100);
  });

  it("returns 0 for zero words", () => {
    expect(goalProgress(0, 1000)).toBe(0);
  });
});

describe("goalLabel", () => {
  it("formats with percentage", () => {
    expect(goalLabel(500, 1000)).toBe("500 / 1,000 words (50%)");
  });

  it("handles completion", () => {
    expect(goalLabel(1000, 1000)).toBe("1,000 / 1,000 words (100%)");
  });

  it("handles over-target", () => {
    expect(goalLabel(1500, 1000)).toBe("1,500 / 1,000 words (100%)");
  });
});
