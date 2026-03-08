export type OutputPlacementMode = "replace_selection" | "insert_at_cursor" | "append_to_end";

/**
 * Resolve the effective placement mode for an AI action.
 *
 * @param userOverride - Explicit mode chosen by the user in the toolbar picker, or null for auto.
 * @param hasSelection - Whether the editor currently has a non-empty text selection.
 * @returns The placement mode to lock for this action.
 */
export function resolveOutputPlacement(
  userOverride: OutputPlacementMode | null,
  hasSelection: boolean,
): OutputPlacementMode {
  if (userOverride) {
    // Safe fallback: replace_selection without a selection degrades to insert_at_cursor
    if (userOverride === "replace_selection" && !hasSelection) {
      return "insert_at_cursor";
    }
    return userOverride;
  }

  // Default auto-detection
  return hasSelection ? "replace_selection" : "insert_at_cursor";
}
