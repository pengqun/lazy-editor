const isMac = navigator.platform.includes("Mac");

/** Platform-aware modifier symbol: "⌘" on Mac, "Ctrl+" on others */
export const modKey = isMac ? "⌘" : "Ctrl+";

/** Platform-aware Shift modifier */
export const shiftKey = isMac ? "⇧" : "Shift+";

