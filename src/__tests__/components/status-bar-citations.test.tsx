import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    cleanup();
  });

  it("provides labels/help text and keeps citation controls in keyboard focus order", () => {
    render(<StatusBar />);

    const controls = screen.getByRole("group", { name: "Citation reference controls" });
    const scoped = within(controls);

    const profileSelect = scoped.getByRole("combobox", { name: "Reference profile" });
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

    // Profile select, save button, style select, chunk, relevance, insert, copy
    // (no delete button when no custom profile is active)
    expect(focusables.length).toBeGreaterThanOrEqual(7);
    expect(focusables[0]).toBe(profileSelect);
    // Save profile button is second
    expect(focusables[2]).toBe(styleSelect);
    expect(focusables[3]).toBe(chunkToggle);
    expect(focusables[4]).toBe(relevanceToggle);
    expect(focusables[5]).toBe(insertButton);
    expect(focusables[6]).toBe(copyButton);

    for (const el of focusables) {
      const tabIndex = el.getAttribute("tabindex");
      expect(tabIndex === null || Number(tabIndex) >= 0).toBe(true);
    }
  });
});
