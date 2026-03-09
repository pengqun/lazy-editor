import { check } from "@tauri-apps/plugin-updater";

export async function checkForAppUpdate(): Promise<void> {
  try {
    const update = await check();
    if (!update?.available) return;

    const confirmed = window.confirm(`发现新版本 ${update.version}，现在下载并安装？`);
    if (!confirmed) return;

    await update.downloadAndInstall();
    window.alert("更新已安装，请重启应用以完成升级。");
  } catch (error) {
    console.warn("[updater] check/install failed", error);
  }
}
