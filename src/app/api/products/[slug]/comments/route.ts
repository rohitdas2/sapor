import { getViewer, requireViewer } from "@/server/auth";
import { handler, notFound, readJson, str } from "@/server/http";
import { addProductComment, getProductBySlug, productComments } from "@/server/repo";

type Ctx = { params: Promise<{ slug: string }> };

async function product(ctx: Ctx) {
  const p = getProductBySlug((await ctx.params).slug);
  if (!p) throw notFound("Product not found.");
  return p;
}

export const GET = handler(async (_req, ctx: Ctx) => {
  await getViewer();
  return productComments((await product(ctx)).id);
});

export const POST = handler(async (req, ctx: Ctx) => {
  const v = await requireViewer();
  const body = await readJson<{ body?: unknown; parentId?: unknown }>(req);
  return addProductComment(v, (await product(ctx)).id, str(body.body, "Comment", { min: 1, max: 1000 })!, typeof body.parentId === "string" ? body.parentId : null);
});
