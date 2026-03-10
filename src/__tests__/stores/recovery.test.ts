import { getAllDraftKeys, persistDraft } from "@/lib/recovery";
import { useRecoveryStore } from "@/stores/recovery";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function clearAllDrafts() {
  for (const key of getAllDraftKeys()) {
    localStorage.removeItem(key);
  }
}

function resetStore() {
  useRecoveryStore.setState({
    pendingDraft: null,
    showRecoveryDialog: false,
  });
}

describe("useRecoveryStore", () => {
  beforeEach(() => {
    clearAllDrafts();
    resetStore();
  });

  afterEach(() => {
    clearAllDrafts();
  });

  it("has correct initial state", () => {
    const state = useRecoveryStore.getState();
    expect(state.pendingDraft).toBeNull();
    expect(state.showRecoveryDialog).toBe(false);
  });

  it("checkOnOpen sets pending draft when recovery draft differs from disk", () => {
    persistDraft("/ws/doc.md", "<p>unsaved</p>");

    useRecoveryStore.getState().checkOnOpen("/ws/doc.md", "<p>saved</p>");

    const state = useRecoveryStore.getState();
    expect(state.showRecoveryDialog).toBe(true);
    expect(state.pendingDraft).not.toBeNull();
    expect(state.pendingDraft!.content).toBe("<p>unsaved</p>");
  });

  it("checkOnOpen does nothing when content matches disk", () => {
    persistDraft("/ws/doc.md", "<p>same</p>");

    useRecoveryStore.getState().checkOnOpen("/ws/doc.md", "<p>same</p>");

    const state = useRecoveryStore.getState();
    expect(state.showRecoveryDialog).toBe(false);
    expect(state.pendingDraft).toBeNull();
  });

  it("checkOnOpen does nothing when no draft exists", () => {
    useRecoveryStore.getState().checkOnOpen("/ws/doc.md", "<p>content</p>");

    const state = useRecoveryStore.getState();
    expect(state.showRecoveryDialog).toBe(false);
    expect(state.pendingDraft).toBeNull();
  });

  it("acceptRecovery returns content and clears state", () => {
    persistDraft("/ws/doc.md", "<p>recovered</p>");
    useRecoveryStore.getState().checkOnOpen("/ws/doc.md", "<p>old</p>");

    const content = useRecoveryStore.getState().acceptRecovery();

    expect(content).toBe("<p>recovered</p>");
    const state = useRecoveryStore.getState();
    expect(state.showRecoveryDialog).toBe(false);
    expect(state.pendingDraft).toBeNull();
    // Draft should be removed from localStorage
    expect(getAllDraftKeys()).toHaveLength(0);
  });

  it("acceptRecovery returns null when no pending draft", () => {
    const content = useRecoveryStore.getState().acceptRecovery();
    expect(content).toBeNull();
  });

  it("discardRecovery clears draft and state", () => {
    persistDraft("/ws/doc.md", "<p>discard me</p>");
    useRecoveryStore.getState().checkOnOpen("/ws/doc.md", "<p>keep</p>");

    useRecoveryStore.getState().discardRecovery();

    const state = useRecoveryStore.getState();
    expect(state.showRecoveryDialog).toBe(false);
    expect(state.pendingDraft).toBeNull();
    // Draft should be removed from localStorage
    expect(getAllDraftKeys()).toHaveLength(0);
  });

  it("discardRecovery is safe to call with no pending draft", () => {
    useRecoveryStore.getState().discardRecovery();
    const state = useRecoveryStore.getState();
    expect(state.showRecoveryDialog).toBe(false);
    expect(state.pendingDraft).toBeNull();
  });
});
