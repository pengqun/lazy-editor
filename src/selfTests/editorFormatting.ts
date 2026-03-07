import type { TestContext } from "./index";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export async function editorFormatting(ctx: TestContext) {
  const path = `${ctx.workspace}/__smoke__/editor-formatting.md`;

  await ctx.invoke("save_file", { path, content: "<p>alpha</p><p>beta</p>" });
  await ctx.api.openByPath(path);

  // H1
  ctx.api.selectAll();
  ctx.api.toggleHeading(1);

  // Bullet list
  ctx.api.selectAll();
  ctx.api.toggleBulletList();

  // Blockquote
  ctx.api.selectAll();
  ctx.api.toggleBlockquote();

  // HR (insert at current cursor; selectAll is fine)
  ctx.api.insertHorizontalRule();

  await ctx.api.save();
  const saved = await ctx.invoke<string>("open_file", { path });

  assert(saved.includes("<h1"), `expected <h1> in saved content; got: ${saved.slice(0, 200)}`);
  assert(
    saved.includes("<ul") || saved.includes("<ol"),
    `expected list (<ul>/<ol>) in saved content; got: ${saved.slice(0, 200)}`,
  );
  assert(
    saved.includes("<blockquote"),
    `expected <blockquote> in saved content; got: ${saved.slice(0, 200)}`,
  );
  assert(saved.includes("<hr"), `expected <hr> in saved content; got: ${saved.slice(0, 200)}`);

  console.log("editor-formatting: PASS");
}
