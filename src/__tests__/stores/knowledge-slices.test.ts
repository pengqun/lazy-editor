import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerStateSlice, useKnowledgeStore } from "@/stores/knowledge";

const mockedInvoke = vi.mocked(invoke);

describe("knowledge store slices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("viewerState slice: viewChunk 成功时更新 chunk 与 query/score", async () => {
    const set = vi.fn();
    const slice = createViewerStateSlice(set);
    const chunk = {
      chunkContent: "content",
      documentTitle: "Doc",
      documentId: 1,
      chunkId: 9,
      chunkIndex: 0,
      totalChunks: 1,
      prevChunk: null,
      nextChunk: null,
    };
    mockedInvoke.mockResolvedValueOnce(chunk);

    await slice.viewChunk(9, "q", 0.5);

    expect(set).toHaveBeenNthCalledWith(1, {
      viewChunkLoading: true,
      viewChunkError: null,
      lastRequestedChunkId: 9,
    });
    expect(set).toHaveBeenNthCalledWith(2, {
      viewedChunk: chunk,
      viewChunkLoading: false,
      viewChunkError: null,
      viewedChunkQuery: "q",
      viewedChunkScore: 0.5,
    });
  });

  it("viewerState slice: setViewChunkError 保持兼容输出", () => {
    const set = vi.fn();
    const slice = createViewerStateSlice(set);

    slice.setViewChunkError("malformed-link");

    expect(set).toHaveBeenCalledWith({
      viewedChunk: null,
      viewChunkLoading: false,
      viewChunkError: {
        kind: "malformed-link",
        message: "Malformed citation link — this reference is invalid.",
      },
    });
  });

  it("兼容层：store 仍暴露原有 viewer action 名称", () => {
    const state = useKnowledgeStore.getState();
    expect(typeof state.viewChunk).toBe("function");
    expect(typeof state.setViewChunkError).toBe("function");
    expect(typeof state.closeChunkViewer).toBe("function");
    expect(typeof state.dismissChunkError).toBe("function");
  });
});
