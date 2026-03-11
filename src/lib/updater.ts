import { check } from "@tauri-apps/plugin-updater";
import { toast } from "../stores/toast";

export type UpdateState =
  | "idle"
  | "checking"
  | "no-update"
  | "downloading"
  | "ready"
  | "error";

let currentState: UpdateState = "idle";
let lastError: string | null = null;

export function getUpdateState(): { state: UpdateState; error: string | null } {
  return { state: currentState, error: lastError };
}

export async function checkForAppUpdate(): Promise<void> {
  currentState = "checking";
  lastError = null;

  try {
    const update = await check();

    if (!update?.available) {
      currentState = "no-update";
      return;
    }

    currentState = "downloading";
    toast.info(`Downloading update v${update.version}…`);

    await update.downloadAndInstall();

    currentState = "ready";
    toast.success("Update installed — restart to apply.", 10_000);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error);

    // Signing-key misconfiguration is expected in dev/staging — downgrade to console
    if (msg.includes("sign") || msg.includes("pubkey") || msg.includes("Updater")) {
      console.warn("[updater] check/install failed (expected in dev):", msg);
      currentState = "idle";
      return;
    }

    currentState = "error";
    lastError = msg;
    toast.error(`Update failed: ${msg}`);
  }
}
