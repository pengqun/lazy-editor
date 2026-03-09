import { check } from "@tauri-apps/plugin-updater";
import { toast } from "../stores/toast";

export async function checkForAppUpdate(): Promise<void> {
  try {
    const update = await check();
    if (!update?.available) return;

    toast.info(`Downloading update v${update.version}…`);

    await update.downloadAndInstall();

    // Keep this toast visible for 10 seconds so the user notices
    toast.success("Update installed — restart to apply.", 10_000);
  } catch (error) {
    // Expected to fail when updater signing keys are not yet configured
    console.warn("[updater] check/install failed", error);
  }
}
