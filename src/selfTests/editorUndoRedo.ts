import type { TestContext } from "./index";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export async function editorUndoRedo(ctx: TestContext) {
  const path = `${ctx.workspace}/__smoke__/editor-undo-redo.md`;

  await ctx.invoke("save_file", { path, content: "<p>smoke</p>" });
  await ctx.api.openByPath(path);

  // Apply bold
  ctx.api.selectAll();
  ctx.api.toggleBold();
  await ctx.api.save();

  let saved = await ctx.invoke<string>("open_file", { path });
  assert(saved.includes("<strong"), `expected <strong> after bold; got: ${saved.slice(0, 200)}`);

  // Undo bold
  ctx.api.undo();
  await ctx.api.save();
  saved = await ctx.invoke<string>("open_file", { path });
  assert(!saved.includes("<strong"), `expected no <strong> after undo; got: ${saved.slice(0, 200)}`);

  // Redo bold
  ctx.api.redo();
  await ctx.api.save();
  saved = await ctx.invoke<string>("open_file", { path });
  assert(saved.includes("<strong"), `expected <strong> after redo; got: ${saved.slice(0, 200)}`);

  console.log("editor-undo-redo: PASS");
}
