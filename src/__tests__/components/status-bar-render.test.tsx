import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusBar } from "@/components/editor/StatusBar";
import { useAiStore } from "@/stores/ai";
import { useEditorStore } from "@/stores/editor";
import { useFilesStore } from "@/stores/files";
import { useWritingGoalsStore } from "@/stores/writing-goals";

describe("StatusBar render optimization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();

    useEditorStore.setState({ wordCount: 100, editor: null });
    useFilesStore.setState({ activeFilePath: "/tmp/test.md", isDirty: false });
    useWritingGoalsStore.setState({ goals: {} });
    useAiStore.setState({
      aiPhase: "idle",
      currentAction: null,
      citations: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("debounces word count display during rapid updates", () => {
    render(<StatusBar />);

    // Initial render shows the initial word count
    expect(screen.getByText("100 words")).toBeTruthy();

    // Simulate rapid typing — word count increments on each keystroke
    act(() => {
      useEditorStore.setState({ wordCount: 101 });
    });
    act(() => {
      useEditorStore.setState({ wordCount: 102 });
    });
    act(() => {
      useEditorStore.setState({ wordCount: 103 });
    });

    // Word count display should still show 100 (debounced, not yet updated)
    expect(screen.getByText("100 words")).toBeTruthy();

    // Advance past the debounce interval (300ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Now the display should show the latest value
    expect(screen.getByText("103 words")).toBeTruthy();
  });

  it("shows singular 'word' for count of 1", () => {
    useEditorStore.setState({ wordCount: 1 });
    render(<StatusBar />);

    // Flush debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("1 word")).toBeTruthy();
  });

  it("does not render AI progress indicator when phase is idle", () => {
    render(<StatusBar />);

    expect(screen.queryByText("Generating content...")).toBeNull();
    expect(screen.queryByText("Searching knowledge base...")).toBeNull();
  });

  it("renders AI progress indicator when phase changes to streaming", () => {
    render(<StatusBar />);

    act(() => {
      useAiStore.setState({ aiPhase: "streaming", currentAction: "draft" });
    });

    expect(screen.getByText("Draft: Generating content...")).toBeTruthy();
  });

  it("renders goal progress when a writing goal is set", () => {
    useWritingGoalsStore.setState({
      goals: { "/tmp/test.md": { target: 200 } },
    });
    useEditorStore.setState({ wordCount: 100 });

    render(<StatusBar />);

    // Flush debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("shows reading time based on debounced word count", () => {
    useEditorStore.setState({ wordCount: 400 }); // 2 min read
    render(<StatusBar />);

    // Flush debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText("2 min read")).toBeTruthy();
  });

  it("does not show file info when no file is active", () => {
    useFilesStore.setState({ activeFilePath: null });
    render(<StatusBar />);

    expect(screen.getByText("No file")).toBeTruthy();
    expect(screen.queryByText(/words?$/)).toBeNull();
  });
});
