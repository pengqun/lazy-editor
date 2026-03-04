import type { TestContext } from "./index";

export async function editorBasic({ api, invoke, workspace }: TestContext) {
  const path = `${workspace}/__smoke__/editor.md`;

  await invoke("save_file", { path, content: "<p>smoke</p>" });
  await api.openByPath(path);

  api.selectAll();
  api.toggleHeading(1);
  api.selectAll();
  api.toggleBold();
  await api.save();

  const saved = await invoke<string>("open_file", { path });
  if (!saved.includes("<h1") || !saved.includes("<strong")) {
    throw new Error(`self-test failed: unexpected saved content: ${saved.slice(0, 200)}`);
  }
}
