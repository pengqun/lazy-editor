import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusBar } from "@/components/editor/StatusBar";
import { useAiStore } from "@/stores/ai";
import { useEditorStore } from "@/stores/editor";
import { useFilesStore } from "@/stores/files";
import { useWritingGoalsStore } from "@/stores/writing-goals";

const makeCitation = () => ({
  documentTitle: "Doc A",
  documentId: 1,
  chunkId: 10,
  chunkIndex: 0,
  score: 0.92,
});

describe("StatusBar citation controls", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "lazy-editor:citation-fields",
      JSON.stringify({ showChunkLabel: true, showRelevance: true }),
    );
    localStorage.setItem("lazy-editor:citation-template", "compact");

    useEditorStore.setState({ wordCount: 100, editor: null });
    useFilesStore.setState({ activeFilePath: "/tmp/test.md", isDirty: false });
    useWritingGoalsStore.setState({ goals: {} });
    useAiStore.setState({
      aiPhase: "done",
      currentAction: "draft",
      citations: [makeCitation()],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("provides labels/help text and keeps citation controls in keyboard focus order", () => {
    render(<StatusBar />);

    const controls = screen.getByRole("group", { name: "Citation reference controls" });
    const scoped = within(controls);

    const profileSelect = scoped.getByRole("combobox", { name: "Citation reference profile" });
    const styleSelect = scoped.getByRole("combobox", { name: "Citation reference style" });
    const chunkToggle = scoped.getByRole("button", { name: "Chunk" });
    const relevanceToggle = scoped.getByRole("button", { name: "Relevance" });
    const insertButton = scoped.getByRole("button", { name: "Insert refs" });
    const copyButton = scoped.getByRole("button", { name: "Copy references" });

    expect(scoped.getByText(/select a reference profile or style/i)).toBeTruthy();
    expect(profileSelect.getAttribute("aria-describedby")).toBe("citation-controls-help");
    expect(styleSelect.getAttribute("aria-describedby")).toBe("citation-controls-help");
    expect(chunkToggle.getAttribute("aria-describedby")).toBe("citation-controls-help");
    expect(relevanceToggle.getAttribute("aria-describedby")).toBe("citation-controls-help");
    expect(insertButton.getAttribute("aria-describedby")).toBe("citation-controls-help");
    expect(copyButton.getAttribute("aria-describedby")).toBe("citation-controls-help");
    expect(chunkToggle.getAttribute("aria-pressed")).toBe("true");
    expect(relevanceToggle.getAttribute("aria-pressed")).toBe("true");

    const focusables = Array.from(
      controls.querySelectorAll<HTMLElement>(
        "select, button, a[href], input, textarea, [tabindex]:not([tabindex='-1'])",
      ),
    );

    // Profile select, style select, save, delete, chunk, relevance, insert, copy
    expect(focusables.length).toBeGreaterThanOrEqual(8);
    expect(focusables[0]).toBe(profileSelect);
    expect(focusables[1]).toBe(styleSelect);
    // Save and delete buttons at indices 2-3
    expect(focusables[4]).toBe(chunkToggle);
    expect(focusables[5]).toBe(relevanceToggle);
    expect(focusables[6]).toBe(insertButton);
    expect(focusables[7]).toBe(copyButton);

    for (const el of focusables) {
      const tabIndex = el.getAttribute("tabindex");
      expect(tabIndex === null || Number(tabIndex) >= 0).toBe(true);
    }
  });

  it("auto-switches to manual when toggling fields with a built-in profile selected", () => {
    render(<StatusBar />);

    const controls = screen.getByRole("group", { name: "Citation reference controls" });
    const scoped = within(controls);
    const profileSelect = scoped.getByRole("combobox", { name: "Citation reference profile" }) as HTMLSelectElement;
    const chunkToggle = scoped.getByRole("button", { name: "Chunk" });

    fireEvent.change(profileSelect, { target: { value: "builtin:compact-default" } });
    expect(profileSelect.value).toBe("builtin:compact-default");

    fireEvent.click(chunkToggle);

    expect(profileSelect.value).toBe("");
    expect(scoped.getByText("Switched to manual mode")).toBeTruthy();
  });

  it("shows and clears a temporary profile-select flash on built-in auto-switch", () => {
    vi.useFakeTimers();
    render(<StatusBar />);

    const controls = screen.getByRole("group", { name: "Citation reference controls" });
    const scoped = within(controls);
    const profileSelect = scoped.getByRole("combobox", { name: "Citation reference profile" }) as HTMLSelectElement;
    const relevanceToggle = scoped.getByRole("button", { name: "Relevance" });

    fireEvent.change(profileSelect, { target: { value: "builtin:academic-full" } });
    fireEvent.click(relevanceToggle);

    expect(profileSelect.className.includes("bg-accent/20")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(profileSelect.className.includes("bg-accent/20")).toBe(false);
    expect(scoped.queryByText("Switched to manual mode")).toBeNull();
  });

  it("does not auto-switch custom profiles when toggling fields", () => {
    localStorage.setItem(
      "lazy-editor:reference-profiles",
      JSON.stringify([
        {
          id: "custom:test-profile",
          name: "My Profile",
          templateId: "compact",
          fields: { showChunkLabel: true, showRelevance: true },
        },
      ]),
    );

    render(<StatusBar />);

    const controls = screen.getByRole("group", { name: "Citation reference controls" });
    const scoped = within(controls);
    const profileSelect = scoped.getByRole("combobox", { name: "Citation reference profile" }) as HTMLSelectElement;
    const chunkToggle = scoped.getByRole("button", { name: "Chunk" });

    fireEvent.change(profileSelect, { target: { value: "custom:test-profile" } });
    expect(profileSelect.value).toBe("custom:test-profile");

    fireEvent.click(chunkToggle);

    expect(profileSelect.value).toBe("custom:test-profile");
    expect(scoped.queryByText("Switched to manual mode")).toBeNull();
    expect(profileSelect.className.includes("bg-accent/20")).toBe(false);
  });
});
