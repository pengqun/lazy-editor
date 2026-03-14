import type { KnowledgeState } from "./types";

/**
 * Common post-mutation refresh chain: reload documents then re-run integrity scan.
 * Used by batch and integrity slices after operations that modify KB state.
 */
export async function refreshAfterMutation(get: () => KnowledgeState): Promise<void> {
  await get().loadDocuments();
  await get().checkIntegrity();
}
