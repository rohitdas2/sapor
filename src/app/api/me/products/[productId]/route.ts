import { requireViewer } from "@/server/auth";
import { handler, readJson } from "@/server/http";
import { myUserProduct, untrack, upsertUserProduct } from "@/server/repo";

type Ctx = { params: Promise<{ productId: string }> };

export const GET = handler(async (_req, ctx: Ctx) => myUserProduct(await requireViewer(), (await ctx.params).productId));
export const PUT = handler(async (req, ctx: Ctx) => upsertUserProduct(await requireViewer(), (await ctx.params).productId, await readJson(req)));
export const DELETE = handler(async (_req, ctx: Ctx) => untrack(await requireViewer(), (await ctx.params).productId));
