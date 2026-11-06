/**
 * User-visible shell bootstrap state. This is separate from KB/embedder
 * degraded mode: the shell should render even when the embedder is missing.
 */
export type AppShellPhase = "loading" | "ready" | "error";
