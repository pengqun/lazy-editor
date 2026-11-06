import { KnowledgePanel } from "@/components/sidebar/KnowledgePanel";
import { useKnowledgeStore } from "@/stores/knowledge";
import { invoke } from "@tauri-apps/api/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedInvoke = vi.mocked(invoke);

function resetKnowledgeStore() {
  useKnowledgeStore.setState({
    documents: [],
    isIngesting: false,
    ingestProgress: "",
    searchResults: [],
    pinnedDocIds: new Set(),
    retrievalTopK: 5,
    retrievalScope: "all",
    activePreset: null,
    _activeDocPath: null,
    viewedChunk: null,
    lastRequestedChunkId: null,
    viewedChunkQuery: null,
    viewedChunkScore: null,
    viewChunkLoading: false,
    viewChunkError: null,
  });
}

async function openPasteForm() {
  render(createElement(KnowledgePanel));
  fireEvent.click(screen.getByTitle("Paste text to KB"));
  await screen.findByLabelText(/Title/i);
}

describe("KnowledgePanel paste-to-KB form", () => {
  beforeEach(() => {
    resetKnowledgeStore();
    vi.clearAllMocks();
    mockedInvoke.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows title requirement when body is filled but title is blank", async () => {
    await openPasteForm();

    const titleInput = screen.getByLabelText(/Title/i);
    const bodyInput = screen.getByLabelText(/Text to index/i);
    const submit = screen.getByRole("button", { name: "Add to Knowledge Base" });

    fireEvent.change(bodyInput, { target: { value: "Note body for KB" } });

    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Title is required.")).toBeTruthy();
    expect(screen.getByText("Enter a title to add this text to the knowledge base.")).toBeTruthy();
    expect(titleInput.getAttribute("aria-invalid")).toBe("true");
    expect(submit.getAttribute("aria-describedby")).toBe("kb-paste-submit-hint");
    expect(titleInput.getAttribute("aria-describedby")).toBe("kb-paste-title-error");
  });

  it("treats whitespace-only title as missing", async () => {
    await openPasteForm();

    fireEvent.change(screen.getByLabelText(/Text to index/i), {
      target: { value: "Some content" },
    });
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "   " } });

    expect(
      (screen.getByRole("button", { name: "Add to Knowledge Base" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText("Title is required.")).toBeTruthy();
  });

  it("enables submit once title is entered", async () => {
    await openPasteForm();

    fireEvent.change(screen.getByLabelText(/Text to index/i), {
      target: { value: "Note body for KB" },
    });
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "QA label only" } });

    const submit = screen.getByRole("button", { name: "Add to Knowledge Base" });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Title is required.")).toBeNull();
    expect(submit.getAttribute("aria-describedby")).toBeNull();
  });

  it("submits title and body through ingest when the form is complete", async () => {
    await openPasteForm();

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "  My Title  " } });
    fireEvent.change(screen.getByLabelText(/Text to index/i), {
      target: { value: "Indexed text" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add to Knowledge Base" }));

    await vi.waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("ingest_text", {
        title: "  My Title  ",
        text: "Indexed text",
      });
    });
  });
});
