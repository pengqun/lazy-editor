import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue(42, 300));
    expect(result.current).toBe(42);
  });

  it("does not update the returned value until the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 0 } },
    );

    // Rapidly change the value (simulating keystrokes)
    rerender({ value: 1 });
    rerender({ value: 2 });
    rerender({ value: 3 });

    // Before delay elapses, debounced value is still the initial value
    expect(result.current).toBe(0);

    // Advance time by 299ms — still not updated
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe(0);

    // Advance to 300ms — now it should settle on the latest value
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(3);
  });

  it("resets the timer on each new value (true debounce behavior)", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 10 } },
    );

    // Change value and advance partially
    rerender({ value: 20 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(10);

    // Change again — this should reset the 300ms timer
    rerender({ value: 30 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Still the initial value because the timer was reset
    expect(result.current).toBe(10);

    // After the full delay from the last change
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(30);
  });

  it("updates immediately when delay is 0", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 0),
      { initialProps: { value: 1 } },
    );

    rerender({ value: 2 });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(2);
  });
});
