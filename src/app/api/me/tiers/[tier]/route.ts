import type { Tier } from "@/lib/types";
import { requireViewer } from "@/server/auth";
import { handler, oneOf, readJson } from "@/server/http";
import { myTier, saveTierOrder } from "@/server/repo";

type Ctx = { params: Promise<{ tier: string }> };
const tierOf = async (ctx: Ctx) => oneOf((await ctx.params).tier, "tier", ["loved", "fine", "disliked"] as const) as Tier;

export const GET = handler(async (_req, ctx: Ctx) => myTier(await requireViewer(), await tierOf(ctx)));
export const PUT = handler(async (req, ctx: Ctx) => {
  const v = await requireViewer();
  const { order } = await readJson<{ order: unknown }>(req);
  saveTierOrder(v, await tierOf(ctx), order as never);
});
